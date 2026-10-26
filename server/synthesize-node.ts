/**
 * Node.js Edge TTS synthesizer for local Express dev.
 * Same bing readaloud + Sec-MS-GEC v2 contract as the Cloudflare Worker.
 */

import WebSocket from 'ws';
import {
  adjustClockSkewFromServerDate,
  generateSecMsGec,
} from '../worker/src/sec-ms-gec';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const BING_WSS =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const MSEDGE_WSS =
  'wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1';

const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR = CHROMIUM_FULL_VERSION.split('.')[0]!;
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;
const DEFAULT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';
const SYNTHESIS_TIMEOUT_MS = 60_000;
const SSML_BYTE_LIMIT = 4096;
const MAX_TRANSIENT_RETRIES = 2;
const TRANSIENT_BACKOFF_MS = 250;

export interface SynthesizeInput {
  text?: string;
  voice?: string;
  rate?: string;
  pitch?: string;
  volume?: string;
  format?: string;
  rawSSML?: string;
}

type EndpointKind = 'bing' | 'msedge';

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
  const bytes = crypto.getRandomValues(new Uint8Array(16));
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

function buildSsmlFromEscaped(
  escapedBody: string,
  voice: string,
  rate: string,
  pitch: string,
  volume: string
): string {
  const lang = localeFromVoice(voice);
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${escapeXml(voice)}">` +
    `<prosody rate="${escapeXml(rate)}" pitch="${escapeXml(pitch)}" volume="${escapeXml(volume)}">` +
    `${escapedBody}` +
    `</prosody></voice></speak>`
  );
}

function resolveFormat(format?: string): string {
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
    if (line.slice(0, idx).trim() === 'Path') return line.slice(idx + 1).trim();
  }
  return undefined;
}

function appendAudioChunk(chunks: Buffer[], buffer: Buffer): void {
  if (buffer.byteLength < 2) return;
  const headerLength = buffer.readInt16BE(0);
  if (buffer.byteLength > headerLength + 2) {
    chunks.push(buffer.subarray(2 + headerLength));
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function safeUtf8SplitPoint(bytes: Uint8Array, limit: number): number {
  let splitAt = Math.min(limit, bytes.byteLength);
  while (splitAt > 0) {
    let i = splitAt - 1;
    let cont = 0;
    while (i >= 0 && (bytes[i]! & 0xc0) === 0x80) {
      cont += 1;
      i -= 1;
    }
    if (i < 0) {
      if (cont === 0) break;
      splitAt -= 1;
      continue;
    }
    const lead = bytes[i]!;
    let need = 0;
    if ((lead & 0x80) === 0) need = 0;
    else if ((lead & 0xe0) === 0xc0) need = 1;
    else if ((lead & 0xf0) === 0xe0) need = 2;
    else if ((lead & 0xf8) === 0xf0) need = 3;
    else {
      splitAt -= 1;
      continue;
    }
    if (cont === need) break;
    splitAt -= 1;
  }
  return splitAt;
}

function splitTextByByteLength(text: string, byteLimit = SSML_BYTE_LIMIT): string[] {
  let bytes = encoder.encode(text);
  const parts: string[] = [];

  while (bytes.byteLength > byteLimit) {
    let splitAt = -1;
    const view = bytes.subarray(0, byteLimit);
    for (let i = view.byteLength - 1; i >= 0; i--) {
      if (view[i] === 0x0a) {
        splitAt = i;
        break;
      }
    }
    if (splitAt < 0) {
      for (let i = view.byteLength - 1; i >= 0; i--) {
        if (view[i] === 0x20) {
          splitAt = i;
          break;
        }
      }
    }
    if (splitAt < 0) splitAt = safeUtf8SplitPoint(bytes, byteLimit);

    const before = decoder.decode(bytes.subarray(0, Math.max(splitAt, 0)));
    const amp = before.lastIndexOf('&');
    if (amp >= 0 && before.indexOf(';', amp) < 0) {
      splitAt = encoder.encode(before.slice(0, amp)).byteLength;
    }

    if (splitAt <= 0) {
      splitAt = safeUtf8SplitPoint(bytes, byteLimit);
      if (splitAt <= 0) splitAt = Math.min(1, bytes.byteLength);
    }

    const chunk = decoder.decode(bytes.subarray(0, splitAt)).trim();
    if (chunk) parts.push(chunk);
    bytes = bytes.subarray(splitAt === 0 ? 1 : splitAt);
  }

  const rest = decoder.decode(bytes).trim();
  if (rest) parts.push(rest);
  return parts;
}

function wssHeaders(): Record<string, string> {
  return {
    'User-Agent':
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
      `(KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 ` +
      `Edg/${CHROMIUM_MAJOR}.0.0.0`,
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-US,en;q=0.9',
    Pragma: 'no-cache',
    'Cache-Control': 'no-cache',
    Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    Cookie: `muid=${makeMuid()};`,
  };
}

function buildWssUrl(kind: EndpointKind): string {
  const secMsGec = generateSecMsGec(TRUSTED_CLIENT_TOKEN);
  const connectionId = makeId();
  const base = kind === 'bing' ? BING_WSS : MSEDGE_WSS;
  const url = new URL(base);
  if (kind === 'bing') {
    url.searchParams.set('TrustedClientToken', TRUSTED_CLIENT_TOKEN);
  } else {
    url.searchParams.set('Ocp-Apim-Subscription-Key', TRUSTED_CLIENT_TOKEN);
  }
  url.searchParams.set('Sec-MS-GEC', secMsGec);
  url.searchParams.set('Sec-MS-GEC-Version', SEC_MS_GEC_VERSION);
  url.searchParams.set('ConnectionId', connectionId);
  return url.toString();
}

function endpointLabel(kind: EndpointKind): string {
  return kind === 'bing' ? 'speech.platform.bing.com' : 'api.msedgeservices.com';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

class UpgradeError extends Error {
  status: number;
  endpoint: string;
  clockSkewRetried: boolean;

  constructor(
    message: string,
    opts: { status: number; endpoint: string; clockSkewRetried: boolean }
  ) {
    super(message);
    this.name = 'UpgradeError';
    this.status = opts.status;
    this.endpoint = opts.endpoint;
    this.clockSkewRetried = opts.clockSkewRetried;
  }
}

function openWebSocket(
  kind: EndpointKind,
  clockSkewRetried: boolean
): Promise<WebSocket> {
  const url = buildWssUrl(kind);
  const label = endpointLabel(kind);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: wssHeaders(),
      handshakeTimeout: 15_000,
    });

    const onUnexpected = (res: { statusCode?: number; headers?: Record<string, unknown> }) => {
      const status = res.statusCode ?? 0;
      const rawDate = res.headers?.date ?? res.headers?.Date;
      const dateHeader = typeof rawDate === 'string' ? rawDate : null;

      if (status === 403 && !clockSkewRetried && dateHeader) {
        try {
          adjustClockSkewFromServerDate(dateHeader);
        } catch {
          /* fall through */
        }
      }

      reject(
        new UpgradeError(
          `WebSocket upgrade failed on ${label} with status ${status}` +
            (clockSkewRetried ? ' (after clock-skew retry)' : ''),
          { status, endpoint: label, clockSkewRetried: clockSkewRetried || status === 403 }
        )
      );
    };

    ws.once('unexpected-response', (_req, res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        onUnexpected({
          statusCode: res.statusCode,
          headers: res.headers as Record<string, unknown>,
        });
      });
      res.resume();
    });

    ws.once('open', () => resolve(ws));
    ws.once('error', (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      // ws often reports "Unexpected server response: 200"
      const m = /Unexpected server response:\s*(\d+)/i.exec(msg);
      const status = m ? Number(m[1]) : 0;
      reject(
        new UpgradeError(`WebSocket upgrade failed on ${label}: ${msg}`, {
          status,
          endpoint: label,
          clockSkewRetried,
        })
      );
    });
  });
}

async function collectAudio(ws: WebSocket, format: string, ssml: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;

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

    ws.on('message', (data, isBinary) => {
      if (settled) return;
      if (!isBinary && typeof data === 'string') {
        if (parseTextPath(data) === 'turn.end') {
          const audio = Buffer.concat(chunks);
          if (!audio.byteLength) {
            settle(() => reject(new Error('No audio data received')));
            return;
          }
          settle(() => resolve(audio));
        }
        return;
      }
      if (!isBinary && data instanceof Buffer) {
        // text frame as Buffer
        const text = data.toString('utf8');
        if (parseTextPath(text) === 'turn.end') {
          const audio = Buffer.concat(chunks);
          if (!audio.byteLength) {
            settle(() => reject(new Error('No audio data received')));
            return;
          }
          settle(() => resolve(audio));
        }
        return;
      }
      const buf = Buffer.isBuffer(data)
        ? data
        : Buffer.from(data as ArrayBuffer);
      appendAudioChunk(chunks, buf);
    });

    ws.on('close', () => {
      if (settled) return;
      const audio = Buffer.concat(chunks);
      if (!audio.byteLength) {
        settle(() => reject(new Error('No audio data received')));
        return;
      }
      settle(() => resolve(audio));
    });

    ws.on('error', (err) => {
      settle(() =>
        reject(new Error(`WebSocket error during synthesis: ${err.message}`))
      );
    });

    ws.send(speechConfigMessage(format));
    ws.send(ssmlMessage(makeId(), ssml));
  });
}

async function connectWithRetries(kind: EndpointKind): Promise<WebSocket> {
  let clockSkewRetried = false;
  let lastErr: UpgradeError | null = null;

  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    if (attempt > 0) await sleep(TRANSIENT_BACKOFF_MS * attempt);
    try {
      return await openWebSocket(kind, clockSkewRetried);
    } catch (err) {
      if (!(err instanceof UpgradeError)) throw err;
      lastErr = err;

      if (err.status === 403 && !clockSkewRetried) {
        clockSkewRetried = true;
        try {
          return await openWebSocket(kind, true);
        } catch (retryErr) {
          if (retryErr instanceof UpgradeError) lastErr = retryErr;
          else throw retryErr;
        }
      }

      if (err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw lastErr;
      }
    }
  }

  throw (
    lastErr ??
    new UpgradeError(`WebSocket upgrade failed on ${endpointLabel(kind)}`, {
      status: 0,
      endpoint: endpointLabel(kind),
      clockSkewRetried,
    })
  );
}

async function synthesizeSsmlChunk(ssml: string, format: string): Promise<Buffer> {
  const order: EndpointKind[] = ['bing', 'msedge'];
  let lastErr: Error | null = null;

  for (const kind of order) {
    try {
      const ws = await connectWithRetries(kind);
      return await collectAudio(ws, format, ssml);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr ?? new Error('Synthesis failed on all endpoints');
}

export async function synthesizeNode(input: SynthesizeInput): Promise<{
  audio: Buffer;
  contentType: string;
  format: string;
}> {
  const voice = (input.voice || 'zh-CN-XiaoxiaoNeural').trim();
  const rate = input.rate || '+0%';
  const pitch = input.pitch || '+0Hz';
  const volume = input.volume || '+0%';
  const format = resolveFormat(input.format);

  const parts: Buffer[] = [];

  if (input.rawSSML && typeof input.rawSSML === 'string' && input.rawSSML.trim().startsWith('<speak')) {
    parts.push(await synthesizeSsmlChunk(input.rawSSML.trim(), format));
  } else {
    const text = input.text?.trim();
    if (!text) throw new Error('缺少合成文本内容 (text)');
    const escaped = escapeXml(removeInvalidXmlChars(text));
    const segments = splitTextByByteLength(escaped, SSML_BYTE_LIMIT);
    if (!segments.length) throw new Error('缺少合成文本内容 (text)');
    for (const segment of segments) {
      parts.push(
        await synthesizeSsmlChunk(
          buildSsmlFromEscaped(segment, voice, rate, pitch, volume),
          format
        )
      );
    }
  }

  const audio = Buffer.concat(parts);
  if (!audio.byteLength) throw new Error('No audio data received');

  return {
    audio,
    contentType: contentTypeForFormat(format),
    format,
  };
}
