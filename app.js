import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  AUDIO_DIR,
  CALLS_DIR,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHANNEL_ID
} from './config.js';
import { tts } from './tts.js';
import { handleVoiceEntry, handleGather, handleVoicemail, calls } from './voiceHandlers.js';
import { logTwilioCall, logApiCall } from './logger.js';

const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio sends x-www-form-urlencoded
app.use(express.json());

// ---------- Media endpoint ----------
// Top-level audio files: /media/<file>.mp3
app.get('/media/:f', (req, res) => {
  const f = path.join(AUDIO_DIR, path.basename(req.params.f));
  if (!fs.existsSync(f)) return res.sendStatus(404);
  res.setHeader('Content-Type', 'audio/mpeg');
  fs.createReadStream(f).pipe(res);
});

// Filler / nested audio files: /media/fillers/<file>.mp3
app.get('/media/fillers/:f', (req, res) => {
  const f = path.join(AUDIO_DIR, 'fillers', path.basename(req.params.f));
  if (!fs.existsSync(f)) return res.sendStatus(404);
  res.setHeader('Content-Type', 'audio/mpeg');
  fs.createReadStream(f).pipe(res);
});

// Call recordings: /calls/<file>.mp3
app.get('/calls/:f', (req, res) => {
  const f = path.join(CALLS_DIR, path.basename(req.params.f));
  if (!fs.existsSync(f)) return res.sendStatus(404);
  res.setHeader('Content-Type', 'audio/mpeg');
  fs.createReadStream(f).pipe(res);
});

// ---------- Voice endpoints ----------
app.post('/voice', handleVoiceEntry);
app.post('/gather', handleGather);
app.post('/voicemail', handleVoicemail);

// ---------- Recording callback ----------
// Configure Twilio to send RecordingStatusCallback here for each call.
app.post('/recording', async (req, res) => {
  const {
    CallSid,
    RecordingUrl,
    RecordingSid,
    From
  } = req.body;

  logTwilioCall('recording-callback', {
    callSid: CallSid,
    extra: { RecordingUrl, RecordingSid, From }
  });

  if (!RecordingUrl || !CallSid) {
    return res.sendStatus(200);
  }

  // Мы не скачиваем запись, а просто шлём ссылку на Twilio.
  // Предполагается, что Auth for Media выключен, и URL доступен без авторизации.
  const recordingLink = `${RecordingUrl}.mp3`;

  // Prepare Telegram notification
  const callState = calls.get(CallSid)?.state || {};
  const needsCallback = !!callState.needs_callback;
  const callbackPhone = callState.callback_phone || callState.phone || From || '';

  let message = `📞 New call recorded\nCall SID: ${CallSid}\nFile: ${recordingLink}`;
  if (needsCallback) {
    message += `\n\nCallback requested: YES\nPhone: ${callbackPhone}`;
  } else {
    message += `\n\nCallback requested: NO`;
  }

  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
    const tgStart = Date.now();
    const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const tgRes = await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHANNEL_ID,
        text: message
      })
    });

    const tgBody = await tgRes.text();
    logApiCall('telegram', 'sendMessage', tgStart, Date.now(), {
      text: message,
      response: tgBody
    });
  }

  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, ()=> console.log('Verter is live'));
