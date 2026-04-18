/**
 * Vector probe: `third-party-cookies-storage`
 *
 * Exercises each of the four client-side storage primitives once and
 * reports which succeeded. This runs same-origin (the hub itself), not
 * cross-site — a real third-party-cookie probe needs an embedded iframe
 * pointing at a sibling domain, which is out of v1 scope. What we
 * surface here is the baseline: whether the browser lets us read/write
 * cookies and Web Storage at all.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'third-party-cookies-storage';
const TEST_KEY = '__privacy-hub-storage-test__';
const TEST_VALUE = '1';

interface StorageSnapshot {
  cookieEnabled: boolean | null;
  ourSetCookieReadback: boolean;
  localStorage: boolean;
  sessionStorage: boolean;
  indexedDB: boolean;
}

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    const cookieEnabled = readCookieEnabled();
    const ourSetCookieReadback = tryCookieRoundTrip();
    const localStorageOk = tryLocalStorage();
    const sessionStorageOk = trySessionStorage();
    const indexedDBOk = typeof globalThis.indexedDB !== 'undefined';

    const value: StorageSnapshot = {
      cookieEnabled,
      ourSetCookieReadback,
      localStorage: localStorageOk,
      sessionStorage: sessionStorageOk,
      indexedDB: indexedDBOk,
    };
    return done(start, value);
  } catch (err) {
    return {
      vectorId: VECTOR_ID,
      value: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.max(0, now() - start),
    };
  }
}

function readCookieEnabled(): boolean | null {
  try {
    if (typeof navigator === 'undefined') return null;
    return Boolean(navigator.cookieEnabled);
  } catch {
    return null;
  }
}

function tryCookieRoundTrip(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    document.cookie = `${TEST_KEY}=${TEST_VALUE}; path=/; SameSite=Lax`;
    const readback = document.cookie.includes(`${TEST_KEY}=${TEST_VALUE}`);
    // Clear the probe cookie immediately. Best-effort; may be blocked by ITP.
    document.cookie = `${TEST_KEY}=; path=/; Max-Age=0`;
    return readback;
  } catch {
    return false;
  }
}

function tryLocalStorage(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(TEST_KEY, TEST_VALUE);
    const ok = localStorage.getItem(TEST_KEY) === TEST_VALUE;
    localStorage.removeItem(TEST_KEY);
    return ok;
  } catch {
    return false;
  }
}

function trySessionStorage(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    sessionStorage.setItem(TEST_KEY, TEST_VALUE);
    const ok = sessionStorage.getItem(TEST_KEY) === TEST_VALUE;
    sessionStorage.removeItem(TEST_KEY);
    return ok;
  } catch {
    return false;
  }
}

function done(start: number, value: unknown): ProbeResult {
  return {
    vectorId: VECTOR_ID,
    value,
    durationMs: Math.max(0, now() - start),
  };
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
