/**
 * Vector probe: `dns-leaks`
 *
 * STUB for v1. The full DNS-leak / DoH check requires the NSD authoritative
 * service Phase 3 ships — random subdomain resolution, CAA + TXT records,
 * resolver-IP lookup. Until then, we surface a `pending` sentinel so the UI
 * can render an "infrastructure pending" state without a network round-trip.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'dns-leaks';

export async function probe(): Promise<ProbeResult> {
  const start = now();
  return {
    vectorId: VECTOR_ID,
    value: {
      status: 'pending',
      reason: 'scanner-backend not live yet',
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
