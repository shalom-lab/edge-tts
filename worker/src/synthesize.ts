/**
 * Edge TTS synthesizer for Cloudflare Workers.
 * Uses fetch + Upgrade: websocket (NOT the Node `ws` package).
 * Endpoint: api.msedgeservices.com with Sec-MS-GEC v2.
 */

import { generateSecMsGec } from './sec-ms-gec';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const SYNTHESIS_URL =
  'https://api.msedgeservices.com/tts/cognitiveservices/websocket/v1';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR = CHROMIUM_FULL_VERSION.split('.')[0]!;
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;
const DEFAULT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';
const SYNTHESIS_TIMEOUT_MS = 60_000;

type AcceptableWebSocket = WebSocket & { accept(): void };
type UpgradeResponse = Response & { webSocket?: AcceptableWebSocket };

export interface SynthesizeInput {
  text?: string;
  voice?: string;
  rate?: string;
  pitch?: string;
  volume?: string;
  format?: string;
  rawSSML?: string;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function removeInvalidXmlChars(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
}

function makeId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function makeMuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function localeFromVoice(voice: string): string {
  const match = /\b([a-z]{2,3}-[A-Z]{2}(?:-[a-z]+)?)\b/.exec(voice);
  if (match) return match[1]!;
  const parts = voice.split('-');
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return 'zh-CN';
}

/** Build SSML used by frontend / Express server. Exported for smoke tests. */
export function buildSsml(
  text: string,
  voice: string,
  rate: string,
  pitch: string,
  volume: string
): string {
  const lang = localeFromVoice(voice);
  const body = escapeXml(removeInvalidXmlChars(text));
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${escapeXml(voice)}">` +
    `<prosody rate="${escapeXml(rate)}" pitch="${escapeXml(pitch)}" volume="${escapeXml(volume)}">` +
    `${body}` +
    `</prosody></voice></speak>`
  );
}

function resolveFormat(format?: string): string {
  if (!format) return DEFAULT_FORMAT;
  if (
    format === 'audio-24khz-96kbitrate-mono-mp3' ||
    format === 'audio-24khz-48kbitrate-mono-mp3' ||
    format === 'webm-24khz-16bit-mono-opus'
  ) {
    return format;
  }
  return DEFAULT_FORMAT;
}

function contentTypeForFormat(format: string): string {
  return format.includes('webm') ? 'audio/webm' : 'audio/mpeg';
}

function speechConfigMessage(format: string): string {
  return (
    `X-Timestamp:${new Date().toString()}\r\n` +
    `Content-Type:application/json; charset=utf-8\r\n` +
    `Path:speech.config\r\n\r\n` +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: 'false',
              wordBoundaryEnabled: 'false',
            },
            outputFormat: format,
          },
        },
      },
    })
  );
}

function ssmlMessage(requestId: string, ssml: string): string {
  return (
    `X-RequestId:${requestId}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${new Date().toString()}\r\n` +
    `Path:ssml\r\n\r\n` +
    ssml.trim()
  );
}

function parseTextPath(message: string): string | undefined {
  const sep = message.indexOf('\r\n\r\n');
  const headerText = sep >= 0 ? message.slice(0, sep) : message;
  for (const line of headerText.split('\r\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    if (key === 'Path') return line.slice(idx + 1).trim();
  }
  return undefined;
}

function appendAudioChunk(chunks: Uint8Array[], buffer: ArrayBufferLike): void {
  const view = new DataView(buffer);
  if (buffer.byteLength < 2) return;
  const headerLength = view.getInt16(0);
  if (buffer.byteLength > headerLength + 2) {
    chunks.push(new Uint8Array(buffer).slice(2 + headerLength));
  }
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function collectAudioFromWebSocket(
  ws: AcceptableWebSocket,
  configMsg: string,
  ssmlMsg: string
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let settled = false;
    let pendingBinary: Promise<void> = Promise.resolve();

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      fn();
    };

    const timer = setTimeout(() => {
      settle(() => reject(new Error(`Synthesis timed out after ${SYNTHESIS_TIMEOUT_MS}ms`)));
    }, SYNTHESIS_TIMEOUT_MS);

    const enqueueBinary = (getBuf: () => Promise<ArrayBufferLike> | ArrayBufferLike) => {
      pendingBinary = pendingBinary.then(async () => {
        if (settled) return;
        const buf = await getBuf();
        if (settled) return;
        appendAudioChunk(chunks, buf);
      });
    };

    const finalize = async () => {
      try {
        await pendingBinary;
      } catch {
        /* ignore decode errors if we already have audio */
      }
      const audio = concatChunks(chunks);
      if (!audio.byteLength) {
        settle(() => reject(new Error('No audio data received')));
        return;
      }
      settle(() => resolve(audio));
    };

    ws.addEventListener('message', (event: MessageEvent) => {
      if (settled) return;
      const data = event.data;
      if (typeof data === 'string') {
        const path = parseTextPath(data);
        if (path === 'turn.end') {
          void finalize();
        }
        return;
      }
      if (data instanceof ArrayBuffer) {
        enqueueBinary(() => data);
        return;
      }
      if (data instanceof Uint8Array) {
        enqueueBinary(() =>
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        );
        return;
      }
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        enqueueBinary(() => data.arrayBuffer());
      }
    });

    ws.addEventListener('close', () => {
      if (settled) return;
      void finalize();
    });

    ws.addEventListener('error', () => {
      settle(() => reject(new Error('WebSocket error during synthesis')));
    });

    ws.accept();
    ws.send(configMsg);
    ws.send(ssmlMsg);
  });
}

export async function synthesize(input: SynthesizeInput): Promise<{
  audio: Uint8Array;
  contentType: string;
  format: string;
}> {
  const voice = (input.voice || 'zh-CN-XiaoxiaoNeural').trim();
  const rate = input.rate || '+0%';
  const pitch = input.pitch || '+0Hz';
  const volume = input.volume || '+0%';
  const format = resolveFormat(input.format);

  let ssml: string;
  if (input.rawSSML && typeof input.rawSSML === 'string' && input.rawSSML.trim().startsWith('<speak')) {
    ssml = input.rawSSML.trim();
  } else {
    const text = input.text?.trim();
    if (!text) {
      throw new Error('缺少合成文本内容 (text)');
    }
    ssml = buildSsml(text, voice, rate, pitch, volume);
  }

  const secMsGec = generateSecMsGec(TRUSTED_CLIENT_TOKEN);
  const connectionId = makeId();
  const url = new URL(SYNTHESIS_URL);
  url.searchParams.set('Ocp-Apim-Subscription-Key', TRUSTED_CLIENT_TOKEN);
  url.searchParams.set('Sec-MS-GEC', secMsGec);
  url.searchParams.set('Sec-MS-GEC-Version', SEC_MS_GEC_VERSION);
  url.searchParams.set('ConnectionId', connectionId);

  const upgradeResponse = (await fetch(url.toString(), {
    headers: {
      'User-Agent':
        `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
        `(KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 ` +
        `Edg/${CHROMIUM_MAJOR}.0.0.0`,
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'Sec-WebSocket-Version': '13',
      Cookie: `muid=${makeMuid()};`,
      Upgrade: 'websocket',
    },
  })) as UpgradeResponse;

  if (upgradeResponse.status !== 101 || !upgradeResponse.webSocket) {
    throw new Error(`WebSocket upgrade failed with status ${upgradeResponse.status}`);
  }

  const requestId = makeId();
  const audio = await collectAudioFromWebSocket(
    upgradeResponse.webSocket,
    speechConfigMessage(format),
    ssmlMessage(requestId, ssml)
  );

  return {
    audio,
    contentType: contentTypeForFormat(format),
    format,
  };
}
