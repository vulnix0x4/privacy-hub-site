/**
 * SQLite-on-tmpfs TTL nonce store for the live scanner.
 *
 * - Uses Node 22+ built-in `node:sqlite` (`DatabaseSync`). No external deps.
 * - Runs in-process alongside the Astro Node server.
 * - DB path defaults to `/tmp/scan-nonces.db`; the container mounts `/tmp` as
 *   tmpfs so the whole store evaporates with the container (design doc §13.1 #6).
 * - All statements are prepared once at `open` time and reused across calls.
 *
 * Nonces are UUIDv4 strings (`crypto.randomUUID()`), stored with a 60-second
 * default TTL. Callers can extend or shorten via `issue(ttlMs)`.
 *
 * The store is synchronous (node:sqlite is sync); concurrent HTTP requests in
 * the Node server serialize on the single event-loop tick, so no extra locking
 * is required.
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

/** Default nonce TTL: 60 seconds. Matches design doc §13.1 non-negotiable #6. */
const DEFAULT_TTL_MS = 60_000;

/** Default auto-sweep interval for `scheduleSweep`. */
const DEFAULT_SWEEP_INTERVAL_MS = 10_000;

/** Schema: rowid-less table keyed by nonce, with an index on expiry for sweep. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  resolver_ip TEXT
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_expires ON nonces(expires_at);
`;

export interface NonceStore {
  /**
   * Mint a fresh nonce and persist it with an `expires_at = now + ttlMs`.
   * @param ttlMs Lifetime in milliseconds. Defaults to 60_000.
   */
  issue(ttlMs?: number): { nonce: string; expiresAt: number };
  /**
   * Record the resolver IP observed for `nonce`. Returns `true` on success,
   * `false` if the nonce is unknown or already expired.
   */
  record(nonce: string, resolverIp: string): boolean;
  /**
   * Look up the recorded resolver IP for `nonce`. Returns `null` if the nonce
   * is unknown or expired. `resolverIp` is `null` if the nonce was issued but
   * never recorded.
   */
  readOne(nonce: string): { resolverIp: string | null } | null;
  /**
   * Delete rows whose `expires_at <= now`. Returns the number of rows removed.
   * @param now Unix ms timestamp. Defaults to `Date.now()`.
   */
  sweep(now?: number): number;
  /**
   * List currently-active nonces (expires_at > now). Returns an array of nonce
   * strings, capped at `limit` (default 1000). Used by the scanner-nonce
   * sidecar to drive NSD zone rewrites without exposing any resolver-IP data.
   */
  listActive(limit?: number, now?: number): string[];
  /** Close the underlying SQLite connection. */
  close(): void;
}

/**
 * Open (or create) the nonce store at `dbPath`. Resolution order:
 *   1. explicit `dbPath` argument
 *   2. `SCAN_NONCE_DB` env var
 *   3. `/tmp/scan-nonces.db`
 */
export function openNonceStore(dbPath?: string): NonceStore {
  const resolved =
    dbPath ?? process.env['SCAN_NONCE_DB'] ?? '/tmp/scan-nonces.db';
  const db = new DatabaseSync(resolved);
  db.exec(SCHEMA);

  // Prepared statements — created once per open(), reused across calls.
  const insertStmt = db.prepare(
    'INSERT INTO nonces (nonce, created_at, expires_at, resolver_ip) VALUES (?, ?, ?, NULL)'
  );
  const recordStmt = db.prepare(
    'UPDATE nonces SET resolver_ip = ? WHERE nonce = ? AND expires_at > ?'
  );
  const readStmt = db.prepare(
    'SELECT resolver_ip AS resolverIp FROM nonces WHERE nonce = ? AND expires_at > ?'
  );
  const sweepStmt = db.prepare('DELETE FROM nonces WHERE expires_at <= ?');
  const listActiveStmt = db.prepare(
    'SELECT nonce AS nonce FROM nonces WHERE expires_at > ? ORDER BY nonce LIMIT ?'
  );

  return {
    issue(ttlMs: number = DEFAULT_TTL_MS): { nonce: string; expiresAt: number } {
      const now = Date.now();
      const expiresAt = now + ttlMs;
      const nonce = randomUUID();
      insertStmt.run(nonce, now, expiresAt);
      return { nonce, expiresAt };
    },

    record(nonce: string, resolverIp: string): boolean {
      const now = Date.now();
      const info = recordStmt.run(resolverIp, nonce, now);
      // `changes` is 0 when the nonce doesn't exist OR is expired.
      return Number(info.changes) > 0;
    },

    readOne(nonce: string): { resolverIp: string | null } | null {
      const now = Date.now();
      const row = readStmt.get(nonce, now) as
        | { resolverIp: string | null }
        | undefined;
      if (!row) return null;
      return { resolverIp: row.resolverIp ?? null };
    },

    sweep(now: number = Date.now()): number {
      const info = sweepStmt.run(now);
      return Number(info.changes);
    },

    listActive(limit: number = 1000, now: number = Date.now()): string[] {
      const rows = listActiveStmt.all(now, limit) as Array<{ nonce: string }>;
      return rows.map((r) => r.nonce);
    },

    close(): void {
      db.close();
    },
  };
}

/** Handle returned by `scheduleSweep` — call `.stop()` to cancel the timer. */
export interface SweepHandle {
  stop(): void;
}

/**
 * Run `store.sweep()` every `intervalMs` on a Node timer. The returned handle's
 * `.stop()` cancels the interval. The timer is `unref()`ed so it doesn't keep
 * the event loop alive by itself.
 */
export function scheduleSweep(
  store: NonceStore,
  intervalMs: number = DEFAULT_SWEEP_INTERVAL_MS
): SweepHandle {
  const timer = setInterval(() => {
    try {
      store.sweep();
    } catch {
      // Swallow — auto-sweep is best-effort; failures shouldn't crash the server.
    }
  }, intervalMs);
  // Don't block process exit on the sweep timer.
  timer.unref?.();

  return {
    stop(): void {
      clearInterval(timer);
    },
  };
}
