import { VoiceItem, ProsodyConfig } from '../types';

export interface SynthesisResponse {
  blob: Blob;
  blobUrl: string;
  durationMs: number;
  bytes: number;
  contentType: string;
}

export async function fetchVoicesApi(): Promise<VoiceItem[]> {
  const res = await fetch('/api/voices');
  if (!res.ok) {
    throw new Error(`获取音色列表失败: ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || '获取音色列表失败');
  }
  return data.voices;
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

  const response = await fetch('/api/synthesize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMsg = `合成请求失败 (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch {
      // not json
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
