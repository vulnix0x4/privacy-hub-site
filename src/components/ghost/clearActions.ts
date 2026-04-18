/**
 * "Try to hide" action helpers.
 *
 * Every function is a best-effort, browser-side operation: a failing clear
 * must not crash the UI. The caller is responsible for surfacing a human
 * message after the action. None of these helpers make a network request.
 */
import { GHOST_DB_NAME } from './maskStore';

/** Result of the `clearSiteData` sweep. Used for UI telemetry and assertions. */
export interface ClearSiteDataResult {
  /** Count of caches deleted from `caches.keys()`. */
  cachesCleared: number;
  /** Count of IndexedDB databases deleted (excluding the Ghost Demo's own). */
  indexedDbsDeleted: number;
  /** True if `localStorage.clear()` completed without throwing. */
  localStorageCleared: boolean;
  /** True if `sessionStorage.clear()` completed without throwing. */
  sessionStorageCleared: boolean;
  /** Count of cookies we attempted to expire via `document.cookie`. */
  cookiesCleared: number;
  /**
   * Non-fatal errors surfaced by sub-steps, keyed by step id. The UI can
   * ignore these or list them under a "details" disclosure.
   */
  errors: Record<string, string>;
}

/**
 * Run every clear-site-data step we can do from JS:
 *   - `caches.delete()` for every cache in `caches.keys()`
 *   - `indexedDB.databases()` + `deleteDatabase()` for every DB except
 *     our own `privacy-hub-ghost` (we document this exception in the UI;
 *     the user can also hit the separate "Clear my fingerprint" button)
 *   - `localStorage.clear()` + `sessionStorage.clear()`
 *   - iterate `document.cookie` setting each one to `Max-Age=0`
 *
 * Explicitly NOT called: `navigator.storage.persist(false)` — design-doc §6
 * flagged this as a misconception; it only releases the "persistent" bit
 * and does not clear any data.
 */
export async function clearSiteData(): Promise<ClearSiteDataResult> {
  const errors: Record<string, string> = {};
  let cachesCleared = 0;
  let indexedDbsDeleted = 0;
  let localStorageCleared = false;
  let sessionStorageCleared = false;
  let cookiesCleared = 0;

  // 1. Cache Storage API
  try {
    if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
      const names = await caches.keys();
      for (const name of names) {
        try {
          const ok = await caches.delete(name);
          if (ok) cachesCleared++;
        } catch (err) {
          errors[`cache:${name}`] = errText(err);
        }
      }
    }
  } catch (err) {
    errors['caches'] = errText(err);
  }

  // 2. IndexedDB: every DB except our own mask store.
  try {
    const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (
      idb &&
      typeof (idb as IDBFactory & { databases?: () => Promise<IDBDatabaseInfo[]> })
        .databases === 'function'
    ) {
      const list = await (
        idb as IDBFactory & { databases: () => Promise<IDBDatabaseInfo[]> }
      ).databases();
      for (const info of list) {
        const name = info.name;
        if (!name || name === GHOST_DB_NAME) continue;
        try {
          await deleteDatabase(idb, name);
          indexedDbsDeleted++;
        } catch (err) {
          errors[`idb:${name}`] = errText(err);
        }
      }
    }
  } catch (err) {
    errors['indexedDB'] = errText(err);
  }

  // 3. Web Storage
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
      localStorageCleared = true;
    }
  } catch (err) {
    errors['localStorage'] = errText(err);
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
      sessionStorageCleared = true;
    }
  } catch (err) {
    errors['sessionStorage'] = errText(err);
  }

  // 4. Cookies — iterate and expire. This only reaches cookies on the
  // current origin and only those without `HttpOnly`; the banner copy notes
  // this explicitly.
  try {
    if (typeof document !== 'undefined' && typeof document.cookie === 'string') {
      const entries = document.cookie.split(';');
      for (const entry of entries) {
        const eq = entry.indexOf('=');
        const name = (eq === -1 ? entry : entry.slice(0, eq)).trim();
        if (!name) continue;
        // Reset for current path + host-less scope. Production cookies may
        // have path/domain attributes that require a separate reset each —
        // we do our best without knowing the original attributes.
        document.cookie = `${name}=; Max-Age=0; path=/`;
        document.cookie = `${name}=; Max-Age=0`;
        cookiesCleared++;
      }
    }
  } catch (err) {
    errors['cookies'] = errText(err);
  }

  return {
    cachesCleared,
    indexedDbsDeleted,
    localStorageCleared,
    sessionStorageCleared,
    cookiesCleared,
    errors,
  };
}

/**
 * Open a private-window popup to `/en/`. Browsers vary wildly on whether
 * they honor the `noopener`-plus-popup hint as a private-window request;
 * the accompanying UI copy says so. We NEVER pass `noreferrer` here — the
 * popup's `window.opener` is already detached by `noopener`.
 */
export function openPrivateWindow(url: string = '/en/'): Window | null {
  if (typeof window === 'undefined') return null;
  try {
    // `noopener` detaches the opener chain so the new tab can't navigate us.
    return window.open(url, '_blank', 'noopener');
  } catch {
    return null;
  }
}

/**
 * Extract a message from any thrown value without leaking stack traces to
 * the user. Used purely for populating the `errors` map inside the
 * clear-site-data result.
 */
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Wrap the event-based `indexedDB.deleteDatabase` API in a Promise.
 * Resolves when `onsuccess` fires or when `onblocked` fires (connections
 * held by other tabs block deletion until released; we surface blocked as
 * "done from our perspective" so the UI doesn't hang).
 */
function deleteDatabase(idb: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = idb.deleteDatabase(name);
    req.onsuccess = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    req.onerror = () => {
      if (settled) return;
      settled = true;
      reject(req.error ?? new Error('deleteDatabase failed'));
    };
    req.onblocked = () => {
      // Other connections hold the DB — the browser will complete deletion
      // when they close. From the user's perspective the intent was honored.
      if (settled) return;
      settled = true;
      resolve();
    };
  });
}
