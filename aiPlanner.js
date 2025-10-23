import { logApiCall, logPerformance } from './logger.js';

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
  1) Ask preference ("tomorrow morning or this Tuesday?").
  2) After user responds, THEN offer 2–3 options for that preference.
- Use natural dates ("today", "tomorrow", "this Tuesday, the 15th") and times ("9 a.m.", "2:30 p.m.").
- Say any greeting like "great to meet you" AT MOST ONCE per call.
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

export async function aiPlan(history, state) {
  const startTime = Date.now();
  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'system', content: `Current state:\n${JSON.stringify({
        name: state.name || null,
        intent: state.intent || null,
        address: state.address || null,
        greetedOnce: !!state.greetedOnce
      }, null, 2)}` }
    ],
    temperature: 0.3,
    response_format: { type: "json_object" }
  };
  
  try {
    const r = await fetch(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(body)
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    if (!r.ok) {
      const errorText = await r.text();
      logApiCall('openai', 'chat-completions', startTime, endTime, {
        prompt: `Messages: ${history.length + 2}, State: ${JSON.stringify(state)}`,
        error: errorText
      });
      throw new Error('LLM error: ' + errorText);
    }
    
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    
    logApiCall('openai', 'chat-completions', startTime, endTime, {
      prompt: `Messages: ${history.length + 2}, State: ${JSON.stringify(state)}`,
      response: JSON.stringify(parsed)
    });
    
    logPerformance('OpenAI Chat', duration, 3000);
    
    return parsed;
  } catch (error) {
    const endTime = Date.now();
    logApiCall('openai', 'chat-completions', startTime, endTime, {
      prompt: `Messages: ${history.length + 2}, State: ${JSON.stringify(state)}`,
      error: error.message
    });
    throw error;
  }
}

// ---------- Deterministic selection parsing ----------
export function parseNumberChoice(text) {
  const t = (text || '').toLowerCase();
  if (/(^|\b)(option\s*)?(one|first|1)\b/.test(t)) return 0;
  if (/(^|\b)(option\s*)?(two|second|2|too|to)\b/.test(t)) return 1;
  if (/(^|\b)(option\s*)?(three|third|3)\b/.test(t)) return 2;
  return -1;
}

export function matchNaturalToProposed(text, proposed) {
  if (!proposed || !proposed.length) return -1;
  const t = (text || '').toLowerCase();
  
  // crude weekday & time hints
  const wdMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  let targetWd = null;
  
  for (const key of Object.keys(wdMap)) { 
    if (new RegExp(`\\b${key}\\b`).test(t)) { 
      targetWd = wdMap[key]; 
      break; 
    } 
  }
  
  // time: hh[:mm] am/pm or hh.mm
  const m = t.match(/(\b([1-9]|1[0-2])([:\.][0-5][0-9])?\s*(a\.?m\.?|p\.?m\.?)\b)|\b([01]?\d|2[0-3])([:\.][0-5][0-9])?\b/);
  let targetMins = null; // minutes since midnight local
  
  if (m) {
    let raw = m[0].replace(/\./g, '').trim(); // remove dots in am/pm
    let hhmm = raw.match(/(\d{1,2})([:\.](\d{2}))?/);
    if (hhmm) {
      let hh = parseInt(hhmm[1], 10);
      const mm = hhmm[3] ? parseInt(hhmm[3], 10) : 0;
      const ap = /pm/i.test(raw) ? 'pm' : (/am/i.test(raw) ? 'am' : null);
      if (ap === 'pm' && hh < 12) hh += 12;
      if (ap === 'am' && hh === 12) hh = 0;
      targetMins = hh * 60 + mm;
    }
  }
  
  // score proposed slots
  let bestIdx = -1, bestScore = 1e9;
  for (let i = 0; i < proposed.length; i++) {
    const d = proposed[i].start;
    let score = 0;
    
    if (targetWd !== null) {
      const diffWd = Math.min((Math.abs(d.getDay() - targetWd)), 7 - Math.abs(d.getDay() - targetWd));
      score += diffWd * 1000; // heavy weight by weekday
    }
    
    if (targetMins !== null) {
      const mins = d.getHours() * 60 + d.getMinutes();
      score += Math.abs(mins - targetMins);
    }
    
    if (score < bestScore) { 
      bestScore = score; 
      bestIdx = i; 
    }
  }
  
  return bestIdx;
}

// ---------- State & helpers ----------
export function sanitizeReply(reply, state) {
  if (!reply) return reply;
  let out = reply;
  
  if (state.greetedOnce) {
    out = out.replace(/\b(great|nice|glad)\s+to\s+meet\s+you\b.*?([.!?]|$)/gi, '');
  }
  
  out = out.replace(/\s{2,}/g, ' ').trim();
  return out;
}

export function negativeIntent(s) {
  const t = (s || '').toLowerCase();
  return /\b(no|nope|nah|nothing|i'?m good|that'?s all|that is all|thanks|thank you|we're good|we are good)\b/.test(t);
}

export function isRemodelIntent(s) {
  const t = (s || '').toLowerCase();
  return /(remodel|renovat|repair|bath(room)?|kitchen|estimate|scan|design|floor|paint)/.test(t);
}
