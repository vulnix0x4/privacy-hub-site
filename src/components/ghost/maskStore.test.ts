import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MaskRecord } from './types';

/**
 * We exercise the IndexedDB wrapper by mocking the `idb` package. That keeps
 * the test fast, deterministic, and independent of happy-dom's IndexedDB
 * support (which varies). The mock captures call arguments so we can assert
 * we're reading/writing the right DB, store, and record id.
 */

interface FakeDB {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  objectStoreNames: { contains: () => boolean };
}

const fakeDb: FakeDB = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  close: vi.fn(),
  objectStoreNames: { contains: () => true },
};

vi.mock('idb', () => ({
  openDB: vi.fn(async (..._args: unknown[]) => fakeDb),
}));

// Ensure `indexedDB` is defined so the runtime guard doesn't bail early.
beforeEach(() => {
  fakeDb.get.mockReset();
  fakeDb.put.mockReset();
  fakeDb.delete.mockReset();
  fakeDb.close.mockReset();
  // happy-dom provides `indexedDB`; ensure something truthy is set so the
  // runtime guard in `maskStore.ts` doesn't short-circuit.
  if (typeof (globalThis as { indexedDB?: unknown }).indexedDB === 'undefined') {
    (globalThis as { indexedDB?: unknown }).indexedDB = {};
  }
});

describe('maskStore', () => {
  it('loadMask returns null when no record exists', async () => {
    fakeDb.get.mockResolvedValueOnce(undefined);
    const { loadMask, GHOST_STORE_NAME, GHOST_RECORD_ID } = await import('./maskStore');
    const result = await loadMask();
    expect(result).toBeNull();
    expect(fakeDb.get).toHaveBeenCalledWith(GHOST_STORE_NAME, GHOST_RECORD_ID);
    expect(fakeDb.close).toHaveBeenCalled();
  });

  it('loadMask returns the stored record when present', async () => {
    const stored: MaskRecord = {
      id: 'current',
      hash: 'abc',
      firstSeen: 100,
      lastSeen: 200,
    };
    fakeDb.get.mockResolvedValueOnce(stored);
    const { loadMask } = await import('./maskStore');
    const result = await loadMask();
    expect(result).toEqual(stored);
  });

  it('loadMask swallows errors and returns null', async () => {
    fakeDb.get.mockRejectedValueOnce(new Error('quota'));
    const { loadMask } = await import('./maskStore');
    const result = await loadMask();
    expect(result).toBeNull();
  });

  it('saveMask writes a fresh record and sets firstSeen to now on first visit', async () => {
    fakeDb.get.mockResolvedValueOnce(undefined);
    fakeDb.put.mockResolvedValueOnce(undefined);
    const { saveMask } = await import('./maskStore');
    const r = await saveMask('hash-1', undefined, 500);
    expect(r.firstSeen).toBe(500);
    expect(r.lastSeen).toBe(500);
    expect(r.hash).toBe('hash-1');
    expect(fakeDb.put).toHaveBeenCalledTimes(1);
    const putArg = fakeDb.put.mock.calls[0]?.[1] as MaskRecord;
    expect(putArg.id).toBe('current');
  });

  it('saveMask preserves firstSeen on subsequent visits', async () => {
    const existing: MaskRecord = {
      id: 'current',
      hash: 'old',
      firstSeen: 100,
      lastSeen: 150,
    };
    fakeDb.get.mockResolvedValueOnce(existing);
    fakeDb.put.mockResolvedValueOnce(undefined);
    const { saveMask } = await import('./maskStore');
    const r = await saveMask('new-hash', undefined, 900);
    expect(r.firstSeen).toBe(100); // preserved
    expect(r.lastSeen).toBe(900); // updated
    expect(r.hash).toBe('new-hash');
  });

  it('clearMask deletes the current record without destroying the DB', async () => {
    fakeDb.delete.mockResolvedValueOnce(undefined);
    const { clearMask, GHOST_STORE_NAME, GHOST_RECORD_ID } = await import('./maskStore');
    await clearMask();
    expect(fakeDb.delete).toHaveBeenCalledWith(GHOST_STORE_NAME, GHOST_RECORD_ID);
  });
});
