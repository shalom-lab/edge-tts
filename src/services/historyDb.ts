/**
 * Persist synthesis history in IndexedDB (blobs included).
 * Favorites stay in localStorage (small string list).
 */

import type { ProsodyConfig, SynthHistoryItem } from '../types';

const DB_NAME = 'edge-tts';
const DB_VERSION = 1;
const STORE = 'history';
const MAX_ITEMS = 30;

export interface StoredHistoryRecord {
  id: string;
  text: string;
  voice: string;
  voiceLabel: string;
  config: ProsodyConfig;
  audioBlob: Blob;
  fileSize: number;
  durationMs: number;
  timestamp: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export function toHistoryItem(record: StoredHistoryRecord): SynthHistoryItem {
  return {
    id: record.id,
    text: record.text,
    voice: record.voice,
    voiceLabel: record.voiceLabel,
    config: record.config,
    audioBlobUrl: URL.createObjectURL(record.audioBlob),
    fileSize: record.fileSize,
    durationMs: record.durationMs,
    timestamp: record.timestamp,
  };
}

export async function loadHistory(): Promise<SynthHistoryItem[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const all = await reqToPromise(store.getAll() as IDBRequest<StoredHistoryRecord[]>);
    await txDone(tx);
    return (all || [])
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_ITEMS)
      .map(toHistoryItem);
  } finally {
    db.close();
  }
}

export async function saveHistoryItem(
  item: SynthHistoryItem,
  audioBlob: Blob
): Promise<void> {
  const db = await openDb();
  try {
    const record: StoredHistoryRecord = {
      id: item.id,
      text: item.text,
      voice: item.voice,
      voiceLabel: item.voiceLabel,
      config: item.config,
      audioBlob,
      fileSize: item.fileSize,
      durationMs: item.durationMs,
      timestamp: item.timestamp,
    };

    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(record);

    const all = await reqToPromise(store.getAll() as IDBRequest<StoredHistoryRecord[]>);
    const sorted = (all || []).slice().sort((a, b) => b.timestamp - a.timestamp);
    for (const extra of sorted.slice(MAX_ITEMS)) {
      store.delete(extra.id);
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function clearHistory(): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await txDone(tx);
  } finally {
    db.close();
  }
}
