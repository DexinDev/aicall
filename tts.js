import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AUDIO_DIR } from './config.js';
import { logApiCall, logPerformance } from './logger.js';

// ---------- Canonical website/email phrasing ----------
export function normalizeCanonicalUrls(text) {
  if (!text) return text;
  let t = text;

  // Replace any messy mentions with canonical spoken templates
  const canon = {
    CAREERS: "america d group dot com slash careers",
    PARTNERS: "america d group dot com slash partners",
    FAQ: "america d group dot com slash f-a-q",
    SITE: "america d group dot com",
    EMAIL: "info at america d group dot com"
  };

  // Careers
  t = t.replace(/americadgroup\.com[\/\.]?\s*careers/gi, canon.CAREERS);
  t = t.replace(/america d group dot com( dot)? (slash )?careers/gi, canon.CAREERS);

  // Partners
  t = t.replace(/americadgroup\.com[\/\.]?\s*partners/gi, canon.PARTNERS);
  t = t.replace(/america d group dot com( dot)? (slash )?partners/gi, canon.PARTNERS);

  // FAQ
  t = t.replace(/americadgroup\.com[\/\.]?\s*faq/gi, canon.FAQ);
  t = t.replace(/america d group dot com( dot)? (slash )?faq/gi, canon.FAQ);

  // Root site
  t = t.replace(/americadgroup\.com/gi, canon.SITE);

  // Email
  t = t.replace(/info@americadgroup\.com/gi, canon.EMAIL);
  t = t.replace(/info at americadgroup dot com/gi, canon.EMAIL);

  // Collapse spaces
  return t.replace(/\s{2,}/g, ' ').trim();
}

// ---------- ElevenLabs TTS ----------
export async function tts(text) {
  const startTime = Date.now();
  const normalized = normalizeCanonicalUrls(text);
  const file = path.join(AUDIO_DIR, `${crypto.randomUUID()}.mp3`);
  
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: { 
        'xi-api-key': process.env.ELEVENLABS_API_KEY, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        text: normalized,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.4, similarity_boost: 0.8 }
      })
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    if (!r.ok) {
      const errorText = await r.text();
      logApiCall('elevenlabs', 'text-to-speech', startTime, endTime, {
        text: normalized,
        error: errorText
      });
      throw new Error('TTS error: ' + errorText);
    }
    
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(file, buf);
    
    logApiCall('elevenlabs', 'text-to-speech', startTime, endTime, {
      text: normalized,
      response: `Generated ${path.basename(file)} (${buf.length} bytes)`
    });
    
    logPerformance('ElevenLabs TTS', duration, 2000);
    
    return `${process.env.BASE_URL}/media/${path.basename(file)}`;
  } catch (error) {
    const endTime = Date.now();
    logApiCall('elevenlabs', 'text-to-speech', startTime, endTime, {
      text: normalized,
      error: error.message
    });
    throw error;
  }
}
