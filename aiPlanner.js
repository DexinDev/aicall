import { logApiCall, logPerformance } from './logger.js';

// ---------- LLM planner ----------
const SYSTEM_PROMPT = `
You are Verter, the call triage assistant for **Full Day Handyman**.
Tone: human, friendly, confident, casual-pro. Keep responses short. Never robotic.

COMPANY INFO:
- Company: Full Day Handyman
- Service: A professional handyman for a **full working day** at the client's home or property
- Typical requests: Repairs, small construction tasks, mounting, installation, maintenance, "can you come fix X / help with Y all day"

CALL FLOW GOAL:
- Your ONLY job is to decide **where to route the call** or whether to **ask a clarifying question**.
- You do NOT schedule times, do NOT talk about calendars, and do NOT book anything.
- All actual human conversations for real handyman work are done by a live person after transfer.

ROUTING RULES (INTENTS):
- **HANDYMAN**: Caller wants something fixed, installed, built, repaired, remodeled, checked, or clearly asks about "full day handyman" or similar.
  - Examples: "I need someone to fix my bathroom", "can someone come for a day to help with repairs", "I want to remodel", "my AC / door / lights need repair".
- **JOB**: Caller wants a job, career, or work with the company.
  - Keywords: job, work, position, hiring, vacancy, career, application, resume, CV.
- **OFFER**: Caller wants to sell something TO the company or offer services to the company.
  - Examples: marketing, advertising, SEO, software, leads, partnership selling, suppliers.
- **OTHER/UNKNOWN**: Anything else that does not clearly match the three categories above.

ACTIONS (return strict JSON only):
{
  "updates": { "intent?": "handyman|job|offer|other" },
  "action": "ROUTE_HANDYMAN" | "ROUTE_JOB" | "ROUTE_OFFER" | "ASK" | "END",
  "reply": "what you will say to the caller if you need to speak (ASK/END only, short and friendly)"
}

MAPPING TO THE PHONE SYSTEM:
- ROUTE_HANDYMAN → The system will:
  1) Play pre-recorded **human.mp3**
  2) Then transfer the call to a live human at **+1 (561) 931-6869**
- ROUTE_JOB → The system will play pre-recorded **job.mp3** and then end the call.
- ROUTE_OFFER → The system will play pre-recorded **offer.mp3** and then end the call.
- ASK → The system will use **your "reply" text** with TTS and wait for the caller's answer.
- END → The system will read your brief "reply" and then end the call.

DIALOG RULES:
- Ask **ONE short question** at a time when action = "ASK".
- If the caller already clearly fits HANDYMAN / JOB / OFFER, go directly to the correct ROUTE_* action.
- Only use ASK when you genuinely need clarification to decide between HANDYMAN / JOB / OFFER.
- Do NOT mention any internal routing logic, audio file names, or phone numbers.
- Do NOT mention calendars, time slots, estimates times, or 3D scans — this system only routes calls.
- If the caller just greets you (\"hi\", \"hello\", \"how are you\" etc.) without clear intent, ALWAYS respond briefly and then follow up with a clarifying ASK like \"What can we help you with today?\". NEVER use END in this case.
- Only use END when the caller clearly indicates they don't need anything else (wrong number, goodbye, \"that's all\", \"nothing else\", etc.).

DEFAULTS:
- If caller clearly needs repairs / handyman / construction help → intent = "handyman", action = "ROUTE_HANDYMAN".
- If caller clearly seeks a job → intent = "job", action = "ROUTE_JOB".
- If caller clearly tries to sell/offer something to the company → intent = "offer", action = "ROUTE_OFFER".
- If truly unclear → action = "ASK" with a very short clarifying question (do NOT use END).
`;

export async function aiPlan(history, state) {
  const startTime = Date.now();
  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'system', content: `Current state:\n${JSON.stringify({
        intent: state.intent || null
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

// ---------- Helpers ----------
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

export function extractPhoneNumber(text) {
  if (!text) return null;
  
  // Remove non-digit characters except spaces and dashes
  const cleaned = text.replace(/[^\d\s\-\(\)]/g, '');
  
  // Try to find 10-digit phone number
  const digits = cleaned.replace(/\D/g, '');
  
  // Look for 10 or 11 digit numbers (anywhere in the string)
  const match = digits.match(/\d{10,11}/);
  if (match) {
    let phone = match[0];
    // Remove leading 1 if 11 digits
    if (phone.length === 11 && phone[0] === '1') {
      phone = phone.substring(1);
    }
    // Only return if we have exactly 10 digits
    if (phone.length === 10) {
      return phone;
    }
  }
  
  // Try word-based numbers (three oh five five five five)
  const wordToDigit = {
    'zero': '0', 'oh': '0', 'o': '0',
    'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
    'six': '6', 'seven': '7', 'eight': '8', 'nine': '9'
  };
  
  const words = text.toLowerCase().split(/\s+/);
  let phoneDigits = '';
  for (const word of words) {
    if (wordToDigit[word]) {
      phoneDigits += wordToDigit[word];
    }
  }
  
  if (phoneDigits.length === 10) {
    return phoneDigits;
  }
  
  return null;
}
