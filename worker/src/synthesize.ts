/**
 * Edge TTS synthesizer for Cloudflare Workers.
 * Uses fetch + Upgrade: websocket (NOT the Node `ws` package).
 * Primary: speech.platform.bing.com readaloud (rany2/edge-tts).
 * Fallback: api.msedgeservices.com with Ocp-Apim-Subscription-Key.
 */

import {
  adjustClockSkewFromServerDate,
  generateSecMsGec,
} from './sec-ms-gec';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

const BING_SYNTHESIS_URL =
  'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const MSEDGE_SYNTHESIS_URL =
  'https://api.msedgeservices.com/tts/cognitiveservices/websocket/v1';

const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR = CHROMIUM_FULL_VERSION.split('.')[0]!;
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;
const DEFAULT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';
const SYNTHESIS_TIMEOUT_MS = 60_000;
/** Match rany2/edge-tts: split escaped text at ~4096 UTF-8 bytes. */
const SSML_BYTE_LIMIT = 4096;
const MAX_TRANSIENT_RETRIES = 2;
const TRANSIENT_BACKOFF_MS = 250;

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

/** Build SSML from already-escaped body text (used after byte-splitting). */
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

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Split escaped text into ~byteLimit UTF-8 chunks at newlines/spaces,
 * without breaking multi-byte chars or XML entities (rany2 approach).
 */
function isValidUtf8Prefix(bytes: Uint8Array, end: number): boolean {
  try {
    decoder.decode(bytes.subarray(0, end), { stream: false });
    // Also reject if we cut a multi-byte sequence: check trailing continuation
    if (end <= 0) return false;
    // Walk back over continuation bytes; lead byte must claim exact length
    let i = end - 1;
    let cont = 0;
    while (i >= 0 && (bytes[i]! & 0xc0) === 0x80) {
      cont += 1;
      i -= 1;
    }
    if (i < 0) return cont === 0;
    const lead = bytes[i]!;
    let need = 0;
    if ((lead & 0x80) === 0) need = 0;
    else if ((lead & 0xe0) === 0xc0) need = 1;
    else if ((lead & 0xf0) === 0xe0) need = 2;
    else if ((lead & 0xf8) === 0xf0) need = 3;
    else return false;
    return cont === need;
  } catch {
    return false;
  }
}

function safeUtf8SplitPoint(bytes: Uint8Array, limit: number): number {
  let splitAt = Math.min(limit, bytes.byteLength);
  while (splitAt > 0 && !isValidUtf8Prefix(bytes, splitAt)) {
    splitAt -= 1;
  }
  return splitAt;
}

export function splitTextByByteLength(text: string, byteLimit = SSML_BYTE_LIMIT): string[] {
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
    if (splitAt < 0) {
      splitAt = safeUtf8SplitPoint(bytes, byteLimit);
    }

    // Avoid splitting inside &...; entity
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
    'Sec-WebSocket-Version': '13',
    Cookie: `muid=${makeMuid()};`,
    Upgrade: 'websocket',
  };
}

function buildUpgradeUrl(kind: EndpointKind): string {
  const secMsGec = generateSecMsGec(TRUSTED_CLIENT_TOKEN);
  const connectionId = makeId();
  const base = kind === 'bing' ? BING_SYNTHESIS_URL : MSEDGE_SYNTHESIS_URL;
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
  dateHeader: string | null;

  constructor(
    message: string,
    opts: {
      status: number;
      endpoint: string;
      clockSkewRetried: boolean;
      dateHeader?: string | null;
    }
  ) {
    super(message);
    this.name = 'UpgradeError';
    this.status = opts.status;
    this.endpoint = opts.endpoint;
    this.clockSkewRetried = opts.clockSkewRetried;
    this.dateHeader = opts.dateHeader ?? null;
  }
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

async function upgradeOnce(
  kind: EndpointKind,
  clockSkewRetried: boolean
): Promise<{ ws: AcceptableWebSocket; kind: EndpointKind }> {
  const url = buildUpgradeUrl(kind);
  const label = endpointLabel(kind);
  let upgradeResponse: UpgradeResponse;
  try {
    upgradeResponse = (await fetch(url, {
      headers: wssHeaders(),
    })) as UpgradeResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new UpgradeError(`WebSocket upgrade network error on ${label}: ${msg}`, {
      status: 0,
      endpoint: label,
      clockSkewRetried,
    });
  }

  if (upgradeResponse.status === 101 && upgradeResponse.webSocket) {
    return { ws: upgradeResponse.webSocket, kind };
  }

  const dateHeader = upgradeResponse.headers.get('Date');
  throw new UpgradeError(
    `WebSocket upgrade failed on ${label} with status ${upgradeResponse.status}` +
      (clockSkewRetried ? ' (after clock-skew retry)' : ''),
    {
      status: upgradeResponse.status,
      endpoint: label,
      clockSkewRetried,
      dateHeader,
    }
  );
}

/**
 * Connect with clock-skew retry on 403 and a few transient retries.
 * Does not leak tokens in error messages.
 */
async function connectWithRetries(
  kind: EndpointKind
): Promise<{ ws: AcceptableWebSocket; kind: EndpointKind }> {
  let clockSkewRetried = false;
  let lastErr: UpgradeError | null = null;

  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(TRANSIENT_BACKOFF_MS * attempt);
    }
    try {
      return await upgradeOnce(kind, clockSkewRetried);
    } catch (err) {
      if (!(err instanceof UpgradeError)) throw err;
      lastErr = err;

      // Clock skew: 403 + Date header → adjust once, then retry immediately
      if (err.status === 403 && !clockSkewRetried && err.dateHeader) {
        try {
          adjustClockSkewFromServerDate(err.dateHeader);
          clockSkewRetried = true;
          return await upgradeOnce(kind, true);
        } catch (skewErr) {
          const skewMsg = skewErr instanceof Error ? skewErr.message : String(skewErr);
          lastErr = new UpgradeError(
            `${err.message}; clock-skew adjust failed: ${skewMsg}`,
            {
              status: err.status,
              endpoint: err.endpoint,
              clockSkewRetried: true,
              dateHeader: err.dateHeader,
            }
          );
        }
      }

      // Do not retry clear client/auth failures (except the 403 skew path above)
      if (err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw lastErr;
      }
      // status 0 / 5xx / 429 → transient, continue loop
    }
  }

  throw lastErr ?? new UpgradeError(`WebSocket upgrade failed on ${endpointLabel(kind)}`, {
    status: 0,
    endpoint: endpointLabel(kind),
    clockSkewRetried,
  });
}

async function synthesizeSsmlChunk(
  ssml: string,
  format: string,
  preferKind: EndpointKind = 'bing',
  voiceHint?: string
): Promise<Uint8Array> {
  const order: EndpointKind[] =
    preferKind === 'bing' ? ['bing', 'msedge'] : ['msedge', 'bing'];

  const errors: string[] = [];
  for (const kind of order) {
    try {
      const { ws } = await connectWithRetries(kind);
      return await collectAudioFromWebSocket(
        ws,
        speechConfigMessage(format),
        ssmlMessage(makeId(), ssml)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${endpointLabel(kind)}: ${msg}`);
      // Continue to next endpoint
    }
  }

  const joined = errors.join(' | ') || 'unknown';
  if (/No audio data/i.test(joined)) {
    const voice = voiceHint ? `「${voiceHint}」` : '该音色';
    throw new Error(
      `未收到音频。${voice}可能已从 Edge TTS 下线，请换其他在线音色（${joined}）`
    );
  }
  throw new Error(`Synthesis failed on all endpoints (${joined})`);
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

  const audioParts: Uint8Array[] = [];

  if (input.rawSSML && typeof input.rawSSML === 'string' && input.rawSSML.trim().startsWith('<speak')) {
    audioParts.push(await synthesizeSsmlChunk(input.rawSSML.trim(), format, 'bing', voice));
  } else {
    const text = input.text?.trim();
    if (!text) {
      throw new Error('缺少合成文本内容 (text)');
    }
    const escaped = escapeXml(removeInvalidXmlChars(text));
    const segments = splitTextByByteLength(escaped, SSML_BYTE_LIMIT);
    if (!segments.length) {
      throw new Error('缺少合成文本内容 (text)');
    }
    for (const segment of segments) {
      const ssml = buildSsmlFromEscaped(segment, voice, rate, pitch, volume);
      audioParts.push(await synthesizeSsmlChunk(ssml, format, 'bing', voice));
    }
  }

  const audio = concatChunks(audioParts);
  if (!audio.byteLength) {
    throw new Error('No audio data received');
  }

  return {
    audio,
    contentType: contentTypeForFormat(format),
    format,
  };
}
