/**
 * IndexedDB-backed store for the Ghost Demo's single `MaskRecord`.
 *
 * Data shape: database `privacy-hub-ghost`, object store `mask`, one record
 * with id `'current'`. Everything runs client-side; nothing in this file
 * triggers a network round-trip. The store is deliberately tiny — one
 * record, three fields besides the id — so UI state is simple and the
 * clear-site-data flow can preserve the record without ceremony.
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { MaskRecord } from './types';

export const GHOST_DB_NAME = 'privacy-hub-ghost';
export const GHOST_STORE_NAME = 'mask';
export const GHOST_RECORD_ID = 'current';
const GHOST_DB_VERSION = 1;

interface GhostSchema {
  [GHOST_STORE_NAME]: {
    key: string;
    value: MaskRecord;
  };
}

async function open(): Promise<IDBPDatabase<GhostSchema>> {
  return openDB<GhostSchema>(GHOST_DB_NAME, GHOST_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(GHOST_STORE_NAME)) {
        db.createObjectStore(GHOST_STORE_NAME, { keyPath: 'id' });
      }
    },
  });
}

/**
 * Load the current mask record if one exists. Returns `null` on first visit
 * or if IndexedDB is unavailable (private-mode Safari, old browsers, test
 * environments without `indexedDB`).
 */
export async function loadMask(): Promise<MaskRecord | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await open();
    try {
      const existing = (await db.get(GHOST_STORE_NAME, GHOST_RECORD_ID)) as
        | MaskRecord
        | undefined;
      return existing ?? null;
    } finally {
      db.close();
    }
  } catch {
    // Any IDB failure is treated as "no prior visit." We never throw from
    // the Ghost Demo — worst case the UI shows the first-visit message.
    return null;
  }
}

/**
 * Persist a new or updated mask record. If a record already exists, its
 * `firstSeen` is preserved; otherwise it's set to `lastSeen`.
 *
 * `resilientHash` is optional (for back-compat with the single-hash era).
 * Callers post-Wave-3+ always pass it so the resilient-persistent verdict
 * can fire on the next rescan.
 */
export async function saveMask(
  hash: string,
  resilientHash?: string,
  now: number = Date.now()
): Promise<MaskRecord> {
  const record: MaskRecord = {
    id: GHOST_RECORD_ID,
    hash,
    firstSeen: now,
    lastSeen: now,
  };
  if (resilientHash !== undefined) {
    record.resilientHash = resilientHash;
  }
  if (typeof indexedDB === 'undefined') return record;
  try {
    const db = await open();
    try {
      const existing = (await db.get(GHOST_STORE_NAME, GHOST_RECORD_ID)) as
        | MaskRecord
        | undefined;
      if (existing) {
        record.firstSeen = existing.firstSeen;
      }
      await db.put(GHOST_STORE_NAME, record);
      return record;
    } finally {
      db.close();
    }
  } catch {
    return record;
  }
}

/**
 * Delete the single `current` mask record (the "Clear my fingerprint from
 * this browser" button). Does NOT delete the database itself, so returning
 * visitors can immediately store a fresh hash without the DB-create cost.
 */
export async function clearMask(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await open();
    try {
      await db.delete(GHOST_STORE_NAME, GHOST_RECORD_ID);
    } finally {
      db.close();
    }
  } catch {
    // Swallow — deletion is a best-effort user-facing action.
  }
}
