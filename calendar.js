import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';
import { TZ } from './config.js';
import { addMinutes, workingSlots } from './timeUtils.js';
import { logApiCall, logPerformance } from './logger.js';

// ---------- Google Calendar API ----------
export async function gCal() {
  const auth = new GoogleAuth({
    credentials: { 
      client_email: process.env.GOOGLE_CLIENT_EMAIL, 
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') 
    },
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
  
  let client = await auth.getClient();
  
  if (process.env.GOOGLE_IMPERSONATE_USER) {
    client = auth.fromJSON({ 
      type: 'service_account', 
      client_email: process.env.GOOGLE_CLIENT_EMAIL, 
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') 
    });
    client.subject = process.env.GOOGLE_IMPERSONATE_USER;
  }
  
  return google.calendar({ version: 'v3', auth: client });
}

export async function findFree(from, days = 10) {
  const startTime = Date.now();
  
  try {
    const cal = await gCal();
    const timeMin = new Date(from).toISOString();
    const timeMax = addMinutes(new Date(from), days * 24 * 60).toISOString();
    
    const fb = await cal.freebusy.query({ 
      requestBody: { 
        timeMin, 
        timeMax, 
        timeZone: TZ, 
        items: [{ id: process.env.CALENDAR_ID }] 
      } 
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    const busy = (fb.data.calendars?.[process.env.CALENDAR_ID]?.busy || [])
      .map(b => ({ start: new Date(b.start), end: new Date(b.end) }));
    
    const all = workingSlots(from, days);
    const free = all.filter(s => !busy.some(b => s.start < b.end && b.start < s.end));
    
    logApiCall('google-calendar', 'freebusy-query', startTime, endTime, {
      prompt: `From: ${from}, Days: ${days}`,
      response: `Found ${free.length} free slots out of ${all.length} total`
    });
    
    logPerformance('Google Calendar FreeBusy', duration, 2000);
    
    return free;
  } catch (error) {
    const endTime = Date.now();
    logApiCall('google-calendar', 'freebusy-query', startTime, endTime, {
      prompt: `From: ${from}, Days: ${days}`,
      error: error.message
    });
    throw error;
  }
}

export async function bookAppointment(slot, callState) {
  const startTime = Date.now();
  
  try {
    const cal = await gCal();
    
    const result = await cal.events.insert({
      calendarId: process.env.CALENDAR_ID,
      requestBody: {
        summary: 'Home visit: 3D scan & estimate',
        description: `Booked by Verter AI.\nName: ${callState.name || ''}\nPhone: ${callState.contactPhone || callState.phone || ''}\nAddress: ${callState.address || ''}\nIntent: ${callState.intent || ''}`,
        start: { dateTime: slot.start.toISOString(), timeZone: TZ },
        end: { dateTime: slot.end.toISOString(), timeZone: TZ },
        reminders: { useDefault: true }
      }
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logApiCall('google-calendar', 'events-insert', startTime, endTime, {
      prompt: `Slot: ${slot.start.toISOString()}, Name: ${callState.name}`,
      response: `Event created: ${result.data.id}`
    });
    
    logPerformance('Google Calendar Event Insert', duration, 2000);
    
    return result;
  } catch (error) {
    const endTime = Date.now();
    logApiCall('google-calendar', 'events-insert', startTime, endTime, {
      prompt: `Slot: ${slot.start.toISOString()}, Name: ${callState.name}`,
      error: error.message
    });
    throw error;
  }
}

export async function checkSlotAvailability(slot) {
  const startTime = Date.now();
  
  try {
    const cal = await gCal();
    const fb = await cal.freebusy.query({ 
      requestBody: {
        timeMin: slot.start.toISOString(),
        timeMax: slot.end.toISOString(),
        timeZone: TZ,
        items: [{ id: process.env.CALENDAR_ID }]
      } 
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    const busy = fb.data.calendars?.[process.env.CALENDAR_ID]?.busy || [];
    const isAvailable = busy.length === 0;
    
    logApiCall('google-calendar', 'freebusy-check', startTime, endTime, {
      prompt: `Slot: ${slot.start.toISOString()}`,
      response: `Available: ${isAvailable}`
    });
    
    logPerformance('Google Calendar Availability Check', duration, 1000);
    
    return isAvailable;
  } catch (error) {
    const endTime = Date.now();
    logApiCall('google-calendar', 'freebusy-check', startTime, endTime, {
      prompt: `Slot: ${slot.start.toISOString()}`,
      error: error.message
    });
    throw error;
  }
}
