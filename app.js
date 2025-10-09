// app.js — Conversational Twilio bot (EN), OpenAI-driven, ElevenLabs TTS, Google Calendar booking
// deps: npm i express twilio googleapis google-auth-library dotenv openai

import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import twilio from "twilio";
import { GoogleAuth } from "google-auth-library";
import { google } from "googleapis";
import OpenAI from "openai";

dotenv.config();

// ---------- Paths / init ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const {
  PORT = 3000,
  BASE_URL,

  BUSINESS_TZ = "America/New_York",
  SLOT_MINUTES = "130",
  WORK_START = "09:00",
  WORK_END = "18:00",

  ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID,

  GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  GOOGLE_IMPERSONATE_USER,
  CALENDAR_ID,

  OPENAI_API_KEY,
  OPENAI_MODEL = "gpt-4o-mini",

  COMPANY_KB_FILE = "company.json",
  AUDIO_DIR_ENV
} = process.env;

const SLOT_MIN = parseInt(SLOT_MINUTES, 10);
const AUDIO_DIR = AUDIO_DIR_ENV || path.join(__dirname, "audio");
fs.mkdirSync(AUDIO_DIR, { recursive: true });

// ---------- Static media (MP3) ----------
app.get("/media/:file", (req, res) => {
  const f = path.join(AUDIO_DIR, path.basename(req.params.file));
  if (!fs.existsSync(f)) return res.sendStatus(404);
  res.setHeader("Content-Type", "audio/mpeg");
  fs.createReadStream(f).pipe(res);
});

// ---------- Twilio helpers ----------
const { twiml: { VoiceResponse } } = twilio;

function twimlPlayThenGather(url, opts = {}) {
  const r = new VoiceResponse();
  r.play(url);
  r.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    enhanced: true,
    speechTimeout: "auto",
    timeout: 8,
    ...opts
  });
  return r.toString();
}
function twimlRecordThenHangup(url) {
  const r = new VoiceResponse();
  r.play(url);
  r.record({ maxLength: 120, playBeep: true, action: "/voicemail" });
  return r.toString();
}
function twimlHangupWithPlay(url) {
  const r = new VoiceResponse();
  r.play(url);
  r.hangup();
  return r.toString();
}

// ---------- Time helpers ----------
function addMinutes(d, min) { return new Date(d.getTime() + min * 60000); }
function toDayWithTime(date, timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}
function workingSlots(startDate, days = 7) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(startDate);
    day.setDate(day.getDate() + i);
    // if ([0,6].includes(day.getDay())) continue; // skip weekends if needed
    let s = toDayWithTime(day, WORK_START);
    const e = toDayWithTime(day, WORK_END);
    while (s < e) {
      const end = addMinutes(s, SLOT_MIN);
      if (end <= e) out.push({ start: new Date(s), end });
      s = end;
    }
  }
  return out;
}
function subtractBusy(allSlots, busy) {
  return allSlots.filter(slot => {
    return !busy.some(b => {
      const bs = new Date(b.start);
      const be = new Date(b.end);
      return slot.start < be && bs < slot.end; // overlap
    });
  });
}
function enTime(dt) {
  return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function enDate(dt) {
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ---------- ElevenLabs TTS ----------
async function ttsElevenLabs(text) {
  const file = path.join(AUDIO_DIR, `${crypto.randomUUID()}.mp3`);
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.4, similarity_boost: 0.8 }
    })
  });
  if (!resp.ok) throw new Error(`ElevenLabs TTS error: ${await resp.text()}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(file, buf);
  return `${BASE_URL}/media/${path.basename(file)}`;
}

// ---------- Google Calendar ----------
async function gCal() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: GOOGLE_CLIENT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
    },
    scopes: ["https://www.googleapis.com/auth/calendar"]
  });
  let client = await auth.getClient();
  if (GOOGLE_IMPERSONATE_USER) {
    client = auth.fromJSON({
      type: "service_account",
      client_email: GOOGLE_CLIENT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
    });
    client.subject = GOOGLE_IMPERSONATE_USER;
  }
  return google.calendar({ version: "v3", auth: client });
}

async function getThreeSlots() {
  const cal = await gCal();
  const now = new Date();
  const timeMin = now.toISOString();
  const horizonDays = 7;
  const timeMax = new Date(now.getTime() + horizonDays * 86400000).toISOString();

  const fb = await cal.freebusy.query({
    requestBody: {
      timeMin, timeMax,
      items: [{ id: CALENDAR_ID }],
      timeZone: BUSINESS_TZ
    }
  });
  const busy = (fb.data.calendars?.[CALENDAR_ID]?.busy || [])
    .map(b => ({ start: b.start, end: b.end }));

  const all = workingSlots(now, horizonDays);
  const soon = addMinutes(now, 120);
  const free = subtractBusy(all.filter(s => s.start > soon), busy);
  return free.slice(0, 3);
}

async function tryBook(start_iso, end_iso, clientName, details, callSid) {
  const cal = await gCal();
  // final collision check
  const fb = await cal.freebusy.query({
    requestBody: {
      timeMin: start_iso,
      timeMax: end_iso,
      items: [{ id: CALENDAR_ID }],
      timeZone: BUSINESS_TZ
    }
  });
  if ((fb.data.calendars?.[CALENDAR_ID]?.busy || []).length) return false;

  const summaryTitle = `${clientName || "Client"} - estimation`.trim();
  await cal.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: summaryTitle,
      description: `Booked via AI. Call SID: ${callSid}.\nDetails: ${details || "n/a"}`,
      start: { dateTime: start_iso, timeZone: BUSINESS_TZ },
      end:   { dateTime: end_iso,   timeZone: BUSINESS_TZ },
      reminders: { useDefault: true }
    }
  });
  return true;
}

// ---------- OpenAI (LLM) ----------
const oai = new OpenAI({ apiKey: OPENAI_API_KEY });
const KB = JSON.parse(fs.readFileSync(path.join(__dirname, COMPANY_KB_FILE), "utf8"));

const SYSTEM_PROMPT = `
You are a friendly phone receptionist AI for a licensed & insured US General Contractor. English only.

Conversational style:
- Sound natural and human. Acknowledge phatic utterances ("Hi", "Yes") with short backchannel responses and a helpful follow-up question.
- Keep turns short (1–2 sentences) and end most replies with a question to keep the conversation going.
- Never hang up unless explicitly instructed or after voicemail recording completes.

Main goals:
1) If caller needs a REMODEL/ESTIMATE:
   - Gently ask for a bit more detail: which room/area and what needs to be done.
   - Confirm we can do it.
   - Ask if they'd like to book an estimator visit.
   - If yes: FIRST collect the caller's name. After you have the name, call get_free_slots to get 3 options, present them, wait for choice.
   - When caller chooses a slot, call book_selected_slot with start_iso, end_iso, client_name, details (short summary).
   - Confirm the booking.
2) If caller asks about COMPANY INFO:
   - Answer briefly using KB below, then offer to book a visit; same flow (ask name before get_free_slots).
3) If NOT a remodel (spam/partnership/other):
   - Ask for their name and say we’ll call back. Then call end_with_callback to finish politely.

Safety & tools:
- Do NOT invent availability or bookings; ALWAYS use tools.
- Ask for name BEFORE get_free_slots; if you don't have it yet, ask for it.
- Keep replies conversational and human-like; acknowledge “Hi”, “Yeah”, “Okay” etc.

KB (use only for company questions):
about: ${KB.about}
services: ${KB.services}
coverage: ${KB.coverage}
licenses: ${KB.licenses}
warranty: ${KB.warranty}
cta: ${KB.cta}
`;

const tools = [
  {
    type: "function",
    function: {
      name: "get_free_slots",
      description: "Return next available estimator visit slots (3 options). Use only after you collected the caller's name.",
      parameters: {
        type: "object",
        properties: {
          horizon_days: { type: "integer", default: 7, minimum: 1, maximum: 30 }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "book_selected_slot",
      description: "Book chosen time. Calendar event title must be '{client_name} - estimation'.",
      parameters: {
        type: "object",
        properties: {
          start_iso: { type: "string" },
          end_iso:   { type: "string" },
          client_name: { type: "string" },
          details: { type: "string" }
        },
        required: ["start_iso","end_iso","client_name","details"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "end_with_callback",
      description: "Finish politely after collecting the caller's name for a callback.",
      parameters: {
        type: "object",
        properties: {
          client_name: { type: "string", nullable: true }
        }
      }
    }
  }
];

// In-memory call state: CallSid -> { dialog, callSid, clientName, details }
const callState = new Map();

async function llmRespond(dialog, state) {
  const resp = await oai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: dialog,
    tools
  });
  const msg = resp.choices[0].message;

  if (msg.tool_calls && msg.tool_calls.length) {
    const call = msg.tool_calls[0];
    const args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};

    if (call.function.name === "get_free_slots") {
      if (!state.clientName) {
        // Ask for name instead of calling the tool
        return { type: "answer", text: "Sure—what's your name?" };
      }
      const proposed = await getThreeSlots();
      dialog.push(msg);
      dialog.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({
          options: proposed.map(s => ({
            start_iso: s.start.toISOString(),
            end_iso: s.end.toISOString(),
            spoken_date: enDate(s.start),
            spoken_time: enTime(s.start)
          }))
        })
      });
      return await llmRespond(dialog, state);
    }

    if (call.function.name === "book_selected_slot") {
      if (args.client_name) state.clientName = args.client_name;
      if (args.details) state.details = args.details;
      const ok = await tryBook(args.start_iso, args.end_iso, state.clientName || args.client_name, state.details || args.details, state.callSid);
      dialog.push(msg);
      dialog.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ booked: ok })
      });
      return await llmRespond(dialog, state);
    }

    if (call.function.name === "end_with_callback") {
      if (args.client_name) state.clientName = args.client_name;
      return { type: "end_callback", name: state.clientName || null };
    }
  }

  return { type: "answer", text: msg.content || "" };
}

// ---------- Twilio webhooks ----------
app.post("/voice", async (req, res) => {
  try {
    const callSid = req.body?.CallSid || crypto.randomUUID();
    // Friendlier first line; next turns are fully LLM-driven
    const greeting = "Hi, this is American Developer Group. How can I help today?";
    const dialog = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "assistant", content: greeting }
    ];
    callState.set(callSid, { dialog, clientName: null, details: null, callSid });

    const greetUrl = await ttsElevenLabs(greeting);
    res.type("text/xml").send(twimlPlayThenGather(greetUrl));
  } catch (e) {
    console.error(e);
    const errUrl = await ttsElevenLabs("Sorry, something went wrong. Please try again later.");
    res.type("text/xml").send(twimlHangupWithPlay(errUrl));
  }
});

app.post("/gather", async (req, res) => {
  const text = (req.body.SpeechResult || "");
  const callSid = req.body.CallSid;
  const mem = callState.get(callSid) || { dialog: [], clientName: null, details: null, callSid };

  try {
    // Name extraction (handles "my name is...", "this is...", or just "John/John Smith")
    let nm;
    const m1 = text.match(/\b(my name is|this is)\s+([a-z][a-z.' -]{1,60})$/i);
    if (m1) nm = m1[2];
    if (!nm) {
      const m2 = text.trim().match(/^([A-Za-z][A-Za-z.' -]{1,60})$/);
      if (m2) nm = m2[1];
    }
    if (nm) mem.clientName = nm.trim();

    // Details heuristic: keep short
    if (!mem.details && /(kitchen|bath|shower|tile|counter|cabinet|floor|paint|drywall|plumb|elect|full home|whole house)/i.test(text)) {
      mem.details = text.slice(0, 400);
    }

    // Add user turn & ask LLM
    mem.dialog.push({ role: "user", content: text });
    const result = await llmRespond(mem.dialog, mem);

    if (result.type === "end_callback") {
      const msg = mem.clientName
        ? `Thanks, ${mem.clientName}. We will call you back shortly. Goodbye.`
        : `Thanks. We will call you back shortly. Goodbye.`;
      const url = await ttsElevenLabs(msg);
      callState.delete(callSid);
      return res.type("text/xml").send(twimlHangupWithPlay(url));
    }

    // Normal conversational turn (keep-alive)
    const speakUrl = await ttsElevenLabs(result.text || "Okay. Could you tell me a bit more?");
    callState.set(callSid, mem);
    return res.type("text/xml").send(twimlPlayThenGather(speakUrl));

  } catch (e) {
    console.error(e);
    const url = await ttsElevenLabs("Sorry, something went wrong on our side. Please try again later.");
    return res.type("text/xml").send(twimlHangupWithPlay(url));
  }
});

app.post("/voicemail", async (req, res) => {
  const url = await ttsElevenLabs("Thank you. Your message has been recorded. Goodbye.");
  res.type("text/xml").send(twimlHangupWithPlay(url));
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`AI call router listening on :${PORT}`);
  const missing = [];
  if (!BASE_URL) missing.push("BASE_URL");
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) missing.push("ELEVENLABS_*");
  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !CALENDAR_ID) missing.push("GOOGLE_* / CALENDAR_ID");
  if (!OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (missing.length) console.warn("⚠️ Missing env vars:", missing.join(", "));
});
