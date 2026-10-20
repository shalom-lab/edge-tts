import { getCuratedVoices } from './voices';
import { synthesize } from './synthesize';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers':
    'X-Synthesis-Duration-Ms, X-Audio-Bytes, Content-Disposition, Content-Type',
  'Access-Control-Max-Age': '86400',
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(data: unknown, status = 200): Response {
  return withCors(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  );
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  if (origin === 'https://shalom-lab.github.io') return true;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  // Free public API — allow other origins too (Access-Control-Allow-Origin: *)
  return true;
}

async function handleVoices(): Promise<Response> {
  try {
    const voices = getCuratedVoices();
    return json({ success: true, count: voices.length, voices });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ success: false, error: msg }, 500);
  }
}

async function handleSynthesize(request: Request): Promise<Response> {
  const start = Date.now();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const text = typeof body.text === 'string' ? body.text : undefined;
    const rawSSML = typeof body.rawSSML === 'string' ? body.rawSSML : undefined;
    if (!text?.trim() && !(rawSSML && rawSSML.trim().startsWith('<speak'))) {
      return json({ success: false, error: '缺少合成文本内容 (text)' }, 400);
    }

    const result = await synthesize({
      text,
      voice: typeof body.voice === 'string' ? body.voice : undefined,
      rate: typeof body.rate === 'string' ? body.rate : undefined,
      pitch: typeof body.pitch === 'string' ? body.pitch : undefined,
      volume: typeof body.volume === 'string' ? body.volume : undefined,
      format: typeof body.format === 'string' ? body.format : undefined,
      rawSSML,
    });

    const durationMs = Date.now() - start;
    const voice =
      typeof body.voice === 'string' ? body.voice.replace(/[^a-zA-Z0-9_-]/g, '') : 'voice';
    const ext = result.format.includes('webm') ? 'webm' : 'mp3';

    return withCors(
      new Response(result.audio, {
        status: 200,
        headers: {
          'Content-Type': result.contentType,
          'Content-Length': String(result.audio.byteLength),
          'X-Synthesis-Duration-Ms': String(durationMs),
          'X-Audio-Bytes': String(result.audio.byteLength),
          'Content-Disposition': `inline; filename="edge_tts_${voice}_${Date.now()}.${ext}"`,
          'Cache-Control': 'public, max-age=3600',
        },
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('synthesize error:', msg);
    return json({ success: false, error: '语音合成失败: ' + msg }, 500);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin');
      if (!isAllowedOrigin(origin)) {
        return new Response(null, { status: 403 });
      }
      return withCors(new Response(null, { status: 204 }));
    }

    if (path === '/health' && request.method === 'GET') {
      return json({ ok: true, service: 'edge-tts-api' });
    }

    if (path === '/api/voices' && request.method === 'GET') {
      return handleVoices();
    }

    if (path === '/api/synthesize' && request.method === 'POST') {
      return handleSynthesize(request);
    }

    if (
      (path === '/api/voices' || path === '/api/synthesize' || path === '/health') &&
      request.method !== 'GET' &&
      request.method !== 'POST'
    ) {
      return json({ success: false, error: 'method not allowed' }, 405);
    }

    return json({ success: false, error: 'not found' }, 404);
  },
};
