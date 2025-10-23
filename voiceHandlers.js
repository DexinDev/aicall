import twilio from 'twilio';
const { VoiceResponse } = twilio;
import { COMPANY } from './config.js';
import { findFree, applyFilters, humanDateTime } from './timeUtils.js';
import { checkSlotAvailability, bookAppointment } from './calendar.js';
import { tts } from './tts.js';
import { 
  aiPlan, 
  parseNumberChoice, 
  matchNaturalToProposed, 
  sanitizeReply, 
  negativeIntent, 
  isRemodelIntent 
} from './aiPlanner.js';
import { logTwilioCall } from './logger.js';

// ---------- State & helpers ----------
export const calls = new Map(); // CallSid -> { state, history, filters }

export function say(vr, text) { 
  vr.say({ language: 'en-US' }, text); 
}

export function play(vr, url) { 
  vr.play({}, url); 
}

export function gather(vr, next, withDtmf = false) {
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

// ---------- Voice handlers ----------
export async function handleVoiceEntry(req, res) {
  logTwilioCall('voice-entry', {
    callSid: req.body.CallSid,
    from: req.body.From
  });
  
  const vr = new VoiceResponse();
  say(vr, 'This call may be recorded.');
  
  const greet = await tts(`Hey there! My name's Verter — I'm the chief robot manager here at ${COMPANY}. May I have your name, and what can I help you with today?`);
  play(vr, greet);
  gather(vr, '/gather');

  calls.set(req.body.CallSid, {
    state: { 
      phone: req.body.From, 
      greetedOnce: true, 
      lastAction: null, 
      offerAttempts: 0, 
      awaitingClose: false 
    },
    history: [{ 
      role: 'assistant', 
      content: "Hey there! My name's Verter — I'm the chief robot manager here at American Developer Group. May I have your name, and what can I help you with today?" 
    }],
    filters: null
  });

  res.type('text/xml').send(vr.toString());
}

export async function handleGather(req, res) {
  const text = (req.body.SpeechResult || '').trim();
  const sid = req.body.CallSid;
  
  logTwilioCall('gather', {
    callSid: sid,
    speechResult: text,
    digits: req.body.Digits
  });
  
  const call = calls.get(sid) || { 
    state: { 
      phone: req.body.From, 
      greetedOnce: true, 
      lastAction: null, 
      offerAttempts: 0, 
      awaitingClose: false 
    }, 
    history: [], 
    filters: null 
  };

  try {
    // Final courtesy close check
    if (call.state.awaitingClose) {
      const vr = new VoiceResponse();
      if (negativeIntent(text)) {
        const bye = await tts(`Alright! Thanks for calling ${COMPANY}. Have a great day!`);
        play(vr, bye);
        vr.hangup();
        calls.delete(sid);
        return res.type('text/xml').send(vr.toString());
      }
      call.state.awaitingClose = false;
      const cont = await tts(`Sure — what else can I help you with?`);
      play(vr, cont);
      gather(vr, '/gather');
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    // ===== Deterministic selection if last step was OFFER_SLOTS =====
    if (call.state.lastAction === 'OFFER_SLOTS' && call.state.proposed?.length) {
      // Try DTMF digit first
      if (req.body.Digits && /^[123]$/.test(req.body.Digits)) {
        const idx = parseInt(req.body.Digits, 10) - 1;
        return await confirmChosen(idx, call, sid, res);
      }
      // Try spoken number
      const numIdx = parseNumberChoice(text);
      if (numIdx >= 0 && call.state.proposed[numIdx]) return await confirmChosen(numIdx, call, sid, res);

      // Try natural date/time matching
      const natIdx = matchNaturalToProposed(text, call.state.proposed);
      if (natIdx >= 0 && call.state.proposed[natIdx]) return await confirmChosen(natIdx, call, sid, res);

      // Could not parse selection → offer again; after 2 tries add DTMF fallback
      call.state.offerAttempts = (call.state.offerAttempts || 0) + 1;
      const useDtmf = call.state.offerAttempts >= 2;
      const vr = new VoiceResponse();
      const prompt = useDtmf
        ? `Sorry, I didn't catch that. Please say "option one", "option two", or "option three" — or press 1, 2, or 3.`
        : `Sorry, I didn't catch that. Please say "option one", "option two", or "option three".`;
      const url = await tts(prompt);
      play(vr, url);
      gather(vr, '/gather', useDtmf);
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    // ===== Ask-day preference flow guard =====
    if (call.state.lastAskWasDayPref) {
      call.state.lastAskWasDayPref = false;
      call.filters = deriveFiltersFromText(text);
      // proceed to offering slots filtered
      await doOfferSlots('Got it — let me take a quick look…', call, sid, res);
      return;
    }

    // ===== Delegate to LLM planner =====
    call.history.push({ role: 'user', content: text });
    let plan = await aiPlan(call.history, call.state);

    // Apply updates
    call.state = { ...call.state, ...(plan.updates || {}) };
    plan.reply = sanitizeReply(plan.reply, call.state);

    // Guards for CLOSE_CHECK misuse
    if (plan.action === 'CLOSE_CHECK' && (isRemodelIntent(text) || !call.state.awaitingClose)) {
      plan.action = 'ASK'; // force continue
      plan.reply = plan.reply || `Got it. What's the property address for the visit?`;
    }

    // Ask day preference (first step)
    if (plan.action === 'ASK_DAY_PREFERENCE') {
      const vr = new VoiceResponse();
      const msg = plan.reply || `How about tomorrow morning, or do you prefer this Tuesday?`;
      const url = await tts(msg);
      play(vr, url);
      gather(vr, '/gather');
      call.filters = null;
      call.state.lastAskWasDayPref = true;
      call.state.lastAction = 'ASK_DAY_PREFERENCE';
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    // Never offer slots without address
    if (plan.action === 'OFFER_SLOTS' && !call.state.address) {
      plan.action = 'ASK';
      plan.reply = plan.reply || `Sure. What's the property address for the visit?`;
    }

    if (['ALT_JOB', 'ALT_PARTNER', 'ALT_MARKETING'].includes(plan.action)) {
      const vr = new VoiceResponse();
      const url = await tts((plan.reply || 'Thanks!') + ' Can I help you with anything else today?');
      play(vr, url);
      gather(vr, '/gather');
      call.state.awaitingClose = true;
      call.state.lastAction = 'ALT';
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    if (plan.action === 'OFFER_SLOTS') {
      await doOfferSlots(plan.reply || 'Here are the first available options.', call, sid, res);
      return;
    }

    if (plan.action === 'BOOK') {
      const idx = typeof plan.chosen_index === 'number' ? plan.chosen_index : 0;
      return await bookChosen(idx, plan.reply, call, sid, res);
    }

    if (plan.action === 'CLOSE_CHECK') {
      const vr = new VoiceResponse();
      const url = await tts((plan.reply || 'Got it.') + ' Can I help you with anything else today?');
      play(vr, url);
      gather(vr, '/gather');
      call.state.awaitingClose = true;
      call.state.lastAction = 'CLOSE_CHECK';
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    // ASK (default)
    {
      const vr = new VoiceResponse();
      const msg = plan.reply || `Sure. What's the property address for the visit?`;
      const url = await tts(msg);
      play(vr, url);
      gather(vr, '/gather');
      call.state.greetedOnce = true;
      call.state.lastAction = 'ASK';
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

  } catch (e) {
    console.error('Planner error:', e, 'User said:', text);
    const vr = new VoiceResponse();
    const url = await tts(`Sorry, I had a glitch. Want to try that again?`);
    play(vr, url);
    gather(vr, '/gather');
    call.state.lastAction = 'ASK';
    calls.set(sid, call);
    return res.type('text/xml').send(vr.toString());
  }
}

export async function handleVoicemail(req, res) {
  logTwilioCall('voicemail', {
    callSid: req.body.CallSid
  });
  
  const vr = new VoiceResponse();
  const url = await tts(`Thank you. Your message has been recorded. Goodbye.`);
  play(vr, url);
  vr.hangup();
  res.type('text/xml').send(vr.toString());
}

// ---------- Helper functions ----------
async function doOfferSlots(prefix, call, sid, res) {
  const allFree = await findFree(new Date(), 10);
  const filtered = applyFilters(allFree, call.filters);
  const shortlist = filtered.slice(0, 3);
  call.state.proposed = shortlist;
  call.state.offerAttempts = 0;

  const vr = new VoiceResponse();
  let speech;
  if (shortlist.length) {
    const options = shortlist.map((s, i) => `Option ${i + 1}: ${humanDateTime(s.start)}.`).join(' ');
    speech = `${prefix} ${options} Please say the option number.`;
  } else {
    speech = `I don't see open time for that preference. Would you like me to check other days or times?`;
  }
  const url = await tts(speech);
  play(vr, url);
  gather(vr, '/gather');
  call.state.lastAction = 'OFFER_SLOTS';
  calls.set(sid, call);
  res.type('text/xml').send(vr.toString());
}

async function confirmChosen(idx, call, sid, res) {
  const slot = call.state.proposed?.[idx];
  if (!slot) {
    const vr = new VoiceResponse();
    const url = await tts(`Sorry, that option isn't available. Would you like me to read the options again?`);
    play(vr, url);
    gather(vr, '/gather');
    calls.set(sid, call);
    return res.type('text/xml').send(vr.toString());
  }
  call.state.chosenIndex = idx;
  const vr = new VoiceResponse();
  const msg = `Perfect. ${humanDateTime(slot.start)}, at ${call.state.address || 'your address'}. Shall I book it?`;
  const url = await tts(msg);
  play(vr, url);
  gather(vr, '/gather');
  call.state.lastAction = 'CONFIRM';
  calls.set(sid, call);
  return res.type('text/xml').send(vr.toString());
}

async function bookChosen(idx, customReply, call, sid, res) {
  const slot = call.state.proposed?.[idx];
  if (!slot) {
    return await doOfferSlots('No problem. Here are the options.', call, sid, res);
  }
  
  // Final collision check
  const isAvailable = await checkSlotAvailability(slot);
  if (!isAvailable) {
    const vr = new VoiceResponse();
    const url = await tts(`Sorry, that time just became unavailable. Would you like the next available options?`);
    play(vr, url);
    gather(vr, '/gather');
    call.state.lastAction = 'ASK';
    calls.set(sid, call);
    return res.type('text/xml').send(vr.toString());
  }
  
  // Book
  await bookAppointment(slot, call.state);
  const vr = new VoiceResponse();
  const msg = customReply || `All set! You're booked for ${humanDateTime(slot.start)} at ${call.state.address || 'your address'}.`;
  const url = await tts(msg + ' Can I help you with anything else today?');
  play(vr, url);
  gather(vr, '/gather');
  call.state.awaitingClose = true;
  call.state.lastAction = 'BOOKED';
  calls.set(sid, call);
  return res.type('text/xml').send(vr.toString());
}

// Import deriveFiltersFromText from timeUtils
import { deriveFiltersFromText } from './timeUtils.js';
