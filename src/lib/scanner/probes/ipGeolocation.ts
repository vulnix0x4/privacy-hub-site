/**
 * Vector probe: `ip-geolocation`
 *
 * Fetches `/api/scan/headers` to surface the request IP and the small
 * allow-list of echoed request headers. Every HTTP server sees these; we
 * just mirror them back so the UI can explain what the user broadcasts.
 *
 * Never throws: any fetch or parse failure is caught and surfaced as
 * `error` on the ProbeResult.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'ip-geolocation';

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    const res = await fetch('/api/scan/headers', { cache: 'no-store' });
    if (!res.ok) {
      return {
        vectorId: VECTOR_ID,
        value: null,
        error: `HTTP ${res.status}`,
        durationMs: Math.max(0, now() - start),
      };
    }
    const value = (await res.json()) as { ip: string; headers: Record<string, string> };
    return {
      vectorId: VECTOR_ID,
      value,
      durationMs: Math.max(0, now() - start),
    };
  } catch (err) {
    return {
      vectorId: VECTOR_ID,
      value: null,
      error: err instanceof Error ? err.message : String(err),
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
