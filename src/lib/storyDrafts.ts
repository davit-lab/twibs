// Story drafts: autosaves the current story (media + overlays + music) in
// IndexedDB so a prematurely-closed editor doesn't lose work. Media blobs are
// stored directly (not base64) to keep memory small.

import type { StoryOverlay } from '@/lib/stories';
import type { MusicTrack } from '@/hooks/useMusicLibrary';

interface IDBRecord {
  id: string;
  blob: Blob;
  mediaType: 'image' | 'video';
  overlays: StoryOverlay[];
  music: MusicTrack | null;
  caption: string;
  updatedAt: number;
}

export interface StoryDraft {
  id: string;
  blob: Blob;
  mediaType: 'image' | 'video';
  overlays: StoryOverlay[];
  music: MusicTrack | null;
  caption: string;
  updatedAt: number;
}

const DB_NAME = 'twibsers-stories';
const STORE = 'drafts';
const DRAFT_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DRAFT_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function toDraft(record: IDBRecord): StoryDraft {
  const { blob, mediaType, overlays, music, caption, updatedAt } = record;
  return { id: record.id, blob, mediaType, overlays, music, caption, updatedAt };
}

export async function saveStoryDraft(draft: Omit<IDBRecord, 'id' | 'updatedAt'>, id?: string): Promise<StoryDraft> {
  const db = await openDb();
  const record: IDBRecord = {
    id: id ?? `draft-${Date.now()}`,
    ...draft,
    updatedAt: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return toDraft(record);
}

export async function loadStoryDrafts(): Promise<StoryDraft[]> {
  const db = await openDb();
  const records = await new Promise<IDBRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as IDBRecord[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return records
    .filter((r) => r.blob && r.mediaType)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(toDraft);
}

export async function deleteStoryDraft(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearStoryDrafts(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Saves a draft but silently ignores failures so autosave never interrupts the user. */
export async function saveStoryDraftSafe(draft: Parameters<typeof saveStoryDraft>[0], id?: string): Promise<StoryDraft | null> {
  try {
    return await saveStoryDraft(draft, id);
  } catch (error) {
    console.error('Could not save story draft:', error);
    return null;
  }
}