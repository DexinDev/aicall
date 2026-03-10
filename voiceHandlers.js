import twilio from 'twilio';
const { VoiceResponse } = twilio.twiml;
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
import { COMPANY } from './config.js';
import { tts } from './tts.js';
import { aiPlan, sanitizeReply } from './aiPlanner.js';
import { logTwilioCall } from './logger.js';

// ---------- State & helpers ----------
export const calls = new Map(); // CallSid -> { state, history }

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
    timeout: 10,
    speechTimeout: 'auto',
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

  calls.set(req.body.CallSid, {
    state: { 
      phone: req.body.From, 
      intent: null 
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
      intent: null 
    }, 
    history: [] 
  };

  try {
    // If no speech recognized, ask again briefly
    if (!text) {
      const vr = new VoiceResponse();
      const url = await tts(`Sorry, I didn't catch that. What can we help you with today?`);
      play(vr, url);
      gather(vr, '/gather');
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

    // Delegate to LLM planner for routing / clarification
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
      const url = await tts(msg);
      play(vr, url);
      gather(vr, '/gather');
      calls.set(sid, call);
      return res.type('text/xml').send(vr.toString());
    }

  } catch (e) {
    console.error('Planner error:', e, 'User said:', text);
    const vr = new VoiceResponse();
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

// ---------- Call status callback (for auto-callback on very short calls) ----------
export async function handleStatus(req, res) {
  try {
    const status = req.body.CallStatus;
    const direction = req.body.Direction;
    const duration = parseInt(req.body.CallDuration || '0', 10);
    const from = req.body.From;
    const to = req.body.To;

    // Only react to very short INBOUND calls (caller hung up quickly / was silent)
    if (direction === 'inbound' && status === 'completed' && duration > 0 && duration <= 10) {
      // Call the client back and start the normal /voice flow
      await twilioClient.calls.create({
        to: from,
        from: to,
        url: `${process.env.BASE_URL}/voice`
      });
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('Status callback error:', e);
    res.sendStatus(500);
  }
}
