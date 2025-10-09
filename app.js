// app.js — Twilio inbound -> OpenAI dialog (EN only) -> ElevenLabs TTS -> Google Calendar booking
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
  // Infra
  PORT = 3000,
  BASE_URL,

  // Timezone & slots
  BUSINESS_TZ = "America/New_York",
  SLOT_MINUTES = "30",
  WORK_START = "09:00",
  WORK_END = "18:00",

  // ElevenLabs
  ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID,

  // Google Calendar (Service Account)
  GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  GOOGLE_IMPERSONATE_USER,        // optional (Workspace + Domain-wide Delegation)
  CALENDAR_ID,

  // OpenAI
  OPENAI_API_KEY,
  OPENAI_MODEL = "gpt-4o-mini",

  // KB
  COMPANY_KB_FILE = "company.json",

  // Audio cache dir
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

// ---------- Helpers ----------
const { twiml: { VoiceResponse } } = twilio;

function twimlPlay(url) {
  const r = new VoiceResponse();
  r.play(url);
  return r.toString();
}
function twimlPlayThenGather(url, opts = {}) {
  const r = new VoiceResponse();
  r.play(url);
  r.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    enhanced: true,
    ...opts
  });
  return r.toString();
}
function twimlRecordThenHangup(url) {
  const r = new VoiceResponse();
  r.play(url);
  r.record({ maxLength: 90, playBeep: true, action: "/voicemail" });
  return r.toString();
}
function twimlHangupWithPlay(url) {
  const r = new VoiceResponse();
  r.play(url);
  r.hangup();
  return r.toString();
}

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

// ---------- ElevenLabs TTS (EN only) ----------
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
You are a phone receptionist AI for a licensed & insured General Contractor. English only.

Objectives and strict flow:
1) Greet and ask how we can help.
2) If the caller needs a REMODEL/ESTIMATE:
   - Briefly collect details: which room/area and what needs to be done (e.g., kitchen cabinets & countertops; bathroom shower & tile; flooring; painting; full home).
   - Say we can handle it.
   - Ask if they'd like to book an estimator visit.
   - If they agree: FIRST ask for the caller's name. AFTER you have the name, call get_free_slots to get 3 options. Offer them and wait for choice.
   - When the caller chooses a time slot, call book_selected_slot with: start_iso, end_iso, client_name, details (short summary from what they said).
   - Confirm the booking.
3) If the caller asks about COMPANY INFO:
   - Answer briefly using KB below.
   - Then ask if they'd like to book an estimator visit; follow the same booking flow as above (ask for name before calling get_free_slots).
4) If NOT a remodel request (spam/partnership/other):
   - Ask for their name and say we'll call them back. Then call end_with_callback tool to finish the call.

Rules:
- Be concise, friendly, phone-ready.
- Do NOT invent calendar availability or bookings; always use tools.
- Do NOT switch language; US English only.
- When you ask for a name or details, wait for the next user message before taking further actions.

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
      description: "Book the chosen time for an estimator visit. The calendar event title must be '{client_name} - estimation'.",
      parameters: {
        type: "object",
        properties: {
          start_iso: { type: "string", description: "ISO start in BUSINESS_TZ" },
          end_iso:   { type: "string", description: "ISO end in BUSINESS_TZ" },
          client_name: { type: "string", description: "Caller name, e.g. John Smith" },
          details: { type: "string", description: "Short summary of room/area and tasks" }
        },
        required: ["start_iso","end_iso","client_name","details"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "end_with_callback",
      description: "Finish the call politely after collecting the caller's name for a callback.",
      parameters: {
        type: "object",
        properties: {
          client_name: { type: "string", description: "Caller name if provided", nullable: true }
        }
      }
    }
  }
];

// In-memory call state
// CallSid -> { dialog, callSid, clientName, details }
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
      // persist name & details to state for logging if wanted
      if (args.client_name) state.clientName = args.client_name;
      if (args.details) state.details = args.details;

      const ok = await tryBook(args.start_iso, args.end_iso, args.client_name, args.details, state.callSid);
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
    // First assistant line (model will handle the rest on next turn)
    const greeting = "Hi! This is American Developer Group. How can we help you today?";
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
    // naive extraction (optional): if user says "my name is John"
    const nameMatch = text.match(/\b(my name is|this is)\s+([a-z][a-z.' -]+)$/i);
    if (nameMatch) mem.clientName = nameMatch[2].trim();

    // add user turn
    mem.dialog.push({ role: "user", content: text });

    const result = await llmRespond(mem.dialog, mem);

    if (result.type === "end_callback") {
      const msg = result.name
        ? `Thanks, ${result.name}. We will call you back shortly. Goodbye.`
        : `Thanks. We will call you back shortly. Goodbye.`;
      const url = await ttsElevenLabs(msg);
      callState.delete(callSid);
      return res.type("text/xml").send(twimlHangupWithPlay(url));
    }

    if (result.type === "answer") {
      callState.set(callSid, mem);
      const speakUrl = await ttsElevenLabs(result.text);
      return res.type("text/xml").send(twimlPlayThenGather(speakUrl));
    }

    const url = await ttsElevenLabs("Sorry, I didn't catch that. Could you repeat, please?");
    return res.type("text/xml").send(twimlPlayThenGather(url));
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
