import { getCuratedVoices } from './voices';
import { synthesize } from './synthesize';

const ALLOWED_ORIGIN_EXACT = new Set(['https://shalom-lab.github.io']);

function isAllowedOrigin(origin: string | null): boolean {
  // Production Worker: only this Pages site. Localhost is intentionally NOT
  // allowed — otherwise anyone running a local page could hit the public API.
  // Local TTS use Express (`bun run dev`) or `wrangler dev` + local VITE_API_BASE.
  if (!origin) return false;
  return ALLOWED_ORIGIN_EXACT.has(origin);
}

function corsHeadersFor(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers':
      'X-Synthesis-Duration-Ms, X-Audio-Bytes, Content-Disposition, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

function withCors(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeadersFor(origin))) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(data: unknown, status = 200, origin: string | null = null): Response {
  return withCors(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
    origin
  );
}

function clientKey(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('CF-Connecting-IP') ||
    'unknown'
  );
}

async function handleVoices(origin: string | null): Promise<Response> {
  try {
    const voices = getCuratedVoices();
    return json({ success: true, count: voices.length, voices }, 200, origin);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ success: false, error: msg }, 500, origin);
  }
}

async function handleSynthesize(
  request: Request,
  env: Env,
  origin: string | null
): Promise<Response> {
  const start = Date.now();
  try {
    const { success } = await env.SYNTH_RATE_LIMITER.limit({
      key: `synth:${clientKey(request)}`,
    });
    if (!success) {
      return json(
        { success: false, error: '请求过于频繁，请稍后再试（约每分钟 20 次）' },
        429,
        origin
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const text = typeof body.text === 'string' ? body.text : undefined;
    const rawSSML = typeof body.rawSSML === 'string' ? body.rawSSML : undefined;
    if (!text?.trim() && !(rawSSML && rawSSML.trim().startsWith('<speak'))) {
      return json({ success: false, error: '缺少合成文本内容 (text)' }, 400, origin);
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
      }),
      origin
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('synthesize error:', msg);
    return json({ success: false, error: '语音合成失败: ' + msg }, 500, origin);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin)) {
        return new Response(null, { status: 403 });
      }
      return withCors(new Response(null, { status: 204 }), origin);
    }

    if (path === '/health' && request.method === 'GET') {
      // Ops probe — no origin gate
      return json({ ok: true, service: 'edge-tts-api' }, 200, origin);
    }

    const needsOrigin =
      path === '/api/voices' || path === '/api/synthesize';
    if (needsOrigin && !isAllowedOrigin(origin)) {
      return json(
        {
          success: false,
          error: '禁止的来源。仅允许 shalom-lab.github.io 与本地开发 Origin。',
        },
        403,
        null
      );
    }

    if (path === '/api/voices' && request.method === 'GET') {
      return handleVoices(origin);
    }

    if (path === '/api/synthesize' && request.method === 'POST') {
      return handleSynthesize(request, env, origin);
    }

    if (
      (path === '/api/voices' || path === '/api/synthesize' || path === '/health') &&
      request.method !== 'GET' &&
      request.method !== 'POST'
    ) {
      return json({ success: false, error: 'method not allowed' }, 405, origin);
    }

    return json({ success: false, error: 'not found' }, 404, origin);
  },
};
