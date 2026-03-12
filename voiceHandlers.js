import twilio from 'twilio';
const { VoiceResponse } = twilio.twiml;
import { COMPANY, GATHER_TIMEOUT_SEC, GATHER_SPEECH_TIMEOUT, GATHER_SPEECH_MODEL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } from './config.js';
import { tts } from './tts.js';
import { aiPlan, sanitizeReply } from './aiPlanner.js';
import { logTwilioCall } from './logger.js';

// ---------- State & helpers ----------
export const calls = new Map(); // CallSid -> { state, history }

const twilioClient = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN)
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

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

function extractZipFromSpeech(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  // First, try to extract 5 consecutive digits
  const digitsOnly = lower.replace(/\D/g, '');
  const m = digitsOnly.match(/\d{5}/);
  if (m) return m[0];

  // Fallback: words like "three three one one zero"
  const wordToDigit = {
    'zero': '0', 'oh': '0', 'o': '0',
    'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
    'six': '6', 'seven': '7', 'eight': '8', 'nine': '9'
  };
  const words = lower.split(/\s+/);
  let acc = '';
  for (const w of words) {
    if (wordToDigit[w]) acc += wordToDigit[w];
  }
  if (acc.length === 5) return acc;

  return null;
}

export function say(vr, text) { 
  logTwilioCall('say', { text });
  vr.say({ language: 'en-US' }, text); 
}

export function play(vr, url) { 
  logTwilioCall('play', { audioUrl: url });
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
  if (GATHER_SPEECH_MODEL) {
    params.speechModel = GATHER_SPEECH_MODEL;
  }
  return vr.gather(params);
}

// ---------- Voice handlers ----------
export async function handleVoiceEntry(req, res) {
  logTwilioCall('voice-entry', {
    callSid: req.body.CallSid,
    from: req.body.From
  });
  
  const vr = new VoiceResponse();

  // Start recording the call via REST API (both legs)
  if (twilioClient && req.body.CallSid) {
    (async () => {
      try {
        await twilioClient.calls(req.body.CallSid).recordings.create({
          recordingStatusCallback: 'https://ai-call.on-forge.com/recording',
          recordingStatusCallbackMethod: 'POST'
        });
      } catch (err) {
        console.error('Error starting call recording:', err);
      }
    })();
  }

  // Play pre-recorded intro (includes greeting and recording notice)
  play(vr, '/media/intro.mp3');
  gather(vr, '/gather');

  const now = Date.now();
  calls.set(req.body.CallSid, {
    state: { 
      phone: req.body.From, 
      intent: null,
      zip: null,
      county: null,
      service_covered: null,
      task_list_summary: null,
      needs_callback: null,
      callback_phone: null,
      endedAt: null,
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
      zip: null,
      county: null,
      service_covered: null,
      task_list_summary: null,
      needs_callback: null,
      callback_phone: null,
      endedAt: null,
      mode: 'waiting_user',
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

    // Try to capture ZIP from this utterance and update state
    const maybeZip = extractZipFromSpeech(text);
    if (maybeZip && maybeZip !== call.state.zip) {
      call.state.zip = maybeZip;
      // county / service_covered are determined by the model using zip list rules in the prompt
    }

    // If no speech recognized — мягко перепросим.
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

    // Obvious handyman intent now handled fully by AI planner (no human transfer)

    // ---------- Async planning with REST call update ----------
    call.history.push({ role: 'user', content: text });
    call.state.mode = 'thinking';
    const stateSnapshot = { ...call.state };
    const historySnapshot = [...call.history];
    calls.set(sid, call);

    if (twilioClient) {
      (async () => {
        try {
          let plan = await aiPlan(historySnapshot, stateSnapshot);
          plan = plan || {};
          const updates = plan.updates || {};

          const current = calls.get(sid);
          if (!current) return;

          current.state = {
            ...current.state,
            ...updates
          };

          let reply = plan.reply || `Could you tell me a little more about what you need help with?`;
          reply = sanitizeReply(reply, current.state);
          const action = plan.action || 'ASK';

          const vr2 = new VoiceResponse();
          const url = await tts(reply);
          play(vr2, url);

          if (action === 'END') {
            vr2.hangup();
            current.state.endedAt = Date.now();
            current.state.mode = 'done';
          } else {
            // Для REST-обновления TwiML нужен абсолютный URL для action,
            // иначе Twilio не знает, куда отправлять следующий gather.
            gather(vr2, 'https://ai-call.on-forge.com/gather');
            current.state.lastPromptAt = Date.now();
            current.state.mode = 'waiting_user';
          }

          calls.set(sid, current);
          await twilioClient.calls(sid).update({ twiml: vr2.toString() });
        } catch (err) {
          console.error('Background planner error (REST update):', err);
          // Не пытаемся делать второй update, просто логируем.
        }
      })();
    }

    // Немедленный ответ: один короткий филлер + длинная пауза, чтобы звонок оставался in-progress.
    const vr = new VoiceResponse();
    const filler = pickFiller();
    if (filler) {
      play(vr, filler);
    }
    // Пока идёт pause, Twilio будет считать вызов in-progress и примет последующий calls.update.
    vr.pause({ length: 120 });
    return res.type('text/xml').send(vr.toString());

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
