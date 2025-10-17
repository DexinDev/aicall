// app.js (ESM). В package.json добавь: { "type": "module" }
import 'dotenv/config';
import express from 'express';
import { urlencoded } from 'body-parser';
import { xml } from 'xmlbuilder2';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';

const app = express();
app.use(urlencoded({ extended: false }));

// ====== CONFIG ======
const TZ = process.env.BUSINESS_TZ || 'America/New_York';
const SLOT_MIN = parseInt(process.env.SLOT_MINUTES || '60', 10);
const WORK_START = process.env.WORK_START || '09:00';
const WORK_END   = process.env.WORK_END   || '18:00';
const AUDIO_DIR = './audio';
fs.mkdirSync(AUDIO_DIR, { recursive: true });

const COMPANY = 'American Developer Group';
const FAQ_URL = 'https://www.americadgroup.com/faq';

// ====== UTIL ======
function twiml(verbs) { return xml({ Response: verbs }).end({ prettyPrint: true }); }
function addMinutes(d, m){ return new Date(d.getTime() + m*60000); }
function toLocal(d){ return new Date(d.toLocaleString('en-US', { timeZone: TZ })); }
function atTime(baseDate, hhmm){
  const [h,m]=hhmm.split(':').map(Number);
  const d = toLocal(baseDate);
  d.setHours(h,m,0,0);
  return d;
}
function workingSlots(fromDate, days=14){
  const out=[];
  const start = toLocal(fromDate);
  for(let i=0;i<days;i++){
    const day = new Date(start); day.setDate(day.getDate()+i);
    // Пример: не предлагаем воскресенье
    // if(day.getDay()===0) continue;
    let s = atTime(day, WORK_START);
    const e = atTime(day, WORK_END);
    // не предлагать прошедшее
    if(i===0 && s < start) { while(s<start) s=addMinutes(s,SLOT_MIN); }
    while(addMinutes(s,SLOT_MIN) <= e){
      out.push({start:new Date(s), end:addMinutes(s,SLOT_MIN)});
      s = addMinutes(s,SLOT_MIN);
    }
  }
  return out;
}
function humanDatePhrase(d){
  const now = toLocal(new Date());
  const ld = toLocal(d);
  const today = new Date(now.toDateString());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);

  const sameDay = (a,b)=>a.toDateString()===b.toDateString();
  const weekday = ld.toLocaleDateString('en-US',{ weekday:'long' });
  const monthDay = ld.toLocaleDateString('en-US',{ month:'long', day:'numeric' });
  const time = ld.toLocaleTimeString('en-US',{ hour:'numeric', minute:'2-digit' });

  if (sameDay(ld, today)) return `today at ${time}`;
  if (sameDay(ld, tomorrow)) return `tomorrow at ${time}`;

  // "this Tuesday, the 15th" если в текущей неделе
  const diff = (ld - today) / 86400000;
  if (diff >= 2 && diff <= 6) {
    const dayNum = ld.toLocaleDateString('en-US',{ day:'numeric' });
    return `this ${weekday}, the ${dayNum}, at ${time}`;
  }
  // дальше — полная дата
  return `${weekday}, ${monthDay} at ${time}`;
}
async function tts(text){
  const fname = path.join(AUDIO_DIR, `${crypto.randomUUID()}.mp3`);
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,{
    method:'POST',
    headers:{ 'xi-api-key':process.env.ELEVENLABS_API_KEY,'Content-Type':'application/json' },
    body: JSON.stringify({ text, model_id:'eleven_multilingual_v2', voice_settings:{ stability:0.4, similarity_boost:0.8 }})
  });
  if(!r.ok) throw new Error('TTS failed: ' + await r.text());
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(fname, buf);
  return `${process.env.BASE_URL}/media/${path.basename(fname)}`;
}
app.get('/media/:f', (req,res)=>{
  const f = path.join(AUDIO_DIR, path.basename(req.params.f));
  if(!fs.existsSync(f)) return res.sendStatus(404);
  res.setHeader('Content-Type','audio/mpeg');
  fs.createReadStream(f).pipe(res);
});

// ====== GCal ======
async function gCal(){
  const auth = new GoogleAuth({
    credentials:{ client_email:process.env.GOOGLE_CLIENT_EMAIL, private_key:process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
    scopes:['https://www.googleapis.com/auth/calendar']
  });
  let client = await auth.getClient();
  if(process.env.GOOGLE_IMPERSONATE_USER){
    client = auth.fromJSON({
      type:'service_account',
      client_email:process.env.GOOGLE_CLIENT_EMAIL,
      private_key:process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n'),
    });
    client.subject = process.env.GOOGLE_IMPERSONATE_USER;
  }
  return google.calendar({version:'v3', auth:client});
}
async function findFreeSlots(from, horizonDays=14, take=3){
  const cal = await gCal();
  const timeMin = new Date(from).toISOString();
  const timeMax = new Date(addMinutes(new Date(from), horizonDays*24*60)).toISOString();
  const fb = await cal.freebusy.query({
    requestBody:{ timeMin, timeMax, timeZone:TZ, items:[{id:process.env.CALENDAR_ID}] }
  });
  const busy = (fb.data.calendars?.[process.env.CALENDAR_ID]?.busy || []).map(b=>({start:new Date(b.start), end:new Date(b.end)}));
  const all = workingSlots(from, horizonDays);
  const free = all.filter(s => !busy.some(b => s.start < b.end && b.start < s.end));
  return free.slice(0,take);
}
async function bookEvent(slot, summary, description){
  const cal = await gCal();
  await cal.events.insert({
    calendarId: process.env.CALENDAR_ID,
    requestBody:{
      summary,
      description,
      start:{ dateTime: slot.start.toISOString(), timeZone:TZ },
      end:  { dateTime: slot.end.toISOString(),   timeZone:TZ },
      reminders:{ useDefault:true }
      // conferenceData: { createRequest: { requestId: crypto.randomUUID() } }, conferenceDataVersion:1
    }
  });
}

// ====== STATE ======
/** state: {
 *  stage: 'greet'|'get_name'|'route'|'addr'|'offer'|'confirm'|'done'|'alt_job'|'alt_partner'|'alt_marketing'|'faq',
 *  name, intent, address, phone, proposed:[slot], chosen:slot
 * } */
const calls = new Map(); // CallSid -> state

const fillers = [
  "Let’s see what we’ve got here…",
  "One sec, checking the schedule real quick…",
  "Okay, hang on, let me take a quick look…"
];
function filler(){ return fillers[Math.floor(Math.random()*fillers.length)]; }

function detectIntent(t){
  const s = (t||'').toLowerCase();
  if (/(job|work|vacanc|resume|apply)/.test(s)) return 'job';
  if (/(partner|subcontract|cabinet|countertop|supplier|wholesale)/.test(s)) return 'partner';
  if (/(marketing|seo|ads|promotion|website|services)/.test(s)) return 'marketing';
  if (/(kitchen|bath|remodel|renovat|floor|paint|repair|construction|design)/.test(s)) return 'remodel';
  return 'other';
}
function numberIdx(text){
  const t = (text||'').toLowerCase();
  if (/(one|first|\b1\b)/.test(t)) return 0;
  if (/(two|second|\b2\b|too|to)/.test(t)) return 1;
  if (/(three|third|\b3\b)/.test(t)) return 2;
  return -1;
}

// ====== FLOW ======
app.post('/voice', async (req,res)=>{
  const greeting = await tts(`Hey there! My name’s Verter — I’m the chief robot manager here at ${COMPANY}. May I have your name, and what can I help you with today?`);
  const verbs = [
    { Say: { '@language':'en-US', '#': 'This call may be recorded.' }},
    { Play: { '#': greeting }},
    { Gather: { '@input':'speech', '@action':'/gather', '@method':'POST', '@enhanced':'true' } }
  ];
  calls.set(req.body.CallSid, { stage:'get_name', phone:req.body.From });
  res.type('text/xml').send(twiml(verbs));
});

app.post('/gather', async (req,res)=>{
  const text = (req.body.SpeechResult||'').trim();
  const sid = req.body.CallSid;
  const st = calls.get(sid) || { stage:'get_name', phone:req.body.From };

  try {
    // interruption handling is implicit with short prompts

    if (st.stage === 'get_name') {
      st.name = text.replace(/^my name is/i,'').trim() || 'there';
      st.stage = 'route';
      calls.set(sid, st);
      const v = await tts(`Great, ${st.name}! How can I help you today?`);
      return res.type('text/xml').send(twiml([
        { Play: { '#': v }},
        { Gather: { '@input':'speech', '@action':'/gather', '@method':'POST', '@enhanced':'true' } }
      ]));
    }

    if (st.stage === 'route') {
      const intent = detectIntent(text);
      st.intent = intent;

      if (intent === 'remodel') {
        st.stage = 'addr';
        calls.set(sid, st);
        const v = await tts(`Awesome, ${st.name}! We’d be happy to help. The first step is a quick home visit — we’ll scan your space in 3D, talk through ideas, and prepare an exact estimate. What’s the property address?`);
        return res.type('text/xml').send(twiml([
          { Play: { '#': v }},
          { Gather: { '@input':'speech', '@action':'/gather', '@method':'POST', '@enhanced':'true' } }
        ]));
      }

      if (intent === 'job') {
        st.stage = 'alt_job';
        const v = await tts(`Awesome — we’re always looking for good people. Please visit our website and go to the Careers section. You can apply there, and our hiring team will get in touch directly. Anything else I can help with?`);
        return res.type('text/xml').send(twiml([{ Play:{'#':v} }, { Hangup:null }]));
      }

      if (intent === 'partner') {
        st.stage = 'alt_partner';
        const v = await tts(`Sounds interesting! Please fill out the short form in the Partners section of our website — that’s the best way for us to review collaboration offers. Thanks for reaching out!`);
        return res.type('text/xml').send(twiml([{ Play:{'#':v} }, { Hangup:null }]));
      }

      if (intent === 'marketing') {
        st.stage = 'alt_marketing';
        const v = await tts(`Thanks for reaching out! Please send your info and proposal to info at americadgroup dot com, and our team will review it.`);
        return res.type('text/xml').send(twiml([{ Play:{'#':v} }, { Hangup:null }]));
      }

      // unknown — отправим в FAQ/визит
      st.stage = 'faq';
      const v = await tts(`That’s a great question. Many answers are in our FAQ. For everything else, our specialist will cover it during the home visit. Would you like me to check availability for a visit?`);
      return res.type('text/xml').send(twiml([
        { Play:{'#':v}},
        { Gather:{'@input':'speech','@action':'/gather','@method':'POST','@enhanced':'true'} }
      ]));
    }

    if (st.stage === 'faq') {
      if (/(yes|yeah|sure|ok|okay)/i.test(text)) {
        st.stage = 'addr';
        calls.set(sid, st);
        const v = await tts(`Great. What’s the property address for the visit?`);
        return res.type('text/xml').send(twiml([{ Play:{'#':v}}, { Gather:{'@input':'speech','@action':'/gather','@method':'POST','@enhanced':'true'} }]));
      } else {
        const v = await tts(`No problem. You can also check our FAQ at americadgroup dot com slash faq. Have a great day!`);
        calls.delete(sid);
        return res.type('text/xml').send(twiml([{ Play:{'#':v}}, { Hangup:null }]));
      }
    }

    if (st.stage === 'addr') {
      st.address = text;
      st.stage = 'offer';

      // пауза-холдер
      const wait = await tts(filler());
      // найдём слоты
      const free = await findFreeSlots(new Date(), 10, 3);
      st.proposed = free;
      calls.set(sid, st);

      if (!free.length){
        const v = await tts(`Sorry, I don’t see any open time in the next days. Would you like me to take a message for a call back?`);
        return res.type('text/xml').send(twiml([{ Play:{'#':wait}},{ Play:{'#':v}}, { Hangup:null }]));
      }

      const options = free.map((s,i)=>`Option ${i+1}: ${humanDatePhrase(s.start)}.`).join(' ');
      const v = await tts(`${wait} Here are the first available options. ${options} Please say the option number.`);
      return res.type('text/xml').send(twiml([{ Play:{'#':v}}, { Gather:{'@input':'speech','@action':'/gather','@method':'POST','@enhanced':'true'} }]));
    }

    if (st.stage === 'offer') {
      const idx = numberIdx(text);
      if (idx<0 || !st.proposed?.[idx]) {
        const v = await tts(`Sorry, I didn’t catch that. Please say option one, option two, or option three.`);
        return res.type('text/xml').send(twiml([{ Play:{'#':v}}, { Gather:{'@input':'speech','@action':'/gather','@method':'POST','@enhanced':'true'} }]));
      }
      st.chosen = st.proposed[idx];
      st.stage = 'confirm';
      calls.set(sid, st);

      const when = humanDatePhrase(st.chosen.start);
      const v = await tts(`Perfect. I’ve got you down for ${when} at ${st.address}. Just to confirm — is this for a remodel or repair, like kitchen, bathroom, or flooring? Please say yes to confirm the time.`);
      return res.type('text/xml').send(twiml([{ Play:{'#':v}}, { Gather:{'@input':'speech','@action':'/gather','@method':'POST','@enhanced':'true'} }]));
    }

    if (st.stage === 'confirm') {
      const yes = /(yes|yeah|sure|correct|confirm)/i.test(text);
      if (!yes){
        st.stage = 'offer';
        const v = await tts(`Got it. Would you like me to read the options again or pick a different time? Please say option one, two, or three.`);
        return res.type('text/xml').send(twiml([{ Play:{'#':v}}, { Gather:{'@input':'speech','@action':'/gather','@method':'POST','@enhanced':'true'} }]));
      }

      // двойная проверка коллизии
      const cal = await gCal();
      const s = st.chosen.start; const e = st.chosen.end;
      const fb = await cal.freebusy.query({
        requestBody:{ timeMin:s.toISOString(), timeMax:e.toISOString(), timeZone:TZ, items:[{id:process.env.CALENDAR_ID}] }
      });
      const busy = fb.data.calendars?.[process.env.CALENDAR_ID]?.busy || [];
      if (busy.length){
        st.stage = 'offer';
        const v = await tts(`Sorry, that time just became unavailable. Would you like the next available options?`);
        return res.type('text/xml').send(twiml([{ Play:{'#':v}}, { Gather:{'@input':'speech','@action':'/gather','@method':'POST','@enhanced':'true'} }]));
      }

      await bookEvent(st.chosen, 'Home visit: 3D scan & estimate',
        `Booked by Verter phone AI.\nName: ${st.name}\nPhone: ${st.phone}\nAddress: ${st.address}`);

      const closer = await tts(`Perfect, ${st.name}. You’re all set. Our specialist will see you soon — and don’t worry, they’ll answer every question in person. The visit will be handled personally by Igor Bykov, our director and lead construction expert, together with Erkina Gavrilova, our head designer. Thanks for calling ${COMPANY} — have a great day!`);
      calls.delete(sid);
      return res.type('text/xml').send(twiml([{ Play:{'#':closer}}, { Hangup:null }]));
    }

    // fallback
    const v = await tts(`Sorry, I didn’t get that. Would you like me to check available time slots for a home visit?`);
    st.stage='faq'; calls.set(sid, st);
    return res.type('text/xml').send(twiml([{ Play:{'#':v}},{ Gather:{'@input':'speech','@action':'/gather','@method':'POST','@enhanced':'true'} }]));
  } catch (e) {
    console.error(e);
    const v = await tts(`Sorry, something went wrong on our side. Please try again later.`);
    calls.delete(sid);
    return res.type('text/xml').send(twiml([{ Play:{'#':v}},{ Hangup:null }]));
  }
});

// (опционально) запись голосовой почты, если нужно:
app.post('/voicemail', async (req,res)=>{
  const v = await tts(`Thank you. Your message has been recorded. Goodbye.`);
  res.type('text/xml').send(twiml([{ Play:{'#':v}},{ Hangup:null }]));
});

app.listen(process.env.PORT || 3000, ()=>console.log('Verter is live'));
