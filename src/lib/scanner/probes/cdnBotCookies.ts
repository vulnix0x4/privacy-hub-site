/**
 * Vector probe: `cdn-bot-cookies`
 *
 * Scans `document.cookie` for the canonical CDN bot-management cookie
 * names. Their presence on a first-visit page load indicates the
 * preceding CDN is tracking the visitor across origins.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'cdn-bot-cookies';

const CDN_BOT_COOKIE_NAMES = [
  '__cf_bm',
  '_abck',
  '_px',
  '_pxhd',
  'incap_ses',
  'visid_incap',
] as const;

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    if (typeof document === 'undefined') {
      return done(start, { found: [] });
    }
    const raw = document.cookie ?? '';
    const names = raw
      .split(';')
      .map((p) => p.trim().split('=')[0] ?? '')
      .filter((n) => n.length > 0);

    const found: string[] = [];
    for (const candidate of CDN_BOT_COOKIE_NAMES) {
      if (names.some((n) => n === candidate || n.startsWith(`${candidate}_`))) {
        found.push(candidate);
      }
    }
    return done(start, { found });
  } catch (err) {
    return {
      vectorId: VECTOR_ID,
      value: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.max(0, now() - start),
    };
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
