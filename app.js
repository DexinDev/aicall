import express from 'express';
import fs from 'fs';
import path from 'path';
import { AUDIO_DIR } from './config.js';
import { tts } from './tts.js';
import { handleVoiceEntry, handleGather, handleVoicemail } from './voiceHandlers.js';

const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio sends x-www-form-urlencoded
app.use(express.json());

// ---------- Media endpoint ----------
app.get('/media/:f', (req, res) => {
  const f = path.join(AUDIO_DIR, path.basename(req.params.f));
  if (!fs.existsSync(f)) return res.sendStatus(404);
  res.setHeader('Content-Type', 'audio/mpeg');
  fs.createReadStream(f).pipe(res);
});

// ---------- Voice endpoints ----------
app.post('/voice', handleVoiceEntry);

app.post('/gather', handleGather);
app.post('/voicemail', handleVoicemail);

app.listen(process.env.PORT || 3000, ()=> console.log('Verter is live'));
