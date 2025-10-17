import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import twilio from 'twilio';
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';

const { VoiceResponse } = twilio.twiml;

// ---------- Paths / app ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const AUDIO_DIR  = path.join(__dirname, 'audio');
fs.mkdirSync(AUDIO_DIR, { recursive: true });

const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio sends x-www-form-urlencoded
app.use(express.json());

const COMPANY     = 'American Developer Group';
const TZ          = process.env.BUSINESS_TZ || 'America/New_York';
const SLOT_MIN    = parseInt(process.env.SLOT_MINUTES || '60', 10);
const WORK_START  = process.env.WORK_START || '09:00';
const WORK_END    = process.env.WORK_END   || '18:00';
const BUFFER_MIN  = parseInt(process.env.MIN_BUFFER_MIN || '120', 10); // не предлагать ближе X минут от "сейчас"

// ---------- Time helpers (нативная речь) ----------
function addMinutes(d, m){ return new Date(d.getTime() + m*60000); }
function toLocal(d){ return new Date(d.toLocaleString('en-US', { timeZone: TZ })); }
function atTime(baseDate, hhmm){
  const [h,m] = hhmm.split(':').map(Number);
  const d = toLocal(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}
function speakTime(d){
  const hh = d.getHours(), mm = d.getMinutes();
  const isPM = hh >= 12;
  let h12 = hh % 12; if (h12 === 0) h12 = 12;
  const min = mm === 0 ? '' : `:${mm.toString().padStart(2,'0')}`;
  const ap = isPM ? 'p.m.' : 'a.m.';
  return `${h12}${min} ${ap}`;
}
function ordinal(n){
  const s = ["th","st","nd","rd"], v = n%100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}
function sameDay(a,b){ return a.toDateString() === b.toDateString(); }
function speakDate(d){
  const now = toLocal(new Date());
  const ld  = toLocal(d);
  const today = new Date(now.toDateString());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  if (sameDay(ld,today)) return 'today';
  if (sameDay(ld,tomorrow)) return 'tomorrow';
  const wd = ld.toLocaleDateString('en-US', { weekday:'long' });
  const num= ordinal(ld.getDate());
  const thisWeekDiff = (ld - today)/86400000;
  if (thisWeekDiff >= 2 && thisWeekDiff <= 6) return `this ${wd}, the ${num}`;
  const month = ld.toLocaleDateString('en-US', { month:'long' });
  return `${wd}, ${month} ${num}`;
}
function humanDateTime(d){ return `${speakDate(d)} at ${speakTime(d)}`; }

// ---------- Slot search & filters ----------
function workingSlots(fromDate, days=14){
  const out=[]; const start=toLocal(fromDate);
  for(let i=0;i<days;i++){
    const day=new Date(start); day.setDate(day.getDate()+i);
    let s=atTime(day, WORK_START); const e=atTime(day, WORK_END);
    if (i===0){
      // учесть буфер
      const minStart = addMinutes(start, BUFFER_MIN);
      while (s < minStart) s = addMinutes(s, SLOT_MIN);
    }
    while (addMinutes(s, SLOT_MIN) <= e){
      out.push({ start:new Date(s), end:addMinutes(s, SLOT_MIN) });
      s = addMinutes(s, SLOT_MIN);
    }
  }
  return out;
}
async function gCal(){
  const auth = new GoogleAuth({
    credentials: { client_email:process.env.GOOGLE_CLIENT_EMAIL, private_key:process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
  let client = await auth.getClient();
  if (process.env.GOOGLE_IMPERSONATE_USER){
    client = auth.fromJSON({
      type:'service_account',
      client_email:process.env.GOOGLE_CLIENT_EMAIL,
      private_key:process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n'),
    });
    client.subject = process.env.GOOGLE_IMPERSONATE_USER;
  }
  return google.calendar({ version:'v3', auth:client });
}
async function findFree(from, days=10){
  const cal = await gCal();
  const timeMin = new Date(from).toISOString();
  const timeMax = addMinutes(new Date(from), days*24*60).toISOString();
  const fb = await cal.freebusy.query({
    requestBody: { timeMin, timeMax, timeZone: TZ, items:[{ id: process.env.CALENDAR_ID }] }
  });
  const busy = (fb.data.calendars?.[process.env.CALENDAR_ID]?.busy || [])
    .map(b=>({ start:new Date(b.start), end:new Date(b.end) }));
  const all = workingSlots(from, days);
  return all.filter(s => !busy.some(b => s.start < b.end && b.start < s.end));
}

// user preference → filters
function deriveFiltersFromText(t){
  const s = (t||'').toLowerCase();
  const res = { day: null, part: null }; // day: Date or weekday index (0-6); part: 'morning'|'afternoon'|'evening'
  // parts of day
  if (/morning/.test(s)) res.part = 'morning';
  else if (/afternoon/.test(s)) res.part = 'afternoon';
  else if (/evening|night/.test(s)) res.part = 'evening';

  // day preferences
  const now = toLocal(new Date());
  const wdMap = { sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6 };
  if (/today/.test(s)) res.day = new Date(now);
  else if (/tomorrow/.test(s)) { const d=new Date(now); d.setDate(d.getDate()+1); res.day=d; }
  else {
    for (const key of Object.keys(wdMap)){
      if (new RegExp(`\\bthis\\s+${key}\\b`).test(s) || new RegExp(`\\b${key}\\b`).test(s)){
        const target = wdMap[key];
        const d=new Date(now);
        const delta = (target - d.getDay() + 7) % 7;
        d.setDate(d.getDate() + (delta===0 ? 7 : delta)); // "this Tuesday" → ближайший следующий
        res.day = d;
        break;
      }
    }
  }
  return res;
}
function applyFilters(slots, filters){
  if (!filters) return slots;
  let out = slots;
  if (filters.day){
    const dayRef = new Date(filters.day);
    out = out.filter(s=> sameDay(s.start, dayRef));
  }
  if (filters.part){
    out = out.filter(s=>{
      const h = s.start.getHours();
      if (filters.part==='morning') return h >= 9 && h < 12;
      if (filters.part==='afternoon') return h >= 12 && h < 16;
      if (filters.part==='evening') return h >= 16 && h < 19;
      return true;
    });
  }
  return out;
}

// ---------- ElevenLabs TTS ----------
async function tts(text){
  const file = path.join(AUDIO_DIR, `${crypto.randomUUID()}.mp3`);
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
    method:'POST',
    headers:{ 'xi-api-key':process.env.ELEVENLABS_API_KEY, 'Content-Type':'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.4, similarity_boost: 0.8 }
    })
  });
  if (!r.ok) throw new Error('TTS error: ' + await r.text());
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(file, buf);
  return `${process.env.BASE_URL}/media/${path.basename(file)}`;
}
app.get('/media/:f',(req,res)=>{
  const f = path.join(AUDIO_DIR, path.basename(req.params.f));
  if (!fs.existsSync(f)) return res.sendStatus(404);
  res.setHeader('Content-Type','audio/mpeg');
  fs.createReadStream(f).pipe(res);
});

// ---------- LLM planner ----------
const SYSTEM_PROMPT = `
You are Verter, chief robot manager and scheduling assistant for American Developer Group (South Florida).
Tone: human, friendly, confident, casual-pro. Keep responses short. Never robotic.

PRIMARY GOAL: schedule a home visit for a 3D scan, design consultation, and detailed renovation estimate.
ALTERNATES:
- Job seeker -> Careers page.
- Construction partners -> Partners form.
- Marketing/other -> email info@americadgroup.com.

DIALOG RULES:
- Capture multiple facts in one sentence (name + need). Ask only what's missing.
- Ask ONE question per turn.
- If intent is remodel/repair and address is unknown → ask for address before availability.
- Day/time flow is two-step:
  1) Ask preference (e.g., “tomorrow morning or this Tuesday?”).
  2) After user responds, THEN offer 2–3 specific time options for that preference.
- Use natural phrasing for dates (“today”, “tomorrow”, “this Tuesday, the 15th”) and times (“9 a.m.”, “2:30 p.m.”).
- Say any greeting like “great to meet you” AT MOST ONCE per call.
- Never end the call yourself unless the caller says they’re done.

ACTIONS (return strict JSON only):
{
  "updates": { "name?": string, "intent?": "remodel|job|partner|marketing|other", "address?": string, "greetedOnce?": boolean },
  "action": "ASK" | "ASK_DAY_PREFERENCE" | "OFFER_SLOTS" | "BOOK" | "ALT_JOB" | "ALT_PARTNER" | "ALT_MARKETING" | "CLOSE_CHECK",
  "chosen_index?": 0|1|2,
  "reply": "what you will say to the caller, concise and friendly"
}

PREFERENCES PARSING:
- If user mentions “tomorrow”, “today”, or weekday names (“this Tuesday”), set ASK_DAY_PREFERENCE first, then OFFER_SLOTS for that day/part (“morning/afternoon/evening”).
- Never combine a broad preference question and specific options in the same turn.

DEFAULTS:
- If unsure, prefer ASK to fill missing info or ASK_DAY_PREFERENCE (then OFFER_SLOTS).
- If caller asks unrelated to remodel/repair, choose ALT_* accordingly.
- After BOOK success, suggest CLOSE_CHECK.
- After ALT_* reply, suggest CLOSE_CHECK.
`;

async function aiPlan(history, state){
  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'system', content: `Current state:\n${JSON.stringify({
        name: state.name||null,
        intent: state.intent||null,
        address: state.address||null,
        greetedOnce: !!state.greetedOnce
      }, null, 2)}` }
    ],
    temperature: 0.3,
    response_format: { type: "json_object" }
  };
  const r = await fetch(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('LLM error: '+await r.text());
  const data = await r.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

// ---------- State & helpers ----------
const calls = new Map(); // CallSid -> { state, history, filters }
function say(vr, text){ vr.say({ language:'en-US' }, text); }
function play(vr, url){ vr.play({}, url); }
function gather(vr, next){
  return vr.gather({
    input:'speech',
    action: next,
    method:'POST',
    enhanced:true,
    timeout:10,
    speechTimeout:'auto',
    actionOnEmptyResult:true
  });
}
function sanitizeReply(reply, state){
  if (!reply) return reply;
  let out = reply;
  if (state.greetedOnce){
    out = out.replace(/\b(great|nice|glad)\s+to\s+meet\s+you\b.*?([.!?]|$)/gi, '');
  }
  // убираем двойные пробелы
  out = out.replace(/\s{2,}/g,' ').trim();
  return out;
}
function negativeIntent(s){
  const t = (s||'').toLowerCase();
  return /\b(no|nope|nah|nothing|i'?m good|that'?s all|that is all|thanks|thank you)\b/.test(t);
}

// ---------- Routes ----------
app.post('/voice', async (req,res)=>{
  const vr = new VoiceResponse();
  say(vr, 'This call may be recorded.');

  const greet = await tts(`Hey there! My name’s Verter — I’m the chief robot manager here at ${COMPANY}. May I have your name, and what can I help you with today?`);
  play(vr, greet);
  gather(vr, '/gather');

  calls.set(req.body.CallSid, {
    state: { phone:req.body.From, greetedOnce:true }, // приветствие уже прозвучало
    history: [{ role:'assistant', content:'Hey there! My name’s Verter — I’m the chief robot manager here at American Developer Group. May I have your name, and what can I help you with today?' }],
    filters: null
  });

  res.type('text/xml').send(vr.toString());
});

app.post('/gather', async (req,res)=>{
  const text = (req.body.SpeechResult||'').trim();
  const sid  = req.body.CallSid;
  const call = calls.get(sid) || { state:{ phone:req.body.From, greetedOnce:true }, history:[], filters:null };

  try {
    // если это ответ на финальный вопрос — обработаем сразу
    if (call.state.awaitingClose){
      const vr = new VoiceResponse();
      if (negativeIntent(text)){
        const bye = await tts(`Alright! Thanks for calling ${COMPANY}. Have a great day!`);
        play(vr, bye); vr.hangup(); calls.delete(sid);
        return res.type('text/xml').send(vr.toString());
      }
      // иначе продолжим: «What else can I help with?»
      call.state.awaitingClose = false;
      const cont = await tts(`Sure — what else can I help you with?`);
      play(vr, cont); gather(vr, '/gather');
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    call.history.push({ role:'user', content:text });
    // Если LLM предложит OFFER_SLOTS, но адрес ещё не известен — заставим спросить адрес
    const preState = { ...call.state };
    let plan = await aiPlan(call.history, call.state);
    // применим updates
    call.state = { ...call.state, ...(plan.updates||{}) };

    // sanitize + одно-вопросное правило
    plan.reply = sanitizeReply(plan.reply, call.state);

    // выбор дня/части суток: сохраняем фильтры и спрашиваем предпочтение
    if (plan.action === 'ASK_DAY_PREFERENCE'){
      const vr = new VoiceResponse();
      const msg = plan.reply || `How about tomorrow morning, or do you prefer this Tuesday?`;
      const url = await tts(msg);
      play(vr, url); gather(vr, '/gather');
      // на следующий вход разберём ответ
      call.filters = null; // обнулим
      call.state.lastAskWasDayPref = true;
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    // если предыдущий вопрос был про предпочтение дня/части суток — разберём ответ и предложим слоты именно по нему
    if (call.state.lastAskWasDayPref){
      call.state.lastAskWasDayPref = false;
      call.filters = deriveFiltersFromText(text);
      plan.action = 'OFFER_SLOTS';
      plan.reply = plan.reply || `Got it — let me take a quick look…`;
    }

    // защитное правило: без адреса не предлагать слоты
    if (plan.action === 'OFFER_SLOTS' && !call.state.address){
      plan.action = 'ASK';
      plan.reply = plan.reply || `Sure. What’s the property address for the visit?`;
    }

    if (['ALT_JOB','ALT_PARTNER','ALT_MARKETING'].includes(plan.action)){
      const vr = new VoiceResponse();
      const url = await tts((plan.reply||'Thanks!') + ' Can I help you with anything else today?');
      play(vr, url); gather(vr, '/gather');
      call.state.awaitingClose = true;
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    if (plan.action === 'OFFER_SLOTS'){
      const allFree = await findFree(new Date(), 10);
      const filtered = applyFilters(allFree, call.filters);
      const shortlist = filtered.slice(0,3);
      call.state.proposed = shortlist;

      const vr = new VoiceResponse();
      let speech;
      if (shortlist.length){
        const options = shortlist.map((s,i)=>`Option ${i+1}: ${humanDateTime(s.start)}.`).join(' ');
        speech = `${plan.reply || 'Here are the first available options.'} ${options} Please say the option number.`;
      } else {
        speech = `I don’t see open time for that preference. Would you like me to check other days or times?`;
      }
      const url = await tts(speech);
      play(vr, url); gather(vr, '/gather');
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    if (plan.action === 'BOOK'){
      const idx = typeof plan.chosen_index === 'number' ? plan.chosen_index : 0;
      const slot = call.state.proposed?.[idx];
      if (!slot){
        // нет выбранного — повторно предложим слоты по текущим фильтрам/по умолчанию
        const vr = new VoiceResponse();
        const allFree = await findFree(new Date(), 10);
        const filtered = applyFilters(allFree, call.filters);
        const shortlist = filtered.slice(0,3);
        call.state.proposed = shortlist;
        const url = await tts(`No problem. Here are the options. ${shortlist.map((s,i)=>`Option ${i+1}: ${humanDateTime(s.start)}.`).join(' ')} Please say the option number.`);
        play(vr, url); gather(vr, '/gather');
        calls.set(sid, call);
        return res.type('text/xml').send(vr.toString());
      }

      // финальная проверка коллизий
      const cal = await gCal();
      const fb = await cal.freebusy.query({
        requestBody:{ timeMin:slot.start.toISOString(), timeMax:slot.end.toISOString(), timeZone: TZ, items:[{ id: process.env.CALENDAR_ID }] }
      });
      const busy = fb.data.calendars?.[process.env.CALENDAR_ID]?.busy || [];
      if (busy.length){
        const vr = new VoiceResponse();
        const url = await tts(`Sorry, that time just became unavailable. Would you like the next available options?`);
        play(vr, url); gather(vr, '/gather');
        calls.set(sid, call);
        return res.type('text/xml').send(vr.toString());
      }

      // бронь
      const cal2 = await gCal();
      await cal2.events.insert({
        calendarId: process.env.CALENDAR_ID,
        requestBody:{
          summary: 'Home visit: 3D scan & estimate',
          description: `Booked by Verter AI.\nName: ${call.state.name||''}\nPhone: ${call.state.phone||''}\nAddress: ${call.state.address||''}\nIntent: ${call.state.intent||''}`,
          start:{ dateTime: slot.start.toISOString(), timeZone: TZ },
          end  :{ dateTime: slot.end.toISOString(),   timeZone: TZ },
          reminders:{ useDefault:true }
        }
      });

      const vr = new VoiceResponse();
      const msg = plan.reply || `All set! You’re booked for ${humanDateTime(slot.start)} at ${call.state.address||'your address'}.`;
      const url = await tts(msg + ' Can I help you with anything else today?');
      play(vr, url); gather(vr, '/gather');
      call.state.awaitingClose = true;
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    if (plan.action === 'CLOSE_CHECK'){
      const vr = new VoiceResponse();
      const url = await tts((plan.reply||'Got it.') + ' Can I help you with anything else today?');
      play(vr, url); gather(vr, '/gather');
      call.state.awaitingClose = true;
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    // ASK (по умолчанию)
    {
      const vr = new VoiceResponse();
      const msg = plan.reply || `Sure. What’s the property address for the visit?`;
      const url = await tts(msg);
      play(vr, url); gather(vr, '/gather');
      // пометить, что приветствие уже было
      call.state.greetedOnce = true;
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

  } catch (e){
    console.error('Planner error:', e);
    const vr = new VoiceResponse();
    const url = await tts(`Sorry, I had a glitch. Want to try again?`);
    play(vr, url); gather(vr, '/gather');
    calls.set(sid, call);
    return res.type('text/xml').send(vr.toString());
  }
});

// (опционально) voicemail
app.post('/voicemail', async (req,res)=>{
  const vr = new VoiceResponse();
  const url = await tts(`Thank you. Your message has been recorded. Goodbye.`);
  play(vr, url); vr.hangup();
  res.type('text/xml').send(vr.toString());
});

app.listen(process.env.PORT || 3000, ()=> console.log('Verter is live'));
