import { VoiceItem, ProsodyConfig } from '../types';
import { getCuratedVoices } from '../data/voices';

/** API origin for Pages builds; empty = same-origin (local `tsx server.ts`). Strip trailing slash. */
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const STATIC_SITE_SYNTH_ERROR =
  '当前是静态站点，无法在浏览器内直连 Edge TTS（Chrome/Firefox 受限）。请本地运行 bun run dev，或配置 VITE_API_BASE 指向后端。';

export interface SynthesisResponse {
  blob: Blob;
  blobUrl: string;
  durationMs: number;
  bytes: number;
  contentType: string;
}

async function fetchVoicesFromUrl(url: string): Promise<VoiceItem[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`获取音色列表失败: ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || '获取音色列表失败');
  }
  return data.voices;
}

export async function fetchVoicesApi(): Promise<VoiceItem[]> {
  // Explicit remote backend (e.g. Pages build with VITE_API_BASE)
  if (API_BASE) {
    return fetchVoicesFromUrl(`${API_BASE}/api/voices`);
  }

  // Same-origin: works with local `tsx server.ts`; on GitHub Pages there is no /api
  try {
    return await fetchVoicesFromUrl('/api/voices');
  } catch {
    return getCuratedVoices();
  }
}

export async function synthesizeAudioApi(
  text: string,
  voice: string,
  config: ProsodyConfig,
  rawSSML?: string
): Promise<SynthesisResponse> {
  const payload = {
    text,
    voice,
    rate: config.rate >= 0 ? `+${config.rate}%` : `${config.rate}%`,
    pitch: config.pitch >= 0 ? `+${config.pitch}Hz` : `${config.pitch}Hz`,
    volume: config.volume >= 0 ? `+${config.volume}%` : `${config.volume}%`,
    format: config.format,
    rawSSML: rawSSML?.trim() ? rawSSML.trim() : undefined,
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    if (!API_BASE) {
      throw new Error(STATIC_SITE_SYNTH_ERROR);
    }
    throw new Error('合成请求失败: 无法连接后端');
  }

  if (!response.ok) {
    // Pages often returns 404 HTML for missing /api — treat as no backend
    if (!API_BASE && (response.status === 404 || response.status === 405)) {
      throw new Error(STATIC_SITE_SYNTH_ERROR);
    }
    let errorMsg = `合成请求失败 (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch {
      // not json (e.g. static 404 page)
      if (!API_BASE) {
        throw new Error(STATIC_SITE_SYNTH_ERROR);
      }
    }
    throw new Error(errorMsg);
  }

  const durationMsHeader = response.headers.get('X-Synthesis-Duration-Ms');
  const durationMs = durationMsHeader ? parseInt(durationMsHeader, 10) : 0;
  const contentType = response.headers.get('Content-Type') || 'audio/mpeg';

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  return {
    blob,
    blobUrl,
    durationMs,
    bytes: blob.size,
    contentType,
  };
}

export function generateSsml(text: string, voice: string, config: ProsodyConfig): string {
  const rateStr = config.rate >= 0 ? `+${config.rate}%` : `${config.rate}%`;
  const pitchStr = config.pitch >= 0 ? `+${config.pitch}Hz` : `${config.pitch}Hz`;
  const volumeStr = config.volume >= 0 ? `+${config.volume}%` : `${config.volume}%`;

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="${voice}">
    <prosody rate="${rateStr}" pitch="${pitchStr}" volume="${volumeStr}">
      ${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
    </prosody>
  </voice>
</speak>`;
}
