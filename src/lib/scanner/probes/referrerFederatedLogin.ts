/**
 * Vector probe: `referrer-federated-login`
 *
 * Reads `document.referrer` and checks which federated-credential APIs
 * the browser exposes. FedCM's `IdentityCredential` plus the older
 * `FederatedCredential` give sites a silent way to probe which IdPs
 * you're already signed into; their mere presence is worth surfacing.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'referrer-federated-login';

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    const documentReferrer =
      typeof document !== 'undefined' ? document.referrer : '';
    const win = typeof window !== 'undefined' ? window : undefined;
    const federatedCredential =
      !!win && 'FederatedCredential' in (win as unknown as Record<string, unknown>);
    const identityCredential =
      !!win && 'IdentityCredential' in (win as unknown as Record<string, unknown>);
    return done(start, {
      documentReferrer,
      federatedCredential,
      identityCredential,
    });
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
