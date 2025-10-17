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

// ---- Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const AUDIO_DIR  = path.join(__dirname, 'audio');
fs.mkdirSync(AUDIO_DIR, { recursive: true });

// ---- App / config
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const COMPANY    = 'American Developer Group';
const TZ         = process.env.BUSINESS_TZ || 'America/New_York';
const SLOT_MIN   = parseInt(process.env.SLOT_MINUTES || '60', 10);
const WORK_START = process.env.WORK_START || '09:00';
const WORK_END   = process.env.WORK_END   || '18:00';

// ---- Helpers
function addMinutes(d, m){ return new Date(d.getTime() + m*60000); }
function toLocal(d){ return new Date(d.toLocaleString('en-US', { timeZone: TZ })); }
function atTime(baseDate, hhmm){ const [h,m]=hhmm.split(':').map(Number); const d=toLocal(baseDate); d.setHours(h,m,0,0); return d; }
function workingSlots(fromDate, days=14){
  const out=[]; const start=toLocal(fromDate);
  for(let i=0;i<days;i++){
    const day=new Date(start); day.setDate(day.getDate()+i);
    let s=atTime(day, WORK_START); const e=atTime(day, WORK_END);
    if(i===0 && s<start){ while(s<start) s=addMinutes(s,SLOT_MIN); }
    while(addMinutes(s,SLOT_MIN)<=e){ out.push({start:new Date(s), end:addMinutes(s,SLOT_MIN)}); s=addMinutes(s,SLOT_MIN); }
  }
  return out;
}
function human(d){
  const now=toLocal(new Date()); const ld=toLocal(d);
  const today=new Date(now.toDateString()); const tomorrow=new Date(today); tomorrow.setDate(today.getDate()+1);
  const same=(a,b)=>a.toDateString()===b.toDateString();
  const wd=ld.toLocaleDateString('en-US',{weekday:'long'}), md=ld.toLocaleDateString('en-US',{month:'long',day:'numeric'});
  const t=ld.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  if(same(ld,today)) return `today at ${t}`;
  if(same(ld,tomorrow)) return `tomorrow at ${t}`;
  const diff=(ld-today)/86400000; if(diff>=2&&diff<=6){ const day=ld.toLocaleDateString('en-US',{day:'numeric'}); return `this ${wd}, the ${day}, at ${t}`; }
  return `${wd}, ${md} at ${t}`;
}
async function tts(text){
  const file = path.join(AUDIO_DIR, `${crypto.randomUUID()}.mp3`);
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
    method:'POST',
    headers:{ 'xi-api-key':process.env.ELEVENLABS_API_KEY, 'Content-Type':'application/json' },
    body: JSON.stringify({ text, model_id:'eleven_multilingual_v2', voice_settings:{ stability:0.4, similarity_boost:0.8 }})
  });
  if(!r.ok) throw new Error('TTS error: '+await r.text());
  const buf = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(file, buf);
  return `${process.env.BASE_URL}/media/${path.basename(file)}`;
}
app.get('/media/:f',(req,res)=>{ const f=path.join(AUDIO_DIR, path.basename(req.params.f)); if(!fs.existsSync(f)) return res.sendStatus(404); res.setHeader('Content-Type','audio/mpeg'); fs.createReadStream(f).pipe(res); });

// ---- Google Calendar
async function gCal(){
  const auth = new GoogleAuth({ credentials:{ client_email:process.env.GOOGLE_CLIENT_EMAIL, private_key:process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') }, scopes:['https://www.googleapis.com/auth/calendar'] });
  let client = await auth.getClient();
  if(process.env.GOOGLE_IMPERSONATE_USER){
    client = auth.fromJSON({ type:'service_account', client_email:process.env.GOOGLE_CLIENT_EMAIL, private_key:process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') });
    client.subject = process.env.GOOGLE_IMPERSONATE_USER;
  }
  return google.calendar({version:'v3', auth:client});
}
async function findFreeSlots(from, days=10, take=3){
  const cal = await gCal();
  const timeMin = new Date(from).toISOString();
  const timeMax = addMinutes(new Date(from), days*24*60).toISOString();
  const fb = await cal.freebusy.query({ requestBody:{ timeMin, timeMax, timeZone:TZ, items:[{id:process.env.CALENDAR_ID}] } });
  const busy = (fb.data.calendars?.[process.env.CALENDAR_ID]?.busy||[]).map(b=>({start:new Date(b.start), end:new Date(b.end)}));
  const free = workingSlots(from, days).filter(s=>!busy.some(b=>s.start<b.end && b.start<s.end));
  return free.slice(0,take);
}
async function book(slot, state){
  const cal = await gCal();
  await cal.events.insert({
    calendarId: process.env.CALENDAR_ID,
    requestBody:{
      summary: 'Home visit: 3D scan & estimate',
      description: `Booked by Verter AI.\nName: ${state.name||''}\nPhone: ${state.phone||''}\nAddress: ${state.address||''}\nIntent: ${state.intent||''}`,
      start:{dateTime:slot.start.toISOString(), timeZone:TZ},
      end:{dateTime:slot.end.toISOString(), timeZone:TZ},
      reminders:{useDefault:true}
    }
  });
}

// ---- LLM Planner (твой системный промпт)
const SYSTEM_PROMPT = `
You are Verter, chief robot manager and scheduling assistant for American Developer Group, a high-end general contracting company in South Florida.
You sound human, friendly, and confident, like a professional who knows construction but keeps things casual and approachable.
Keep responses short, warm, and conversational. Never robotic.

PRIMARY GOAL: schedule a home visit for a 3D scan, design consultation, and detailed renovation cost estimate.

ALTERNATE ROUTES:
- Job seeker -> direct them to Careers on website.
- Construction-related partners -> Partners form.
- Marketing/other services -> email info@americadgroup.com.

BEHAVIOR:
- If caller says both a name and a need in one sentence, capture both.
- Ask only what's missing (name, address, preferred time).
- When offering availability: read 2-3 soonest options in natural language.
- Confirm schedule using natural day phrasing: "tomorrow", "this Tuesday the 15th", or full date if next week+.
- If interrupted, finish your sentence briefly then ask: "…Sorry, did you want to add something?"

TOOLS:
You can ask the server to perform actions by returning JSON in this shape:
{
  "updates": { "name?": string, "intent?": "remodel|job|partner|marketing|other", "address?": string },
  "action": "ASK|OFFER_SLOTS|BOOK|ALT_JOB|ALT_PARTNER|ALT_MARKETING",
  "chosen_index?": 0|1|2,
  "reply": "what you will say to the caller, concise and friendly"
}

RULES:
- Always return strictly valid JSON only, no markdown, no prose outside JSON.
- Prefer filling missing fields and moving forward. If name and need are known, ask for address, then time.
`;

async function aiPlan(history, state){
  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'system', content: `Current state JSON:\n${JSON.stringify({ name:state.name||null, intent:state.intent||null, address:state.address||null }, null, 2)}` }
    ],
    temperature: 0.3,
    response_format: { type: "json_object" }
  };
  const r = await fetch(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  if(!r.ok) throw new Error('LLM error: '+await r.text());
  const data = await r.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

// ---- State per call
const calls = new Map(); // CallSid -> { state, history }
function vrSayUrl(vr, url){ vr.play({}, url); }
function vrAsk(vr, url){ vr.play({}, url); vr.gather({ input:'speech', action:'/gather', method:'POST', enhanced:true }); }

// ---- Entry
app.post('/voice', async (req,res)=>{
  const vr = new VoiceResponse();
  vr.say({language:'en-US'}, 'This call may be recorded.');
  const greet = await tts(`Hey there! My name’s Verter — I’m the chief robot manager here at ${COMPANY}. May I have your name, and what can I help you with today?`);
  vrAsk(vr, greet);
  calls.set(req.body.CallSid, { 
    state: { phone: req.body.From },
    history: [{ role:'assistant', content: 'Hey there! My name’s Verter — I’m the chief robot manager here at American Developer Group. May I have your name, and what can I help you with today?' }]
  });
  res.type('text/xml').send(vr.toString());
});

app.post('/gather', async (req,res)=>{
  const text = (req.body.SpeechResult||'').trim();
  const sid  = req.body.CallSid;
  const call = calls.get(sid) || { state:{ phone:req.body.From }, history:[] };
  call.history.push({ role:'user', content: text });

  try {
    const plan = await aiPlan(call.history, call.state);

    // Применяем updates от ИИ
    call.state = { ...call.state, ...(plan.updates||{}) };

    // Действия
    if (plan.action === 'ALT_JOB' || plan.action === 'ALT_PARTNER' || plan.action === 'ALT_MARKETING') {
      const vr = new VoiceResponse();
      const url = await tts(plan.reply);
      vrSayUrl(vr, url); vr.hangup();
      calls.delete(sid);
      return res.type('text/xml').send(vr.toString());
    }

    if (plan.action === 'OFFER_SLOTS') {
      // Получаем слоты и озвучиваем
      const free = await findFreeSlots(new Date(), 10, 3);
      call.state.proposed = free;
      call.history.push({ role:'system', content:`Proposed slots: ${free.map((s,i)=>`#${i+1} ${human(s.start)}`).join(', ')}` });

      let reply = plan.reply;
      if (free.length>0){
        const options = free.map((s,i)=>`Option ${i+1}: ${human(s.start)}.`).join(' ');
        reply = `${plan.reply} ${options} Please say the option number.`;
      } else {
        reply = `Sorry, I don’t see any open time in the next few days. Would you like me to leave a message for a call back?`;
      }
      const vr = new VoiceResponse();
      const url = await tts(reply);
      vrAsk(vr, url);
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    if (plan.action === 'BOOK') {
      const idx = typeof plan.chosen_index === 'number' ? plan.chosen_index : 0;
      const slot = call.state.proposed?.[idx];
      if (!slot){
        // если нет выбранного — заново предложим
        const free = await findFreeSlots(new Date(), 10, 3);
        call.state.proposed = free;
        const vr = new VoiceResponse();
        const url = await tts(`No problem. Here are the first available options. ${free.map((s,i)=>`Option ${i+1}: ${human(s.start)}.`).join(' ')} Please say the option number.`);
        vrAsk(vr, url);
        calls.set(sid, call);
        return res.type('text/xml').send(vr.toString());
      }

      // финальная проверка коллизий и бронь
      const cal = await gCal();
      const fb = await cal.freebusy.query({ requestBody:{ timeMin:slot.start.toISOString(), timeMax:slot.end.toISOString(), timeZone:TZ, items:[{id:process.env.CALENDAR_ID}] } });
      const busy = fb.data.calendars?.[process.env.CALENDAR_ID]?.busy || [];
      if (busy.length){
        const vr = new VoiceResponse();
        const url = await tts(`Sorry, that time just became unavailable. Would you like the next available options?`);
        vrAsk(vr, url);
        calls.set(sid, call);
        return res.type('text/xml').send(vr.toString());
      }

      await book(slot, call.state);
      const vr = new VoiceResponse();
      const url = await tts(plan.reply || `Perfect. You’re all set for ${human(slot.start)} at ${call.state.address || 'your address'}. Thanks for calling ${COMPANY}!`);
      vrSayUrl(vr, url); vr.hangup();
      calls.delete(sid);
      return res.type('text/xml').send(vr.toString());
    }

    // По умолчанию — просто ответ/уточнение
    const vr = new VoiceResponse();
    const url = await tts(plan.reply || `Got it. Could you tell me the property address?`);
    vrAsk(vr, url);
    calls.set(sid, call);
    return res.type('text/xml').send(vr.toString());

  } catch (e){
    console.error(e);
    const vr = new VoiceResponse();
    const url = await tts(`Sorry, something went wrong on our side. Please try again later.`);
    vrSayUrl(vr, url); vr.hangup();
    calls.delete(sid);
    return res.type('text/xml').send(vr.toString());
  }
});

// (опционально) voicemail
app.post('/voicemail', async (req,res)=>{
  const vr = new VoiceResponse();
  const url = await tts(`Thank you. Your message has been recorded. Goodbye.`);
  vrSayUrl(vr, url); vr.hangup();
  res.type('text/xml').send(vr.toString());
});

app.listen(process.env.PORT || 3000, ()=> console.log('Verter is live'));
