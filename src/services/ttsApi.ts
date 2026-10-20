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
    throw new Error(`获取音色列表失败: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || '获取音色列表失败');
  }
  return data.voices as VoiceItem[];
}

/**
 * Prefer the curated in-repo list so Pages opens instantly and still shows
 * the catalog when the Worker is down. Optionally refresh from the backend
 * (Express / Worker) and use that list when it returns successfully.
 */
export async function fetchVoicesApi(): Promise<VoiceItem[]> {
  const curated = getCuratedVoices();

  const remoteUrl = API_BASE ? `${API_BASE}/api/voices` : '/api/voices';
  try {
    const remote = await fetchVoicesFromUrl(remoteUrl);
    if (Array.isArray(remote) && remote.length > 0) {
      return remote;
    }
  } catch {
    // Pages without Worker, CORS/403, or offline — curated is enough to browse.
  }

  return curated;
}

function friendlySynthError(status: number, serverMsg?: string): string {
  if (status === 429) {
    return serverMsg || '请求过于频繁，请稍后再试（合成有每分钟次数限制）';
  }
  if (status === 403) {
    return serverMsg || '无权调用合成接口（来源未允许）。请从本站 GitHub Pages 打开使用。';
  }
  if (status === 404 || status === 405) {
    return API_BASE ? `合成接口不可用 (${status})` : STATIC_SITE_SYNTH_ERROR;
  }
  if (status >= 500) {
    return serverMsg || `语音合成服务暂时失败 (${status})，请稍后重试`;
  }
  return serverMsg || `合成请求失败 (${status})`;
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
    if (!API_BASE && (response.status === 404 || response.status === 405)) {
      throw new Error(STATIC_SITE_SYNTH_ERROR);
    }
    let serverMsg: string | undefined;
    try {
      const errJson = await response.json();
      if (errJson?.error) serverMsg = String(errJson.error);
    } catch {
      if (!API_BASE) {
        throw new Error(STATIC_SITE_SYNTH_ERROR);
      }
    }
    throw new Error(friendlySynthError(response.status, serverMsg));
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
