import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';

// ---- App / config
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

const COMPANY     = 'American Developer Group';
const TZ          = process.env.BUSINESS_TZ || 'America/New_York';
const SLOT_MIN    = parseInt(process.env.SLOT_MINUTES || '60', 10);
const WORK_START  = process.env.WORK_START || '09:00';
const WORK_END    = process.env.WORK_END   || '18:00';
const BUFFER_MIN  = parseInt(process.env.MIN_BUFFER_MIN || '120', 10);

const WHATSAPP_VERIFY_TOKEN   = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN   = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID= process.env.WHATSAPP_PHONE_NUMBER_ID;

const OPENAI_API_KEY  = process.env.OPENAI_API_KEY;
const OPENAI_MODEL    = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

const CALENDAR_ID           = process.env.CALENDAR_ID;
const GOOGLE_CLIENT_EMAIL   = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY    = process.env.GOOGLE_PRIVATE_KEY;
const GOOGLE_IMPERSONATE_USER = process.env.GOOGLE_IMPERSONATE_USER || null;

// =================== Time helpers (нативная речь) ===================
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
  const ld = toLocal(d);
  const hh = ld.getHours(), mm = ld.getMinutes();
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
  if (sameDay(ld, today)) return 'today';
  if (sameDay(ld, tomorrow)) return 'tomorrow';
  const wd = ld.toLocaleDateString('en-US', { weekday:'long' });
  const num= ordinal(ld.getDate());
  const diff=(ld - today)/86400000;
  if (diff>=2 && diff<=6) return `this ${wd}, the ${num}`;
  const month = ld.toLocaleDateString('en-US', { month:'long' });
  return `${wd}, ${month} ${num}`;
}
function humanDateTime(d){ return `${speakDate(d)} at ${speakTime(d)}`; }

// =================== Calendar ===================
async function gCal(){
  const auth = new GoogleAuth({
    credentials: {
      client_email: GOOGLE_CLIENT_EMAIL,
      private_key : GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n'),
      type: 'service_account'
    },
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
  let client = await auth.getClient();
  if (GOOGLE_IMPERSONATE_USER){
    client = auth.fromJSON({
      type:'service_account', client_email:GOOGLE_CLIENT_EMAIL, private_key:GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')
    });
    client.subject = GOOGLE_IMPERSONATE_USER;
  }
  return google.calendar({ version:'v3', auth: client });
}
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
async function findFree(from, days=10){
  const cal = await gCal();
  const timeMin = new Date(from).toISOString();
  const timeMax = addMinutes(new Date(from), days*24*60).toISOString();
  const fb = await cal.freebusy.query({ requestBody:{ timeMin, timeMax, timeZone: TZ, items:[{ id: CALENDAR_ID }] } });
  const busy = (fb.data.calendars?.[CALENDAR_ID]?.busy || []).map(b=>({ start:new Date(b.start), end:new Date(b.end) }));
  const all = workingSlots(from, days);
  return all.filter(s=> !busy.some(b => s.start < b.end && b.start < s.end));
}
async function bookEvent(slot, state){
  const cal = await gCal();
  await cal.events.insert({
    calendarId: CALENDAR_ID,
    requestBody:{
      summary:'Home visit: 3D scan & estimate',
      description: `Booked by WhatsApp AI (Igor Bykov).\nName: ${state.name||''}\nPhone: ${state.phone||''}\nAddress: ${state.address||''}\nIntent: ${state.intent||''}`,
      start:{ dateTime: slot.start.toISOString(), timeZone: TZ },
      end  :{ dateTime: slot.end.toISOString(),   timeZone: TZ },
      reminders:{ useDefault:true }
    }
  });
}

// =================== WhatsApp send ===================
async function waSendText(waId, text){
  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const r = await fetch(url, {
    method:'POST',
    headers:{
      'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: waId,
      type: 'text',
      text: { preview_url: false, body: normalizeCanonical(text) }
    })
  });
  if (!r.ok){
    console.error('WA send error:', r.status, await r.text());
  }
}

// =================== LLM planner (Igor’s voice) ===================
const SYSTEM_PROMPT = `
You are Igor Bykov, CEO of American Developer Group (South Florida). Write in polished, comprehensive paragraphs (not short lines), warm and confident, like a seasoned general contractor.

PRIMARY GOAL: schedule a home visit for a 3D scan, design consultation, and a detailed renovation estimate.

ALTERNATES:
- Job seeker → say to visit america d group dot com slash careers.
- Construction partners → say to visit america d group dot com slash partners.
- Marketing/other services → say to email info at america d group dot com.

RULES:
- Capture multiple facts in one message (name + need). Ask only what's missing.
- Ask ONE focused question per turn.
- If remodeling intent and address is unknown → ask for address before availability.
- Day/time is TWO-STEP: 1) ask preference (“tomorrow morning or this Tuesday?”) and wait; 2) then offer 2–3 options.
- Use natural dates (“today”, “tomorrow”, “this Tuesday, the 15th”) and times (“9 a.m.”, “2:30 p.m.”).
- Say any greeting like “great to meet you” AT MOST ONCE per chat.
- Never choose CLOSE_CHECK unless booking succeeded or an ALT_* reply was just given.
- After booking or ALT_* reply, politely ask: “Can I help you with anything else today?”

ACTIONS (return strict JSON only):
{
  "updates": { "name?": string, "intent?": "remodel|job|partner|marketing|other", "address?": string, "greetedOnce?": boolean },
  "action": "ASK" | "ASK_DAY_PREFERENCE" | "OFFER_SLOTS" | "BOOK" | "ALT_JOB" | "ALT_PARTNER" | "ALT_MARKETING" | "CLOSE_CHECK",
  "chosen_index?": 0|1|2,
  "reply": "your comprehensive reply in Igor's voice"
}
`;

async function aiPlan(history, state){
  const body = {
    model: OPENAI_MODEL,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role:'system', content: SYSTEM_PROMPT },
      ...history,
      { role:'system', content: 'Current state:\n' + JSON.stringify({
        name: state.name || null,
        intent: state.intent || null,
        address: state.address || null,
        greetedOnce: !!state.greetedOnce
      }, null, 2)}
    ]
  };
  const r = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method:'POST',
    headers:{ 'Authorization':`Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok){
    throw new Error(`LLM error: ${r.status} ${await r.text()}`);
  }
  const data = await r.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

// =================== Canonical website/email phrasing ===================
function normalizeCanonical(text){
  if (!text) return text;
  const canon = {
    CAREERS : 'america d group dot com slash careers',
    PARTNERS: 'america d group dot com slash partners',
    FAQ     : 'america d group dot com slash f-a-q',
    SITE    : 'america d group dot com',
    EMAIL   : 'info at america d group dot com'
  };
  let t = text;
  t = t.replace(/americadgroup\.com[\/\.]?\s*careers/gi, canon.CAREERS);
  t = t.replace(/americadgroup\.com[\/\.]?\s*partners/gi, canon.PARTNERS);
  t = t.replace(/americadgroup\.com[\/\.]?\s*faq/gi, canon.FAQ);
  t = t.replace(/americadgroup\.com/gi, canon.SITE);
  t = t.replace(/info@americadgroup\.com/gi, canon.EMAIL);
  t = t.replace(/info at americadgroup dot com/gi, canon.EMAIL);
  return t.replace(/\s{2,}/g,' ').trim();
}

// =================== Sessions & parsers ===================
const sessions = new Map(); // waId -> state

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
  const wdNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  let targetWd = null;
  for (const w of wdNames){ if (new RegExp(`\\b${w}\\b`).test(t)) { targetWd = w; break; } }
  const m = t.match(/(\b([1-9]|1[0-2])([:\.][0-5][0-9])?\s*(a\.?m\.?|p\.?m\.?)\b)|\b([01]?\d|2[0-3])([:\.][0-5][0-9])?\b/);
  let targetMins = null;
  if (m){
    let raw = m[0].replace(/\./g,'').trim();
    const hhmm = raw.match(/(\d{1,2})([:\.](\d{2}))?/);
    if (hhmm){
      let hh = parseInt(hhmm[1],10);
      const mm = hhmm[3] ? parseInt(hhmm[3],10) : 0;
      const ap = /pm/i.test(raw) ? 'pm' : (/am/i.test(raw) ? 'am' : null);
      if (ap==='pm' && hh<12) hh+=12;
      if (ap==='am' && hh===12) hh=0;
      targetMins = hh*60+mm;
    }
  }
  let bestIdx=-1, bestScore=1e9;
  for (let i=0;i<proposed.length;i++){
    const d = toLocal(proposed[i].start);
    let score=0;
    if (targetWd){
      if (d.toLocaleDateString('en-US',{weekday:'long'}).toLowerCase()!==targetWd) score+=1000;
    }
    if (targetMins!==null){
      const mins = d.getHours()*60+d.getMinutes();
      score += Math.abs(mins-targetMins);
    }
    if (score<bestScore){ bestScore=score; bestIdx=i; }
  }
  return bestIdx;
}
function isNegative(text){
  const t=(text||'').toLowerCase();
  return /\b(no|nope|nah|nothing|i'?m good|that'?s all|thanks|we'?re good|we are good)\b/.test(t);
}
function isRemodelIntent(text){
  const t=(text||'').toLowerCase();
  return /(remodel|renovat|repair|bath(room)?|kitchen|estimate|scan|design|floor|paint)/.test(t);
}
function optionsText(slots){
  return slots.slice(0,3).map((s,i)=>`Option ${i+1}: ${humanDateTime(s.start)}`).join('\n');
}
function deriveFilters(userText){
  const s=(userText||'').toLowerCase();
  const res={ day:null, part:null };
  if (/morning/.test(s)) res.part='morning';
  else if (/afternoon/.test(s)) res.part='afternoon';
  else if (/evening|night/.test(s)) res.part='evening';
  const now = toLocal(new Date());
  if (/\btoday\b/.test(s)) res.day=now;
  else if (/\btomorrow\b/.test(s)){ const d=new Date(now); d.setDate(d.getDate()+1); res.day=d; }
  else {
    const wds=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    for (let i=0;i<wds.length;i++){
      if (new RegExp(`\\b${wds[i]}\\b`).test(s)){
        const d=new Date(now);
        let delta=(i - d.getDay() + 7) % 7;
        if (delta===0) delta=7;
        d.setDate(d.getDate()+delta);
        res.day=d; break;
      }
    }
  }
  return res;
}
function applyFilters(slots, filters){
  if (!filters) return slots;
  let out=slots;
  if (filters.day){
    const dayRef = toLocal(filters.day).toDateString();
    out=out.filter(s=> toLocal(s.start).toDateString()===dayRef);
  }
  if (filters.part){
    out=out.filter(s=>{
      const h=toLocal(s.start).getHours();
      if (filters.part==='morning') return h>=9 && h<12;
      if (filters.part==='afternoon') return h>=12 && h<16;
      if (filters.part==='evening') return h>=16 && h<19;
      return true;
    });
  }
  return out;
}

// =================== WhatsApp Webhook ===================
// Verify
app.get('/whatsapp/webhook', (req,res)=>{
  const mode = req.query['hub.mode'];
  const token= req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN){
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Receive
app.post('/whatsapp/webhook', async (req,res)=>{
  try{
    const body = req.body || {};
    const entries = body.entry || [];
    for (const entry of entries){
      const changes = entry.changes || [];
      for (const ch of changes){
        const value = ch.value || {};
        const msgs = value.messages || [];
        if (!msgs.length) continue;
        const msg = msgs[0];
        const waId = msg.from;
        let text = '';
        if (msg.type === 'text') text = msg.text?.body || '';
        else if (msg.type === 'button') text = msg.button?.text || '';
        else if (msg.type === 'interactive'){
          text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
        }
        await handleMessage(waId, (text||'').trim());
      }
    }
    res.json({ status:'ok' });
  } catch(e){
    console.error('Webhook error:', e);
    res.sendStatus(200); // отвечаем 200, чтобы Meta не ретраила без конца
  }
});

// =================== Conversation core ===================
async function handleMessage(waId, text){
  let state = sessions.get(waId);
  if (!state){
    state = {
      phone: waId, name:null, intent:null, address:null,
      greetedOnce:true, awaitingClose:false, lastAction:null,
      lastAskDayPref:false, proposed:[], offerAttempts:0, filters:null,
      chosenIndex:null, history:[]
    };
    sessions.set(waId, state);
    await waSendText(waId,
      `Hello — Igor Bykov here, CEO of ${COMPANY}.
Thanks for reaching out. I’ll personally help you schedule a quick home visit: we’ll scan your space in 3D, talk through design, and prepare a precise renovation estimate.

Could you share your name and what you’d like help with?`);
    return;
  }

  // Final courtesy close
  if (state.awaitingClose){
    if (isNegative(text)){
      await waSendText(waId, `Alright — thanks for contacting ${COMPANY}. Wishing you a great day!`);
      sessions.delete(waId);
      return;
    }
    state.awaitingClose = false;
    await waSendText(waId, `Of course — tell me more. What else would be helpful right now?`);
    return;
  }

  // Deterministic selection after OFFER_SLOTS
  if (state.lastAction === 'OFFER_SLOTS' && state.proposed?.length){
    let idx = parseNumberChoice(text);
    if (idx < 0) idx = matchNaturalToProposed(text, state.proposed);
    if (idx >= 0 && state.proposed[idx]){
      state.chosenIndex = idx;
      const slot = state.proposed[idx];
      state.lastAction = 'CONFIRM';
      await waSendText(waId,
        `Excellent — let’s lock this in: **${humanDateTime(slot.start)}**, at **${state.address || 'your address'}**.
Shall I go ahead and confirm this appointment on our side?`);
      return;
    }
    state.offerAttempts = (state.offerAttempts||0)+1;
    const tip = state.offerAttempts >= 2
      ? `Please reply “option one”, “option two”, or “option three”—or write the exact time, e.g., “this Tuesday at 11 a.m.”`
      : `Please reply “option one”, “option two”, or “option three”.`;
    await waSendText(waId, `Sorry — I didn’t catch that.\n${optionsText(state.proposed)}\n${tip}`);
    return;
  }

  // Confirm → Book
  if (state.lastAction === 'CONFIRM' && state.proposed?.length && state.chosenIndex != null){
    if (/\b(yes|yeah|sure|confirm|go ahead|book|please)\b/i.test(text)){
      const slot = state.proposed[state.chosenIndex];
      // collision check
      const free = await findFree(new Date(), 10);
      const stillFree = free.some(s => s.start.getTime() === slot.start.getTime());
      if (!stillFree){
        state.lastAction = 'ASK_DAY_PREFERENCE';
        await waSendText(waId, `Apologies — that slot just became unavailable. Would tomorrow morning work, or do you prefer this Tuesday?`);
        return;
      }
      try{
        await bookEvent(slot, state);
      }catch(err){
        console.error('Calendar insert failed:', err);
        state.lastAction = 'OFFER_SLOTS';
        const freeAgain = (await findFree(new Date(), 10)).slice(0,3);
        state.proposed = freeAgain;
        await waSendText(waId, `I ran into a scheduling glitch — here are fresh options:\n${optionsText(freeAgain)}\nPlease say the option number.`);
        return;
      }
      state.awaitingClose = true;
      state.lastAction = 'BOOKED';
      await waSendText(waId,
        `All set — I’ve reserved **${humanDateTime(slot.start)}** at **${state.address || 'your address'}**.
You’ll meet our team for a 3D scan, design consultation, and a detailed estimate.
Can I help you with anything else today?`);
      return;
    } else {
      // declined → restate options
      state.lastAction = 'OFFER_SLOTS';
      await waSendText(waId, `No problem — here are the options:\n${optionsText(state.proposed)}\nPlease say the option number.`);
      return;
    }
  }

  // LLM planner
  state.history.push({ role:'user', content:text });
  let plan;
  try{
    plan = await aiPlan(state.history, state);
  }catch(e){
    console.error('LLM error:', e);
    await waSendText(waId, `I had a small glitch — mind if we try that again? What’s the property address for the visit?`);
    state.lastAction='ASK';
    return;
  }

  // apply updates
  const updates = plan.updates || {};
  Object.assign(state, updates);
  let action = plan.action;
  let reply  = plan.reply || '';

  // Guard: avoid CLOSE_CHECK during remodel flow
  if (action === 'CLOSE_CHECK' && (isRemodelIntent(text) || !state.awaitingClose)){
    action = 'ASK';
    if (!reply) reply = `Understood — to keep things moving, could you share the property address we’ll be visiting?`;
  }

  if (action === 'ASK_DAY_PREFERENCE'){
    state.lastAskDayPref = true;
    state.lastAction = 'ASK_DAY_PREFERENCE';
    await waSendText(waId, reply || `Would tomorrow morning work, or do you prefer this Tuesday?`);
    return;
  }

  if (state.lastAskDayPref){
    state.lastAskDayPref = false;
    state.filters = deriveFilters(text);
    action = 'OFFER_SLOTS';
    if (!reply) reply = 'Got it — let me check availability for that time frame.';
  }

  if (['ALT_JOB','ALT_PARTNER','ALT_MARKETING'].includes(action)){
    if (action === 'ALT_JOB'){
      reply = `We’re always happy to meet talented people. Please apply at **america d group dot com slash careers** — that’s the quickest way for my team to review and follow up. Can I help you with anything else regarding your project?`;
    } else if (action === 'ALT_PARTNER'){
      reply = `That sounds promising. Please submit a quick note at **america d group dot com slash partners** — we’ll review and get back. Is there anything else I can help you with today?`;
    } else {
      reply = `Thanks for reaching out. Please email **info at america d group dot com** with your proposal — we’ll make sure it’s reviewed. Anything else I can help you with?`;
    }
    state.awaitingClose = true;
    state.lastAction = 'ALT';
    await waSendText(waId, reply);
    return;
  }

  if (action === 'OFFER_SLOTS' && !state.address){
    action = 'ASK';
    if (!reply) reply = `Absolutely — could you please share the property address for the visit first?`;
  }

  if (action === 'OFFER_SLOTS'){
    const free = await findFree(new Date(), 10);
    const filtered = applyFilters(free, state.filters);
    const shortlist = filtered.slice(0,3);
    state.proposed = shortlist;
    state.lastAction = 'OFFER_SLOTS';
    if (!shortlist.length){
      await waSendText(waId, (reply || 'I’m not seeing open times for that preference right now.') + `\nWould you like me to check another day or time window?`);
      return;
    }
    await waSendText(waId, (reply || 'Here are the first available options:') + `\n${optionsText(shortlist)}\nPlease say the option number (e.g., “option two”).`);
    return;
  }

  if (action === 'BOOK'){
    const idx = typeof plan.chosen_index === 'number' ? plan.chosen_index : 0;
    if (!state.proposed?.[idx]){
      const fresh = (await findFree(new Date(), 10)).slice(0,3);
      state.proposed = fresh;
      state.lastAction = 'OFFER_SLOTS';
      await waSendText(waId, `No problem — here are the options:\n${optionsText(fresh)}\nPlease say the option number.`);
      return;
    }
    const slot = state.proposed[idx];
    const freeNow = await findFree(new Date(), 10);
    const stillFree = freeNow.some(s => s.start.getTime() === slot.start.getTime());
    if (!stillFree){
      state.lastAction = 'ASK_DAY_PREFERENCE';
      await waSendText(waId, `Apologies — that time was just taken. Would tomorrow morning work, or do you prefer this Tuesday?`);
      return;
    }
    await bookEvent(slot, state);
    state.awaitingClose = true;
    state.lastAction = 'BOOKED';
    await waSendText(waId, (reply || `All set — I’ve scheduled **${humanDateTime(slot.start)}** at **${state.address || 'your address'}**.`) + `\nCan I help you with anything else today?`);
    return;
  }

  if (action === 'CLOSE_CHECK'){
    state.awaitingClose = true;
    state.lastAction = 'CLOSE_CHECK';
    await waSendText(waId, (reply || 'Happy to help.') + ' Can I help you with anything else today?');
    return;
  }

  // ASK (default)
  state.lastAction = 'ASK';
  await waSendText(waId, reply || `Understood — could you share the property address for the visit?`);
}

// =================== Start ===================
const PORT = process.env.WHATSAPP_PORT || process.env.PORT || 5001;
app.listen(PORT, ()=> console.log(`WhatsApp bot listening on :${PORT}`));
