import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearSiteData, openPrivateWindow } from './clearActions';
import { GHOST_DB_NAME } from './maskStore';

type CachesStub = {
  keys: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

type IdbStub = {
  databases: ReturnType<typeof vi.fn>;
  deleteDatabase: ReturnType<typeof vi.fn>;
  open?: ReturnType<typeof vi.fn>;
  cmp?: ReturnType<typeof vi.fn>;
};

/**
 * happy-dom's globals differ from jsdom. We stub just what we need per-test,
 * then restore previous values in `afterEach`. Nothing here touches a real
 * cache/IndexedDB.
 */

describe('clearSiteData', () => {
  const originalCaches = (globalThis as { caches?: unknown }).caches;
  const originalIdb = (globalThis as { indexedDB?: unknown }).indexedDB;

  beforeEach(() => {
    (globalThis as unknown as { caches?: unknown }).caches = undefined;
    (globalThis as unknown as { indexedDB?: unknown }).indexedDB = undefined;
  });

  afterEach(() => {
    (globalThis as unknown as { caches?: unknown }).caches = originalCaches;
    (globalThis as unknown as { indexedDB?: unknown }).indexedDB = originalIdb;
  });

  it('clears all named caches from `caches.keys()`', async () => {
    const stub: CachesStub = {
      keys: vi.fn().mockResolvedValue(['cache-a', 'cache-b']),
      delete: vi.fn().mockResolvedValue(true),
    };
    (globalThis as unknown as { caches?: CachesStub }).caches = stub;
    const result = await clearSiteData();
    expect(stub.keys).toHaveBeenCalled();
    expect(stub.delete).toHaveBeenCalledWith('cache-a');
    expect(stub.delete).toHaveBeenCalledWith('cache-b');
    expect(result.cachesCleared).toBe(2);
  });

  it('skips the Ghost Demo database when sweeping IndexedDB', async () => {
    // Emulate deleteDatabase: return an object whose `onsuccess` we call sync.
    const deleteDatabase = vi.fn((_name: string) => {
      const req: {
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onblocked: (() => void) | null;
        error: DOMException | null;
      } = {
        onsuccess: null,
        onerror: null,
        onblocked: null,
        error: null,
      };
      queueMicrotask(() => req.onsuccess?.());
      return req as unknown as IDBOpenDBRequest;
    });
    const stub: IdbStub = {
      databases: vi.fn().mockResolvedValue([
        { name: GHOST_DB_NAME, version: 1 },
        { name: 'third-party-tracker', version: 3 },
        { name: 'other-app', version: 1 },
      ]),
      deleteDatabase,
      cmp: vi.fn(),
      open: vi.fn(),
    };
    (globalThis as unknown as { indexedDB?: unknown }).indexedDB = stub;

    const result = await clearSiteData();
    expect(stub.databases).toHaveBeenCalled();
    // Our own DB must be untouched.
    expect(deleteDatabase).not.toHaveBeenCalledWith(GHOST_DB_NAME);
    expect(deleteDatabase).toHaveBeenCalledWith('third-party-tracker');
    expect(deleteDatabase).toHaveBeenCalledWith('other-app');
    expect(result.indexedDbsDeleted).toBe(2);
  });

  it('clears localStorage and sessionStorage when available', async () => {
    // happy-dom provides both; stash one entry in each to be sure.
    localStorage.setItem('junk', '1');
    sessionStorage.setItem('junk', '1');
    const result = await clearSiteData();
    expect(result.localStorageCleared).toBe(true);
    expect(result.sessionStorageCleared).toBe(true);
    expect(localStorage.getItem('junk')).toBeNull();
    expect(sessionStorage.getItem('junk')).toBeNull();
  });

  it('expires cookies by setting Max-Age=0 for each name in document.cookie', async () => {
    document.cookie = 'tracker1=abc';
    document.cookie = 'tracker2=xyz';
    const result = await clearSiteData();
    expect(result.cookiesCleared).toBeGreaterThanOrEqual(2);
  });

  it('never throws even if every sub-step fails', async () => {
    const stub: CachesStub = {
      keys: vi.fn().mockRejectedValue(new Error('denied')),
      delete: vi.fn(),
    };
    (globalThis as unknown as { caches?: CachesStub }).caches = stub;
    const result = await clearSiteData();
    expect(result.errors['caches']).toMatch(/denied/);
  });
});

describe('openPrivateWindow', () => {
  it('calls window.open with noopener and returns its handle', () => {
    const handle = {} as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(handle);
    const result = openPrivateWindow('/en/');
    expect(open).toHaveBeenCalledWith('/en/', '_blank', 'noopener');
    expect(result).toBe(handle);
    open.mockRestore();
  });
});
