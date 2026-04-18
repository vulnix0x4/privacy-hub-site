/**
 * Vector probe: `timezone-locale`
 *
 * Reads the resolved Intl.DateTimeFormat options — timezone, locale,
 * calendar, numbering system. Tor Browser canonicalises timezone to
 * `Etc/UTC`; everyone else exposes the real local zone.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'timezone-locale';

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions();
    const value = {
      timezone: resolved.timeZone,
      locale: resolved.locale,
      calendar: resolved.calendar,
      numberingSystem: resolved.numberingSystem,
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
