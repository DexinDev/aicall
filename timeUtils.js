import { TZ, SLOT_MIN, WORK_START, WORK_END, BUFFER_MIN } from './config.js';

// ---------- Time helpers (natural speech) ----------
export function addMinutes(d, m) { 
  return new Date(d.getTime() + m * 60000); 
}

export function toLocal(d) { 
  return new Date(d.toLocaleString('en-US', { timeZone: TZ })); 
}

export function atTime(baseDate, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = toLocal(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

export function sameDay(a, b) { 
  return a.toDateString() === b.toDateString(); 
}

export function ordinal(n) { 
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function speakTime(d) {
  const hh = d.getHours();
  const mm = d.getMinutes();
  const isPM = hh >= 12;
  let h12 = hh % 12;
  if (h12 === 0) h12 = 12;
  const min = mm === 0 ? '' : `:${mm.toString().padStart(2, '0')}`;
  const ap = isPM ? 'p.m.' : 'a.m.';
  return `${h12}${min} ${ap}`;
}

export function speakDate(d) {
  const now = toLocal(new Date());
  const ld = toLocal(d);
  const today = new Date(now.toDateString());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  
  if (sameDay(ld, today)) return 'today';
  if (sameDay(ld, tomorrow)) return 'tomorrow';
  
  const wd = ld.toLocaleDateString('en-US', { weekday: 'long' });
  const num = ordinal(ld.getDate());
  const diff = (ld - today) / 86400000;
  
  if (diff >= 2 && diff <= 6) return `this ${wd}, the ${num}`;
  
  const month = ld.toLocaleDateString('en-US', { month: 'long' });
  return `${wd}, ${month} ${num}`;
}

export function humanDateTime(d) { 
  return `${speakDate(d)} at ${speakTime(d)}`; 
}

// ---------- Slots / Calendar ----------
export function workingSlots(fromDate, days = 14) {
  const out = [];
  const start = toLocal(fromDate);
  
  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    let s = atTime(day, WORK_START);
    const e = atTime(day, WORK_END);
    
    if (i === 0) {
      const minStart = addMinutes(start, BUFFER_MIN);
      while (s < minStart) s = addMinutes(s, SLOT_MIN);
    }
    
    while (addMinutes(s, SLOT_MIN) <= e) {
      out.push({ start: new Date(s), end: addMinutes(s, SLOT_MIN) });
      s = addMinutes(s, SLOT_MIN);
    }
  }
  
  return out;
}

// ---------- Preference filters ----------
export function deriveFiltersFromText(t) {
  const s = (t || '').toLowerCase();
  const res = { day: null, part: null }; // day: Date; part: 'morning'|'afternoon'|'evening'
  
  if (/morning/.test(s)) res.part = 'morning';
  else if (/afternoon/.test(s)) res.part = 'afternoon';
  else if (/evening|night/.test(s)) res.part = 'evening';

  const now = toLocal(new Date());
  const wdMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  
  if (/\btoday\b/.test(s)) res.day = new Date(now);
  else if (/\btomorrow\b/.test(s)) { 
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    res.day = d;
  } else {
    for (const key of Object.keys(wdMap)) {
      if (new RegExp(`\\b(this\\s+)?${key}\\b`).test(s)) {
        const target = wdMap[key];
        const d = new Date(now);
        let delta = (target - d.getDay() + 7) % 7;
        if (delta === 0) delta = 7; // next same weekday
        d.setDate(d.getDate() + delta);
        res.day = d;
        break;
      }
    }
  }
  
  return res;
}

export function applyFilters(slots, filters) {
  if (!filters) return slots;
  let out = slots;
  
  if (filters.day) {
    const dayRef = new Date(filters.day);
    out = out.filter(s => sameDay(s.start, dayRef));
  }
  
  if (filters.part) {
    out = out.filter(s => {
      const h = s.start.getHours();
      if (filters.part === 'morning') return h >= 9 && h < 12;
      if (filters.part === 'afternoon') return h >= 12 && h < 16;
      if (filters.part === 'evening') return h >= 16 && h < 19;
      return true;
    });
  }
  
  return out;
}
