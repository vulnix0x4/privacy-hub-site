/**
 * Vector probe: `screen-viewport`
 *
 * Captures the screen dimensions, available dimensions, colour depth, the
 * inner viewport, and devicePixelRatio. Tor/Firefox RFP letterboxing
 * quantises these to 200x100 multiples — surface the raw numbers so the
 * UI can call out non-letterboxed values.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'screen-viewport';

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    if (typeof screen === 'undefined' || typeof window === 'undefined') {
      return done(start, {});
    }
    const value = {
      screenWidth: screen.width,
      screenHeight: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
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
