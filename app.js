// app.js
import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { urlencoded } from "body-parser";
import { xml } from "xmlbuilder2";
import fetch from "node-fetch";
import { GoogleAuth } from "google-auth-library";
import { google } from "googleapis";

const app = express();
app.use(urlencoded({ extended: false }));

// --- Utils ---
const TZ = process.env.BUSINESS_TZ || "America/New_York";
const SLOT_MIN = parseInt(process.env.SLOT_MINUTES || "30", 10);
const WORK_START = process.env.WORK_START || "09:00";
const WORK_END   = process.env.WORK_END   || "18:00";
const AUDIO_DIR = "/mnt/data/tts"; // или ./audio
fs.mkdirSync(AUDIO_DIR, { recursive: true });

function toISODate(date, timeStr, tz=TZ) {
  // date: Date in tz, timeStr "HH:MM"
  const [h,m] = timeStr.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}
function addMinutes(d, min) {
  return new Date(d.getTime() + min*60000);
}
function fmtTwiML(verbs) {
  const root = { Response: verbs };
  return xml(root).end({ prettyPrint: true });
}
async function ttsElevenLabs(text) {
  const file = path.join(AUDIO_DIR, `${crypto.randomUUID()}.mp3`);
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.4, similarity_boost: 0.8 }
    })
  });
  if (!r.ok) throw new Error(`TTS error: ${await r.text()}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(file, buf);
  // Отдаём файл по HTTP:
  return `${process.env.BASE_URL}/media/${path.basename(file)}`;
}
app.get("/media/:file", (req,res) => {
  const f = path.join(AUDIO_DIR, path.basename(req.params.file));
  if (!fs.existsSync(f)) return res.sendStatus(404);
  res.setHeader("Content-Type","audio/mpeg");
  fs.createReadStream(f).pipe(res);
});

// --- Google Calendar auth ---
async function gCalClient() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
    },
    scopes: ["https://www.googleapis.com/auth/calendar"]
  });
  let client = await auth.getClient();
  if (process.env.GOOGLE_IMPERSONATE_USER) {
    client = auth.fromJSON({
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      type: "service_account"
    });
    client.subject = process.env.GOOGLE_IMPERSONATE_USER;
  }
  return google.calendar({ version: "v3", auth: client });
}

// --- Slot generation ---
function workingSlots(startDate, days=7) {
  const slots = [];
  for (let i=0;i<days;i++){
    const day = new Date(startDate);
    day.setDate(day.getDate()+i);
    // Пропуск выходных при желании:
    // if ([0,6].includes(day.getDay())) continue;
    let s = toISODate(day, WORK_START);
    const e = toISODate(day, WORK_END);
    while (s<e){
      const slotEnd = addMinutes(s, SLOT_MIN);
      if (slotEnd<=e) slots.push({ start:new Date(s), end:slotEnd });
      s = slotEnd;
    }
  }
  return slots;
}
function subtractBusy(allSlots, busy) {
  // busy: [{start:{dateTime}, end:{dateTime}}]
  return allSlots.filter(slot=>{
    return !busy.some(b=>{
      const bs = new Date(b.start);
      const be = new Date(b.end);
      // overlap if slot.start < be && bs < slot.end
      return slot.start < be && bs < slot.end;
    });
  });
}

// --- Dialog state (просто в памяти для MVP) ---
const callState = new Map(); // CallSid -> { stage, proposed: [slots], chosen: slot }

// --- Twilio entrypoint ---
app.post("/voice", async (req, res) => {
  // Приветствие + объяснение записи + спросить: нужна встреча? предложения времён?
  const greeting = await ttsElevenLabs(
    "Hello! This call may be recorded to improve service. " +
    "I can help you schedule a meeting. Would you like me to check available time slots?"
  );
  const twiml = fmtTwiML([
    { Play: { "#": greeting }},
    { Gather: {
        "@input":"speech",
        "@action": "/gather",
        "@method":"POST",
        "@enhanced":"true",
        "#": [{ Say: { "@voice":"Polly.Joanna", "#": "Please say yes to find a time, or say no to leave a message." }}]
      }
    }
  ]);
  res.type("text/xml").send(twiml);
});

app.post("/gather", async (req, res) => {
  const text = (req.body.SpeechResult || "").toLowerCase();
  const callSid = req.body.CallSid;
  const state = callState.get(callSid) || {};

  try {
    if (!state.stage) {
      if (text.includes("yes") || text.includes("yeah") || text.includes("sure")) {
        // Получаем busy интервалы и предлагаем 2-3 ближайших окна
        const cal = await gCalClient();
        const now = new Date();
        const timeMin = now.toISOString();
        const daysHorizon = 7;
        const timeMax = new Date(now.getTime()+daysHorizon*24*3600*1000).toISOString();
        const fb = await cal.freebusy.query({
          requestBody: {
            timeMin, timeMax,
            items: [{ id: process.env.CALENDAR_ID }],
            timeZone: TZ
          }
        });
        const busy = (fb.data.calendars?.[process.env.CALENDAR_ID]?.busy || [])
          .map(b=>({ start:b.start, end:b.end }));

        const all = workingSlots(now, daysHorizon);
        const free = subtractBusy(all, busy);
        const proposed = free.slice(0, 3); // три ближайших

        if (proposed.length === 0) {
          const audio = await ttsElevenLabs("Sorry, I don't see any free slots in the next few days. Would you like me to take a message instead?");
          const twiml = fmtTwiML([{ Play: { "#": audio }}, { Hangup: null }]);
          return res.type("text/xml").send(twiml);
        }

        state.stage = "proposed";
        state.proposed = proposed;
        callState.set(callSid, state);

        const optionsSpoken = proposed.map((s,i)=>{
          const d = s.start;
          return `Option ${i+1}: ${d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })} at ${d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' })}.`;
        }).join(" ");
        const audio = await ttsElevenLabs(
          `Here are the first available options. ${optionsSpoken} ` +
          `Please say the option number, like "option one" or "number two".`
        );
        const twiml = fmtTwiML([
          { Play: { "#": audio }},
          { Gather: { "@input":"speech", "@action":"/gather", "@method":"POST", "@enhanced":"true" }}
        ]);
        return res.type("text/xml").send(twiml);
      } else {
        const audio = await ttsElevenLabs("Okay. Please leave your message after the tone.");
        const twiml = fmtTwiML([
          { Play: { "#": audio }},
          { Record: { "@maxLength":"60", "@playBeep":"true", "@action":"/voicemail" } }
        ]);
        return res.type("text/xml").send(twiml);
      }
    }

    if (state.stage === "proposed") {
      // распознать "option one/two/three"
      let idx = -1;
      if (text.match(/(one|1)/)) idx = 0;
      else if (text.match(/(two|2|to|too)/)) idx = 1;
      else if (text.match(/(three|3)/)) idx = 2;

      if (idx < 0 || !state.proposed[idx]) {
        const audio = await ttsElevenLabs("Sorry, I didn't catch that. Please say option one, option two, or option three.");
        const twiml = fmtTwiML([
          { Play: { "#": audio }},
          { Gather: { "@input":"speech", "@action":"/gather", "@method":"POST", "@enhanced":"true" }}
        ]);
        return res.type("text/xml").send(twiml);
      }

      state.chosen = state.proposed[idx];
      state.stage = "confirm";
      callState.set(callSid, state);

      const d = state.chosen.start;
      const confirm = await ttsElevenLabs(
        `Great. You chose ${d.toLocaleDateString('en-US',{weekday:'long', month:'long', day:'numeric'})} at ${d.toLocaleTimeString('en-US',{hour:'numeric', minute:'2-digit'})}. Shall I book it? Please say yes to confirm.`
      );
      const twiml = fmtTwiML([
        { Play: { "#": confirm }},
        { Gather: { "@input":"speech", "@action":"/gather", "@method":"POST", "@enhanced":"true" }}
      ]);
      return res.type("text/xml").send(twiml);
    }

    if (state.stage === "confirm") {
      if (text.includes("yes")) {
        // финальная проверка коллизий и бронь
        const cal = await gCalClient();
        const s = state.chosen.start;
        const e = state.chosen.end;
        // повторная FreeBusy только на выбранный интервал:
        const fb = await cal.freebusy.query({
          requestBody: {
            timeMin: s.toISOString(),
            timeMax: e.toISOString(),
            items: [{ id: process.env.CALENDAR_ID }],
            timeZone: TZ
          }
        });
        const busy = fb.data.calendars?.[process.env.CALENDAR_ID]?.busy || [];
        if (busy.length) {
          const audio = await ttsElevenLabs("Sorry, that time just became unavailable. Would you like me to read the next available options?");
          state.stage = null;
          callState.set(callSid, state);
          const twiml = fmtTwiML([
            { Play: { "#": audio }},
            { Gather: { "@input":"speech", "@action":"/gather", "@method":"POST", "@enhanced":"true" }}
          ]);
          return res.type("text/xml").send(twiml);
        }

        // создаём событие
        await cal.events.insert({
          calendarId: process.env.CALENDAR_ID,
          requestBody: {
            summary: "Phone booking",
            description: `Booked via AI by phone call ${callSid}`,
            start: { dateTime: s.toISOString(), timeZone: TZ },
            end:   { dateTime: e.toISOString(), timeZone: TZ },
            // conferenceData: { createRequest: { requestId: crypto.randomUUID() } }, // если нужен Meet
            reminders: { useDefault: true }
          },
          // conferenceDataVersion: 1
        });

        const ok = await ttsElevenLabs("All set! Your meeting is booked. You will receive a confirmation if we have your email. Have a great day. Goodbye!");
        callState.delete(callSid);
        const twiml = fmtTwiML([{ Play: { "#": ok }}, { Hangup: null }]);
        return res.type("text/xml").send(twiml);
      } else {
        const audio = await ttsElevenLabs("Understood. Would you like me to offer other time slots?");
        state.stage = null;
        callState.set(callSid, state);
        const twiml = fmtTwiML([
          { Play: { "#": audio }},
          { Gather: { "@input":"speech", "@action":"/gather", "@method":"POST", "@enhanced":"true" }}
        ]);
        return res.type("text/xml").send(twiml);
      }
    }

    // fallback
    const audio = await ttsElevenLabs("Sorry, I did not understand. Let’s try again. Would you like me to check available time slots?");
    state.stage = null;
    callState.set(callSid, state);
    const twiml = fmtTwiML([
      { Play: { "#": audio }},
      { Gather: { "@input":"speech", "@action":"/gather", "@method":"POST", "@enhanced":"true" }}
    ]);
    res.type("text/xml").send(twiml);
  } catch (e) {
    console.error(e);
    const audio = await ttsElevenLabs("Sorry, something went wrong on our side. Please try again later.");
    const twiml = fmtTwiML([{ Play: { "#": audio }}, { Hangup: null }]);
    res.type("text/xml").send(twiml);
  }
});

app.post("/voicemail", async (req,res)=>{
  const audio = await ttsElevenLabs("Thank you. Your message has been recorded. Goodbye.");
  const twiml = fmtTwiML([{ Play: { "#": audio }}, { Hangup: null }]);
  res.type("text/xml").send(twiml);
});

app.listen(process.env.PORT || 3000, ()=>console.log("OK"));
