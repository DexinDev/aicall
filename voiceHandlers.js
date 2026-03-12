import twilio from 'twilio';
const { VoiceResponse } = twilio.twiml;
import { COMPANY, GATHER_TIMEOUT_SEC, GATHER_SPEECH_TIMEOUT } from './config.js';
import { tts } from './tts.js';
import { aiPlan, sanitizeReply } from './aiPlanner.js';
import { logTwilioCall } from './logger.js';

// ---------- State & helpers ----------
export const calls = new Map(); // CallSid -> { state, history }

// Pre-recorded filler snippets to play while thinking
// Files are stored under audio/fillers/ in the project root.
const FILLER_FILES = [
  '/media/fillers/ok_give_me_one_second.mp3',
  '/media/fillers/one_second_please.mp3',
  '/media/fillers/gotcha_let_me_check_real_quick.mp3',
  '/media/fillers/alright_just_a_moment.mp3',
  '/media/fillers/sure_let_me_see.mp3',
  '/media/fillers/got_it_let_me_think_for_a_sec.mp3'
];

function pickFiller() {
  if (!FILLER_FILES.length) return null;
  const idx = Math.floor(Math.random() * FILLER_FILES.length);
  return FILLER_FILES[idx];
}

export function say(vr, text) { 
  vr.say({ language: 'en-US' }, text); 
}

export function play(vr, url) { 
  vr.play({}, url); 
}

export function gather(vr, next) {
  const params = {
    input: 'speech',
    action: next,
    method: 'POST',
    enhanced: true,
    timeout: GATHER_TIMEOUT_SEC,
    speechTimeout: GATHER_SPEECH_TIMEOUT,
    actionOnEmptyResult: true
  };
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

  // Play pre-recorded intro explaining Full Day Handyman and asking what they need
  play(vr, '/media/intro.mp3');
  gather(vr, '/gather');

  const now = Date.now();
  calls.set(req.body.CallSid, {
    state: { 
      phone: req.body.From, 
      intent: null,
      startedAt: now,
      lastPromptAt: now
    },
    history: []
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
      intent: null,
      startedAt: Date.now(),
      lastPromptAt: null
    }, 
    history: [] 
  };

  try {
    // Rough STT + user response latency measurement
    const now = Date.now();
    if (call.state.lastPromptAt) {
      const totalLatency = now - call.state.lastPromptAt;
      console.log(`STT+user latency for CallSid=${sid}: ${totalLatency}ms`);
    }

    // If no speech recognized, ask again briefly
    if (!text) {
      const vr = new VoiceResponse();
      const filler = pickFiller();
      if (filler) {
        play(vr, filler);
        vr.pause({ length: 1 });
      }
      const url = await tts(`Sorry, I didn't catch that. What can we help you with today?`);
      play(vr, url);
      gather(vr, '/gather');
      call.state.lastPromptAt = Date.now();
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    // ----- Fast deterministic routing for obvious cases -----
    const t = text.toLowerCase();

    const isJobIntent =
      // generic job / career words
      /(job|work for you|work with you|looking for work|hiring|position|career|apply|application|resume|cv)/.test(t) ||
      // handyman job specifically
      /(handyman\s+job|job\s+for\s+a?\s*handyman|work\s+as\s+a?\s*handyman)/.test(t);

    const isOfferIntent =
      /(marketing|advertis(ing|e)|seo|leads?|lead generation|sell you|offer you (services|software)|partnership|partner with you)/.test(t);

    const isHandymanIntent =
      /(handyman|repair|fix|remodel|renovat|installation|install|mount|leak|broken|damage|maintenance|plumb|electric|door|window)/.test(t);

    // Obvious job intent (has priority even if "handyman" also mentioned)
    if (isJobIntent) {
      const vr = new VoiceResponse();
      const filler = pickFiller();
      if (filler) {
        play(vr, filler);
        vr.pause({ length: 1 });
      }
      play(vr, '/media/job.mp3');
      vr.hangup();
      calls.delete(sid);
      return res.type('text/xml').send(vr.toString());
    }

    // Obvious offer/marketing intent
    if (isOfferIntent) {
      const vr = new VoiceResponse();
      const filler = pickFiller();
      if (filler) {
        play(vr, filler);
        vr.pause({ length: 1 });
      }
      play(vr, '/media/offer.mp3');
      vr.hangup();
      calls.delete(sid);
      return res.type('text/xml').send(vr.toString());
    }

    // Obvious handyman / repair intent
    if (!isJobIntent && isHandymanIntent) {
      const vr = new VoiceResponse();
      const filler = pickFiller();
      if (filler) {
        play(vr, filler);
        vr.pause({ length: 1 });
      }
      play(vr, '/media/human.mp3');
      vr.dial('+15619316869');
      calls.delete(sid);
      return res.type('text/xml').send(vr.toString());
    }

    // ----- Delegate to LLM planner for routing / clarification -----
    call.history.push({ role: 'user', content: text });
    let plan = await aiPlan(call.history, call.state);

    // Apply updates
    call.state = { ...call.state, ...(plan.updates || {}) };
    plan.reply = sanitizeReply(plan.reply, call.state);

    // Handle routing actions
    if (plan.action === 'ROUTE_HANDYMAN') {
      const vr = new VoiceResponse();
      // Play explanation for human transfer
      play(vr, '/media/human.mp3');
      // Then transfer to live human
      vr.dial('+15619316869');
      calls.delete(sid);
      return res.type('text/xml').send(vr.toString());
    }

    if (plan.action === 'ROUTE_JOB') {
      const vr = new VoiceResponse();
      play(vr, '/media/job.mp3');
      vr.hangup();
      calls.delete(sid);
      return res.type('text/xml').send(vr.toString());
    }

    if (plan.action === 'ROUTE_OFFER') {
      const vr = new VoiceResponse();
      play(vr, '/media/offer.mp3');
      vr.hangup();
      calls.delete(sid);
      return res.type('text/xml').send(vr.toString());
    }

    if (plan.action === 'END') {
      const vr = new VoiceResponse();
      const msg = plan.reply || `Thanks for calling ${COMPANY}. Have a great day!`;
      const filler = pickFiller();
      if (filler) {
        play(vr, filler);
        vr.pause({ length: 1 });
      }
      const url = await tts(msg);
      play(vr, url);
      vr.hangup();
      calls.delete(sid);
      return res.type('text/xml').send(vr.toString());
    }

    // ASK (default or explicit)
    {
      const vr = new VoiceResponse();
      const msg = plan.reply || `Could you tell me a little more about what you need help with?`;
      const filler = pickFiller();
      if (filler) {
        play(vr, filler);
        vr.pause({ length: 1 });
      }
      const url = await tts(msg);
      play(vr, url);
      gather(vr, '/gather');
      call.state.lastPromptAt = Date.now();
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

  } catch (e) {
    console.error('Planner error:', e, 'User said:', text);
    const vr = new VoiceResponse();
    const filler = pickFiller();
    if (filler) {
      play(vr, filler);
      vr.pause({ length: 1 });
    }
    const url = await tts(`Sorry, I had a glitch. Want to try that again?`);
    play(vr, url);
    gather(vr, '/gather');
    calls.set(sid, call);
    return res.type('text/xml').send(vr.toString());
  }
}

export async function handleVoicemail(req, res) {
  logTwilioCall('voicemail', {
    callSid: req.body.CallSid
  });
  
  const vr = new VoiceResponse();
  const url = await tts(`Thank you for calling ${COMPANY}. Your message has been recorded. Goodbye.`);
  play(vr, url);
  vr.hangup();
  res.type('text/xml').send(vr.toString());
}
