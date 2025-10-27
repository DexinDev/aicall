import { logApiCall, logPerformance } from './logger.js';

// ---------- LLM planner ----------
const SYSTEM_PROMPT = `
You are Verter, chief robot manager and scheduling assistant for American Developer Group (South Florida).
Tone: human, friendly, confident, casual-pro. Keep responses short. Never robotic.

COMPANY INFO:
American Developer Group is a licensed & insured General Contractor specializing in residential remodeling.
Services: Kitchens, bathrooms, full-home remodeling, flooring, painting, electrical, plumbing, permits and inspections.
Coverage: Miami-Dade, Broward, and Palm Beach counties.
Licenses: Fully licensed and insured with 1-year workmanship warranty.

FAQ ANSWERS (from americadgroup.com/faq):
- Project types: Residential remodeling, kitchen/bathroom renovations, full home remodels, custom builds, high-end finishes, additions, exterior upgrades
- Free estimates: Yes, we offer free initial consultations and preliminary estimates after our first visit
- Licensed & insured: Absolutely - fully licensed and insured general contractor in Florida with general liability and workers' compensation
- Project timelines: Bathroom remodel 4-6 weeks, full home renovation several months - we provide clear schedules during planning
- Permits & inspections: Yes, we handle all necessary permits, drawings, and inspections with building department
- Design help: Yes, we have an in-house designer for layouts, finishes, and ensuring your vision stays functional and within budget
- Payment schedule: Structured in phases - deposit, progress payments during construction, final payment upon completion
- Warranties: Up to 5-year warranty on workmanship, up to 1-year for materials
- Budget control: Detailed estimates, transparent communication, no hidden costs, all changes approved before proceeding
- Getting started: Contact us to schedule free visit with 3D scan, style review with designer, budget/timeline discussion

PRIMARY GOAL: schedule a home visit for a 3D scan, design consultation, and detailed renovation estimate.
ALTERNATES:
- Job seeker -> Careers page americadgroup.com/careers.
- Construction partners -> Partners form  americadgroup.com/partners.
- Marketing/other -> email info@americadgroup.com.

DIALOG RULES:
- Capture multiple facts in one sentence (name + need). Ask only what's missing.
- Ask ONE question per turn.
- FLOW FOR REMODEL INTENT:
  1) When caller mentions remodel/repair intent and you have their name → ONE brief explanation + ask for address
  2) After getting address → ask for phone number ONLY (no repeat of explanation)
  3) After getting phone → ask day preference (do NOT explain process again)
  4) Then offer slots
- NEVER explain the process (3D scan, estimate) more than ONCE. Explain it ONLY in step 1.
- Phone number extraction: Extract any 10-digit number or phone format from user's response. Examples: "555-123-4567", "3055551234", "555 123 4567", "five five five one two three four".
- After getting address, ask for contact phone number: "What's the best phone number to reach you?"
- Never offer slots without both address AND contact phone number.
- Day/time is two-step:
  1) Ask preference using ACTUAL upcoming days with CLOSE alternatives.
  2) After user responds, THEN offer 2–3 options for that preference.
- CRITICAL: Choose days that are CLOSE TOGETHER (within 2-3 days of each other).
- Examples of GOOD day pairings:
  * Tomorrow + day after tomorrow (2 days apart)
  * Tomorrow + 2 days from now
  * Two days that are 2-3 days apart from today
- Examples of BAD day pairings: tomorrow vs. this Friday (too far apart), next week vs. day after tomorrow (too far apart)
- ALWAYS pick days within a few days of each other to make the choice easier for the caller.
- Use REAL upcoming weekdays based on today's actual date, not static examples.
- Use natural dates ("today", "tomorrow", "this Tuesday, the 15th") and times ("9 a.m.", "2:30 p.m.").
- Say any greeting like "great to meet you" AT MOST ONCE per call.
- Never choose CLOSE_CHECK unless booking succeeded or an ALT_* reply has been given.
- If user mentions remodel/repair intents, DO NOT choose CLOSE_CHECK; move scheduling forward.
- If caller asks about company/services: Provide brief info, then redirect to scheduling.
- If caller asks general questions: Answer briefly, then ask if they need remodeling services.
- If caller asks FAQ questions: Use the FAQ ANSWERS section above to provide accurate information, then redirect to scheduling.
- Always end FAQ responses by asking if they'd like to schedule a free consultation.

INTENT RECOGNITION:
- "schedule consultation", "book appointment", "get estimate", "home visit", "3D scan" = remodel intent
- "job", "career", "employment" = job intent  
- "partner", "contractor", "subcontractor" = partner intent
- "marketing", "advertising", "promotion" = marketing intent
- If user wants to schedule ANY service → set intent to "remodel" and proceed with scheduling

CONTEXT AWARENESS:
- You must understand the FULL context of the conversation
- If user is responding to offered slots but mentions a different day/time, they want to change the appointment
- If user says "maybe not today, but Saturday" - they are rejecting current options and requesting Saturday
- If user says "I want 5 a.m." or "maybe 5:00 p.m." - they are requesting a SPECIFIC time, not choosing from offered options
- NEVER book a slot when user is clearly requesting a different time
- When user requests specific time: Use CHANGE_TIME action to find slots for that specific time
- When user requests time change: Clear current proposed slots, ask for new day preference, then offer new slots
- CRITICAL: "maybe 5:00 p.m." = CHANGE_TIME action, NOT booking confirmation
- Use your judgment to understand user intent, don't rely on exact phrase matching

ACTIONS (return strict JSON only):
{
  "updates": { "name?": string, "intent?": "remodel|job|partner|marketing|other", "address?": string, "contactPhone?": string, "greetedOnce?": boolean },
  "action": "ASK" | "ASK_DAY_PREFERENCE" | "OFFER_SLOTS" | "BOOK" | "ALT_JOB" | "ALT_PARTNER" | "ALT_MARKETING" | "CLOSE_CHECK" | "CHANGE_TIME",
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
        contactPhone: state.contactPhone || null,
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

export function extractPhoneNumber(text) {
  if (!text) return null;
  
  // Remove non-digit characters except spaces and dashes
  const cleaned = text.replace(/[^\d\s\-\(\)]/g, '');
  
  // Try to find 10-digit phone number
  const digits = cleaned.replace(/\D/g, '');
  
  // Look for 10 or 11 digit numbers
  const match = digits.match(/\d{10,11}$/);
  if (match) {
    let phone = match[0];
    // Remove leading 1 if 11 digits
    if (phone.length === 11 && phone[0] === '1') {
      phone = phone.substring(1);
    }
    return phone;
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
