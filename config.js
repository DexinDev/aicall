import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------- Paths / app ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIO_DIR = path.join(__dirname, 'audio');
fs.mkdirSync(AUDIO_DIR, { recursive: true });
const CALLS_DIR = path.join(__dirname, 'calls');
fs.mkdirSync(CALLS_DIR, { recursive: true });

// ---------- Configuration ----------
export const COMPANY = 'Full Day Handyman';
export const TZ = process.env.BUSINESS_TZ || 'America/New_York';
export const SLOT_MIN = parseInt(process.env.SLOT_MINUTES || '60', 10);
export const WORK_START = process.env.WORK_START || '09:00';
export const WORK_END = process.env.WORK_END || '18:00';
export const BUFFER_MIN = parseInt(process.env.MIN_BUFFER_MIN || '120', 10); // don't offer slots closer than X minutes from "now"

// Voice fillers (play only when OpenAI response is slow)
export const FILLERS_ENABLED = process.env.FILLERS_ENABLED !== 'false' && process.env.FILLERS_ENABLED !== '0';
export const FILLER_DELAY_MS = parseInt(process.env.FILLER_DELAY_MS || '1000', 10); // play filler only if OpenAI took longer than this (ms)

// Twilio Gather / STT tuning
export const GATHER_TIMEOUT_SEC = parseInt(process.env.GATHER_TIMEOUT_SEC || '10', 10); // wait for speech start
export const GATHER_SPEECH_TIMEOUT = process.env.GATHER_SPEECH_TIMEOUT || 'auto'; // seconds of silence or 'auto'
export const GATHER_SPEECH_MODEL = process.env.GATHER_SPEECH_MODEL || '';

// Calls & notifications
export const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, ''); // no trailing slash
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '';
export const CALLS_BASE_URL = process.env.CALLS_BASE_URL || `${BASE_URL || ''}/calls`;
export const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
export const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

export { AUDIO_DIR, CALLS_DIR };
