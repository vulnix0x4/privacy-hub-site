/**
 * Vector probe: `tls-ja4`
 *
 * STUB for v1. The real JA4 fingerprint requires the Go TLS-terminator
 * Phase 3 ships — the browser can't see its own ClientHello. Until then,
 * we surface a `pending` sentinel so the UI card renders the "infrastructure
 * pending" state without a network round-trip.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'tls-ja4';

export async function probe(): Promise<ProbeResult> {
  const start = now();
  return {
    vectorId: VECTOR_ID,
    value: {
      status: 'pending',
      reason: 'JA4 backend not live yet',
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
