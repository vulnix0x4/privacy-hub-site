/**
 * Vector probe: `tls-ja4`
 *
 * Fetches the user's JA4 fingerprint from the Phase-3 Go scanner backend.
 * The backend terminates TLS itself at `https://ja4.scan.privacy.whattheflip.lol/echo`
 * so it can observe the raw ClientHello, then returns `{ ja4, ja4Full, timestamp }`.
 *
 * URL resolution order:
 *   1. `import.meta.env.PUBLIC_SCAN_JA4_URL` (set at build-time from
 *      `.env`, read via Astro's env infra).
 *   2. Falls back to `https://ja4.scan.privacy.whattheflip.lol/echo`.
 *
 * Graceful-degradation rule: if the fetch fails (backend down, network
 * error, CORS failure), we surface the same `{ status: 'pending' }` sentinel
 * the v1 stub did — the UI already knows how to render that. Exceptions are
 * caught and mapped to `error`.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'tls-ja4';

const DEFAULT_URL = 'https://ja4.scan.privacy.whattheflip.lol/echo';

interface Ja4EchoResponse {
  ja4?: unknown;
  ja4Full?: unknown;
  timestamp?: unknown;
}

function resolveUrl(): string {
  // Astro exposes PUBLIC_-prefixed vars to client JS via import.meta.env.
  // Guard access so SSR + test envs without Vite don't explode.
  try {
    // Astro/Vite populates import.meta.env with PUBLIC_-prefixed vars at build time.
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const fromEnv = env?.['PUBLIC_SCAN_JA4_URL'];
    if (fromEnv && typeof fromEnv === 'string') {
      return fromEnv.endsWith('/echo') ? fromEnv : fromEnv.replace(/\/+$/, '') + '/echo';
    }
  } catch {
    /* ignore — fall through to default */
  }
  return DEFAULT_URL;
}

export async function probe(): Promise<ProbeResult> {
  const start = now();
  const url = resolveUrl();
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors',
    });
    if (!res.ok) {
      return {
        vectorId: VECTOR_ID,
        value: { status: 'pending', reason: `scanner-ja4 HTTP ${res.status}` },
        durationMs: Math.max(0, now() - start),
      };
    }
    const body = (await res.json()) as Ja4EchoResponse;
    const ja4 = typeof body.ja4 === 'string' ? body.ja4 : '';
    const ja4Full = typeof body.ja4Full === 'string' ? body.ja4Full : '';
    const timestamp = typeof body.timestamp === 'number' ? body.timestamp : Date.now();

    if (!ja4) {
      return {
        vectorId: VECTOR_ID,
        value: { status: 'pending', reason: 'scanner-ja4 returned empty fingerprint' },
        durationMs: Math.max(0, now() - start),
      };
    }
    return {
      vectorId: VECTOR_ID,
      value: { ja4, ja4Full, timestamp },
      durationMs: Math.max(0, now() - start),
    };
  } catch (err) {
    return {
      vectorId: VECTOR_ID,
      value: {
        status: 'pending',
        reason: 'scanner-ja4 unreachable: ' + (err instanceof Error ? err.message : String(err)),
      },
      durationMs: Math.max(0, now() - start),
    };
  }
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
