/**
 * Vector probe: `supercookies-hsts-etag-favicon`
 *
 * STUB for v1. Real supercookie detection requires a paired same-origin +
 * cross-origin endpoint set that issues cache-keyed identifiers we can
 * observe across requests. Phase 3 ships those endpoints. Until then,
 * the probe returns a `pending` sentinel so the UI card renders the
 * "infrastructure pending" state.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'supercookies-hsts-etag-favicon';

export async function probe(): Promise<ProbeResult> {
  const start = now();
  return {
    vectorId: VECTOR_ID,
    value: {
      status: 'pending',
      reason: 'requires same-origin & cross-origin probe endpoints',
    },
    durationMs: Math.max(0, now() - start),
  };
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
