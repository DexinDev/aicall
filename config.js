import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------- Paths / app ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIO_DIR = path.join(__dirname, 'audio');
fs.mkdirSync(AUDIO_DIR, { recursive: true });

// ---------- Configuration ----------
export const COMPANY = 'American Developer Group';
export const TZ = process.env.BUSINESS_TZ || 'America/New_York';
export const SLOT_MIN = parseInt(process.env.SLOT_MINUTES || '60', 10);
export const WORK_START = process.env.WORK_START || '09:00';
export const WORK_END = process.env.WORK_END || '18:00';
export const BUFFER_MIN = parseInt(process.env.MIN_BUFFER_MIN || '120', 10); // не предлагать ближе X минут от "сейчас"

export { AUDIO_DIR };
