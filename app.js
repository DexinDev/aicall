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
function sameDay(a,b){ return a.toDateString() === b.toDateString(); }
function ordinal(n){ const s=["th","st","nd","rd"], v=n%100; return n + (s[(v-20)%10] || s[v] || s[0]); }
function speakTime(d){
  const hh = d.getHours(), mm = d.getMinutes();
  const isPM = hh >= 12;
  let h12 = hh % 12; if (h12 === 0) h12 = 12;
  const min = mm === 0 ? '' : `:${mm.toString().padStart(2,'0')}`;
  const ap = isPM ? 'p.m.' : 'a.m.';
  return `${h12}${min} ${ap}`;
}
function speakDate(d){
  const now = toLocal(new Date());
  const ld  = toLocal(d);
  const today = new Date(now.toDateString());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  if (sameDay(ld,today)) return 'today';
  if (sameDay(ld,tomorrow)) return 'tomorrow';
  const wd = ld.toLocaleDateString('en-US', { weekday:'long' });
  const num= ordinal(ld.getDate());
  const diff=(ld - today)/86400000;
  if (diff>=2 && diff<=6) return `this ${wd}, the ${num}`;
  const month = ld.toLocaleDateString('en-US', { month:'long' });
  return `${wd}, ${month} ${num}`;
}
function humanDateTime(d){ return `${speakDate(d)} at ${speakTime(d)}`; }

// ---------- Slots / Calendar ----------
function workingSlots(fromDate, days=14){
  const out=[]; const start=toLocal(fromDate);
  for(let i=0;i<days;i++){
    const day=new Date(start); day.setDate(day.getDate()+i);
    let s=atTime(day, WORK_START); const e=atTime(day, WORK_END);
    if (i===0){
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
    client = auth.fromJSON({ type:'service_account', client_email:process.env.GOOGLE_CLIENT_EMAIL, private_key:process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') });
    client.subject = process.env.GOOGLE_IMPERSONATE_USER;
  }
  return google.calendar({ version:'v3', auth:client });
}
async function findFree(from, days=10){
  const cal = await gCal();
  const timeMin = new Date(from).toISOString();
  const timeMax = addMinutes(new Date(from), days*24*60).toISOString();
  const fb = await cal.freebusy.query({ requestBody: { timeMin, timeMax, timeZone: TZ, items:[{ id: process.env.CALENDAR_ID }] } });
  const busy = (fb.data.calendars?.[process.env.CALENDAR_ID]?.busy || []).map(b=>({ start:new Date(b.start), end:new Date(b.end) }));
  const all = workingSlots(from, days);
  return all.filter(s => !busy.some(b => s.start < b.end && b.start < s.end));
}

// ---------- Preference filters ----------
function deriveFiltersFromText(t){
  const s = (t||'').toLowerCase();
  const res = { day: null, part: null }; // day: Date; part: 'morning'|'afternoon'|'evening'
  if (/morning/.test(s)) res.part = 'morning';
  else if (/afternoon/.test(s)) res.part = 'afternoon';
  else if (/evening|night/.test(s)) res.part = 'evening';

  const now = toLocal(new Date());
  const wdMap = { sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6 };
  if (/\btoday\b/.test(s)) res.day = new Date(now);
  else if (/\btomorrow\b/.test(s)) { const d=new Date(now); d.setDate(d.getDate()+1); res.day=d; }
  else {
    for (const key of Object.keys(wdMap)){
      if (new RegExp(`\\b(this\\s+)?${key}\\b`).test(s)){
        const target = wdMap[key];
        const d=new Date(now);
        let delta = (target - d.getDay() + 7) % 7;
        if (delta === 0) delta = 7; // next same weekday
        d.setDate(d.getDate() + delta);
        res.day = d; break;
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
  const normalized = normalizeCanonicalUrls(text);
  const file = path.join(AUDIO_DIR, `${crypto.randomUUID()}.mp3`);
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
    method:'POST',
    headers:{ 'xi-api-key':process.env.ELEVENLABS_API_KEY, 'Content-Type':'application/json' },
    body: JSON.stringify({
      text: normalized,
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

// ---------- Canonical website/email phrasing ----------
function normalizeCanonicalUrls(text){
  if (!text) return text;
  let t = text;

  // Replace any messy mentions with canonical spoken templates
  const canon = {
    CAREERS: "america d group dot com slash careers",
    PARTNERS: "america d group dot com slash partners",
    FAQ: "america d group dot com slash f-a-q",
    SITE: "america d group dot com",
    EMAIL: "info at america d group dot com"
  };

  // Careers
  t = t.replace(/americadgroup\.com[\/\.]?\s*careers/gi, canon.CAREERS);
  t = t.replace(/america d group dot com( dot)? (slash )?careers/gi, canon.CAREERS);

  // Partners
  t = t.replace(/americadgroup\.com[\/\.]?\s*partners/gi, canon.PARTNERS);
  t = t.replace(/america d group dot com( dot)? (slash )?partners/gi, canon.PARTNERS);

  // FAQ
  t = t.replace(/americadgroup\.com[\/\.]?\s*faq/gi, canon.FAQ);
  t = t.replace(/america d group dot com( dot)? (slash )?faq/gi, canon.FAQ);

  // Root site
  t = t.replace(/americadgroup\.com/gi, canon.SITE);

  // Email
  t = t.replace(/info@americadgroup\.com/gi, canon.EMAIL);
  t = t.replace(/info at americadgroup dot com/gi, canon.EMAIL);

  // Collapse spaces
  return t.replace(/\s{2,}/g, ' ').trim();
}

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
- Day/time is two-step:
  1) Ask preference (“tomorrow morning or this Tuesday?”).
  2) After user responds, THEN offer 2–3 options for that preference.
- Use natural dates (“today”, “tomorrow”, “this Tuesday, the 15th”) and times (“9 a.m.”, “2:30 p.m.”).
- Say any greeting like “great to meet you” AT MOST ONCE per call.
- Never choose CLOSE_CHECK unless booking succeeded or an ALT_* reply has been given.
- If user mentions remodel/repair intents, DO NOT choose CLOSE_CHECK; move scheduling forward.

ACTIONS (return strict JSON only):
{
  "updates": { "name?": string, "intent?": "remodel|job|partner|marketing|other", "address?": string, "greetedOnce?": boolean },
  "action": "ASK" | "ASK_DAY_PREFERENCE" | "OFFER_SLOTS" | "BOOK" | "ALT_JOB" | "ALT_PARTNER" | "ALT_MARKETING" | "CLOSE_CHECK",
  "chosen_index?": 0|1|2,
  "reply": "what you will say to the caller, concise and friendly"
}

DEFAULTS:
- Prefer ASK/ASK_DAY_PREFERENCE/OFFER_SLOTS to progress scheduling.
- After BOOK success or ALT_* reply, suggest CLOSE_CHECK (one line).
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

// ---------- Deterministic selection parsing ----------
function parseNumberChoice(text){
  const t=(text||'').toLowerCase();
  if (/(^|\b)(option\s*)?(one|first|1)\b/.test(t)) return 0;
  if (/(^|\b)(option\s*)?(two|second|2|too|to)\b/.test(t)) return 1;
  if (/(^|\b)(option\s*)?(three|third|3)\b/.test(t)) return 2;
  return -1;
}
function matchNaturalToProposed(text, proposed){
  if (!proposed || !proposed.length) return -1;
  const t=(text||'').toLowerCase();
  // crude weekday & time hints
  const wdMap = { sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6 };
  let targetWd = null;
  for(const key of Object.keys(wdMap)){ if (new RegExp(`\\b${key}\\b`).test(t)) { targetWd = wdMap[key]; break; } }
  // time: hh[:mm] am/pm or hh.mm
  const m = t.match(/(\b([1-9]|1[0-2])([:\.][0-5][0-9])?\s*(a\.?m\.?|p\.?m\.?)\b)|\b([01]?\d|2[0-3])([:\.][0-5][0-9])?\b/);
  let targetMins = null; // minutes since midnight local
  if (m){
    let raw = m[0].replace(/\./g,'').trim(); // remove dots in am/pm
    let hhmm = raw.match(/(\d{1,2})([:\.](\d{2}))?/);
    if (hhmm){
      let hh = parseInt(hhmm[1],10);
      const mm = hhmm[3] ? parseInt(hhmm[3],10) : 0;
      const ap = /pm/i.test(raw) ? 'pm' : (/am/i.test(raw) ? 'am' : null);
      if (ap === 'pm' && hh < 12) hh += 12;
      if (ap === 'am' && hh === 12) hh = 0;
      targetMins = hh*60 + mm;
    }
  }
  // score proposed slots
  let bestIdx=-1, bestScore=1e9;
  for(let i=0;i<proposed.length;i++){
    const d = proposed[i].start;
    let score = 0;
    if (targetWd !== null){
      const diffWd = Math.min((Math.abs(d.getDay()-targetWd)), 7-Math.abs(d.getDay()-targetWd));
      score += diffWd*1000; // heavy weight by weekday
    }
    if (targetMins !== null){
      const mins = d.getHours()*60 + d.getMinutes();
      score += Math.abs(mins - targetMins);
    }
    if (score < bestScore){ bestScore=score; bestIdx=i; }
  }
  return bestIdx;
}

// ---------- State & helpers ----------
const calls = new Map(); // CallSid -> { state, history, filters }
function say(vr, text){ vr.say({ language:'en-US' }, text); }
function play(vr, url){ vr.play({}, url); }
function gather(vr, next, withDtmf=false){
  const params = {
    input: withDtmf ? 'speech dtmf' : 'speech',
    action: next,
    method: 'POST',
    enhanced: true,
    timeout: 10,
    speechTimeout: 'auto',
    actionOnEmptyResult: true
  };
  if (withDtmf) params.numDigits = 1;
  return vr.gather(params);
}
function sanitizeReply(reply, state){
  if (!reply) return reply;
  let out = reply;
  if (state.greetedOnce){
    out = out.replace(/\b(great|nice|glad)\s+to\s+meet\s+you\b.*?([.!?]|$)/gi, '');
  }
  out = out.replace(/\s{2,}/g,' ').trim();
  return out;
}
function negativeIntent(s){
  const t=(s||'').toLowerCase();
  return /\b(no|nope|nah|nothing|i'?m good|that'?s all|that is all|thanks|thank you|we're good|we are good)\b/.test(t);
}
function isRemodelIntent(s){
  const t=(s||'').toLowerCase();
  return /(remodel|renovat|repair|bath(room)?|kitchen|estimate|scan|design|floor|paint)/.test(t);
}

// ---------- Entry ----------
app.post('/voice', async (req,res)=>{
  const vr = new VoiceResponse();
  say(vr, 'This call may be recorded.');
  const greet = await tts(`Hey there! My name’s Verter — I’m the chief robot manager here at ${COMPANY}. May I have your name, and what can I help you with today?`);
  play(vr, greet);
  gather(vr, '/gather');

  calls.set(req.body.CallSid, {
    state: { phone:req.body.From, greetedOnce:true, lastAction:null, offerAttempts:0, awaitingClose:false },
    history: [{ role:'assistant', content:'Hey there! My name’s Verter — I’m the chief robot manager here at American Developer Group. May I have your name, and what can I help you with today?' }],
    filters: null
  });

  res.type('text/xml').send(vr.toString());
});

// ---------- Core handler ----------
app.post('/gather', async (req,res)=>{
  const text = (req.body.SpeechResult||'').trim();
  const sid  = req.body.CallSid;
  const call = calls.get(sid) || { state:{ phone:req.body.From, greetedOnce:true, lastAction:null, offerAttempts:0, awaitingClose:false }, history:[], filters:null };

  try {
    // Final courtesy close check
    if (call.state.awaitingClose){
      const vr = new VoiceResponse();
      if (negativeIntent(text)){
        const bye = await tts(`Alright! Thanks for calling ${COMPANY}. Have a great day!`);
        play(vr, bye); vr.hangup(); calls.delete(sid);
        return res.type('text/xml').send(vr.toString());
      }
      call.state.awaitingClose = false;
      const cont = await tts(`Sure — what else can I help you with?`);
      play(vr, cont); gather(vr, '/gather');
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    // ===== Deterministic selection if last step was OFFER_SLOTS =====
    if (call.state.lastAction === 'OFFER_SLOTS' && call.state.proposed?.length){
      // Try DTMF digit first
      if (req.body.Digits && /^[123]$/.test(req.body.Digits)){
        const idx = parseInt(req.body.Digits,10)-1;
        return await confirmChosen(idx);
      }
      // Try spoken number
      const numIdx = parseNumberChoice(text);
      if (numIdx >= 0 && call.state.proposed[numIdx]) return await confirmChosen(numIdx);

      // Try natural date/time matching
      const natIdx = matchNaturalToProposed(text, call.state.proposed);
      if (natIdx >= 0 && call.state.proposed[natIdx]) return await confirmChosen(natIdx);

      // Could not parse selection → offer again; after 2 tries add DTMF fallback
      call.state.offerAttempts = (call.state.offerAttempts||0)+1;
      const useDtmf = call.state.offerAttempts >= 2;
      const vr = new VoiceResponse();
      const prompt = useDtmf
        ? `Sorry, I didn’t catch that. Please say “option one”, “option two”, or “option three” — or press 1, 2, or 3.`
        : `Sorry, I didn’t catch that. Please say “option one”, “option two”, or “option three”.`;
      const url = await tts(prompt);
      play(vr, url); gather(vr, '/gather', useDtmf);
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    // ===== Ask-day preference flow guard =====
    if (call.state.lastAskWasDayPref){
      call.state.lastAskWasDayPref = false;
      call.filters = deriveFiltersFromText(text);
      // proceed to offering slots filtered
      await doOfferSlots('Got it — let me take a quick look…');
      return;
    }

    // ===== Delegate to LLM planner =====
    call.history.push({ role:'user', content:text });
    let plan = await aiPlan(call.history, call.state);

    // Apply updates
    call.state = { ...call.state, ...(plan.updates||{}) };
    plan.reply = sanitizeReply(plan.reply, call.state);

    // Guards for CLOSE_CHECK misuse
    if (plan.action === 'CLOSE_CHECK' && (isRemodelIntent(text) || !call.state.awaitingClose)){
      plan.action = 'ASK'; // force continue
      plan.reply = plan.reply || `Got it. What’s the property address for the visit?`;
    }

    // Ask day preference (first step)
    if (plan.action === 'ASK_DAY_PREFERENCE'){
      const vr = new VoiceResponse();
      const msg = plan.reply || `How about tomorrow morning, or do you prefer this Tuesday?`;
      const url = await tts(msg);
      play(vr, url); gather(vr, '/gather');
      call.filters = null;
      call.state.lastAskWasDayPref = true;
      call.state.lastAction = 'ASK_DAY_PREFERENCE';
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    // Never offer slots without address
    if (plan.action === 'OFFER_SLOTS' && !call.state.address){
      plan.action = 'ASK';
      plan.reply = plan.reply || `Sure. What’s the property address for the visit?`;
    }

    if (['ALT_JOB','ALT_PARTNER','ALT_MARKETING'].includes(plan.action)){
      const vr = new VoiceResponse();
      const url = await tts((plan.reply||'Thanks!') + ' Can I help you with anything else today?');
      play(vr, url); gather(vr, '/gather');
      call.state.awaitingClose = true;
      call.state.lastAction = 'ALT';
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    if (plan.action === 'OFFER_SLOTS'){
      await doOfferSlots(plan.reply || 'Here are the first available options.');
      return;
    }

    if (plan.action === 'BOOK'){
      const idx = typeof plan.chosen_index === 'number' ? plan.chosen_index : 0;
      return await bookChosen(idx, plan.reply);
    }

    if (plan.action === 'CLOSE_CHECK'){
      const vr = new VoiceResponse();
      const url = await tts((plan.reply||'Got it.') + ' Can I help you with anything else today?');
      play(vr, url); gather(vr, '/gather');
      call.state.awaitingClose = true;
      call.state.lastAction = 'CLOSE_CHECK';
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    // ASK (default)
    {
      const vr = new VoiceResponse();
      const msg = plan.reply || `Sure. What’s the property address for the visit?`;
      const url = await tts(msg);
      play(vr, url); gather(vr, '/gather');
      call.state.greetedOnce = true;
      call.state.lastAction = 'ASK';
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    // ---- helpers in scope ----
    async function doOfferSlots(prefix){
      const allFree = await findFree(new Date(), 10);
      const filtered = applyFilters(allFree, call.filters);
      const shortlist = filtered.slice(0,3);
      call.state.proposed = shortlist;
      call.state.offerAttempts = 0;

      const vr = new VoiceResponse();
      let speech;
      if (shortlist.length){
        const options = shortlist.map((s,i)=>`Option ${i+1}: ${humanDateTime(s.start)}.`).join(' ');
        speech = `${prefix} ${options} Please say the option number.`;
      } else {
        speech = `I don’t see open time for that preference. Would you like me to check other days or times?`;
      }
      const url = await tts(speech);
      play(vr, url); gather(vr, '/gather');
      call.state.lastAction = 'OFFER_SLOTS';
      calls.set(sid, call);
      res.type('text/xml').send(vr.toString());
    }

    async function confirmChosen(idx){
      const slot = call.state.proposed?.[idx];
      if (!slot){
        const vr = new VoiceResponse();
        const url = await tts(`Sorry, that option isn’t available. Would you like me to read the options again?`);
        play(vr, url); gather(vr, '/gather');
        calls.set(sid, call);
        return res.type('text/xml').send(vr.toString());
      }
      call.state.chosenIndex = idx;
      const vr = new VoiceResponse();
      const msg = `Perfect. ${humanDateTime(slot.start)}, at ${call.state.address || 'your address'}. Shall I book it?`;
      const url = await tts(msg);
      play(vr, url); gather(vr, '/gather');
      call.state.lastAction = 'CONFIRM';
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    async function bookChosen(idx, customReply){
      const slot = call.state.proposed?.[idx];
      if (!slot){
        return await doOfferSlots('No problem. Here are the options.');
      }
      // Final collision check
      const cal = await gCal();
      const fb = await cal.freebusy.query({ requestBody:{ timeMin:slot.start.toISOString(), timeMax:slot.end.toISOString(), timeZone: TZ, items:[{ id: process.env.CALENDAR_ID }] } });
      const busy = fb.data.calendars?.[process.env.CALENDAR_ID]?.busy || [];
      if (busy.length){
        const vr = new VoiceResponse();
        const url = await tts(`Sorry, that time just became unavailable. Would you like the next available options?`);
        play(vr, url); gather(vr, '/gather');
        call.state.lastAction = 'ASK';
        calls.set(sid, call);
        return res.type('text/xml').send(vr.toString());
      }
      // Book
      const cal2 = await gCal();
      await cal2.events.insert({
        calendarId: process.env.CALENDAR_ID,
        requestBody:{
          summary:'Home visit: 3D scan & estimate',
          description:`Booked by Verter AI.\nName: ${call.state.name||''}\nPhone: ${call.state.phone||''}\nAddress: ${call.state.address||''}\nIntent: ${call.state.intent||''}`,
          start:{ dateTime: slot.start.toISOString(), timeZone: TZ },
          end  :{ dateTime: slot.end.toISOString(),   timeZone: TZ },
          reminders:{ useDefault:true }
        }
      });
      const vr = new VoiceResponse();
      const msg = customReply || `All set! You’re booked for ${humanDateTime(slot.start)} at ${call.state.address||'your address'}.`;
      const url = await tts(msg + ' Can I help you with anything else today?');
      play(vr, url); gather(vr, '/gather');
      call.state.awaitingClose = true;
      call.state.lastAction = 'BOOKED';
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

  } catch (e){
    console.error('Planner error:', e, 'User said:', text);
    const vr = new VoiceResponse();
    const url = await tts(`Sorry, I had a glitch. Want to try that again?`);
    play(vr, url); gather(vr, '/gather');
    call.state.lastAction = 'ASK';
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
