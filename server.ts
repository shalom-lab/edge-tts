import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { MsEdgeTTS, OUTPUT_FORMAT, Voice } from 'msedge-tts';
import {
  getCuratedVoices,
  processEdgeVoices,
  type RawEdgeVoice,
} from './src/data/voices';
import type { VoiceItem } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedVoices: VoiceItem[] | null = null;
let lastVoicesFetch = 0;

async function getProcessedVoices(): Promise<VoiceItem[]> {
  const now = Date.now();
  if (cachedVoices && now - lastVoicesFetch < 1000 * 60 * 60) {
    return cachedVoices;
  }

  try {
    const tts = new MsEdgeTTS({ enableLogger: false });
    const rawVoices: Voice[] = await tts.getVoices();
    const processed = processEdgeVoices(rawVoices as unknown as RawEdgeVoice[]);

    cachedVoices = processed;
    lastVoicesFetch = now;
    return processed;
  } catch (err) {
    console.error('Error fetching Edge TTS voices, falling back to curated list:', err);
    if (cachedVoices) return cachedVoices;
    const curated = getCuratedVoices();
    cachedVoices = curated;
    lastVoicesFetch = now;
    return curated;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // API 1: Get voices list
  app.get('/api/voices', async (_req, res) => {
    try {
      const voices = await getProcessedVoices();
      res.json({ success: true, count: voices.length, voices });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // API 2: Synthesize speech
  app.post('/api/synthesize', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        text,
        voice = 'zh-CN-XiaoxiaoNeural',
        rate = '+0%',
        pitch = '+0Hz',
        volume = '+0%',
        format = 'audio-24khz-96kbitrate-mono-mp3',
        rawSSML,
      } = req.body;

      if (!text && !rawSSML) {
        return res.status(400).json({ success: false, error: '缺少合成文本内容 (text)' });
      }

      const tts = new MsEdgeTTS({ enableLogger: false, connectionTimeoutMs: 15000 });

      // Determine output format
      let outputFormat = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;
      if (format === 'audio-24khz-48kbitrate-mono-mp3') {
        outputFormat = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
      } else if (format === 'webm-24khz-16bit-mono-opus') {
        outputFormat = OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS;
      }

      await tts.setMetadata(voice, outputFormat);

      let audioStream;
      if (rawSSML && typeof rawSSML === 'string' && rawSSML.trim().startsWith('<speak')) {
        const streamResult = tts.rawToStream(rawSSML);
        audioStream = streamResult.audioStream;
      } else {
        const prosodyOptions = {
          rate: typeof rate === 'number' ? (rate >= 0 ? `+${rate}%` : `${rate}%`) : rate,
          pitch: typeof pitch === 'number' ? (pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`) : pitch,
          volume: typeof volume === 'number' ? (volume >= 0 ? `+${volume}%` : `${volume}%`) : volume,
        };
        const streamResult = tts.toStream(text, prosodyOptions);
        audioStream = streamResult.audioStream;
      }

      const chunks: Buffer[] = [];
      let isEnded = false;

      audioStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      audioStream.on('end', () => {
        if (isEnded) return;
        isEnded = true;
        const totalBuffer = Buffer.concat(chunks);
        const durationMs = Date.now() - startTime;

        const isWebm = format.includes('webm');
        const contentType = isWebm ? 'audio/webm' : 'audio/mpeg';
        const fileExt = isWebm ? 'webm' : 'mp3';
        const sanitizedVoice = voice.replace(/[^a-zA-Z0-9_-]/g, '');

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', totalBuffer.length.toString());
        res.setHeader('X-Synthesis-Duration-Ms', durationMs.toString());
        res.setHeader('X-Audio-Bytes', totalBuffer.length.toString());
        res.setHeader('Content-Disposition', `inline; filename="edge_tts_${sanitizedVoice}_${Date.now()}.${fileExt}"`);
        res.setHeader('Cache-Control', 'public, max-age=3600');

        res.send(totalBuffer);
      });

      audioStream.on('error', (streamErr) => {
        if (isEnded) return;
        isEnded = true;
        console.error('Audio stream error during synthesis:', streamErr);
        res.status(500).json({ success: false, error: '音频流传输失败: ' + String(streamErr) });
      });
    } catch (err: unknown) {
      console.error('Synthesis request error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: '语音合成失败: ' + msg });
    }
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = process.env.PORT || 3000;
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Edge TTS App running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
