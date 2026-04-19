/**
 * Short interpretation line rendered in the middle of each ScannerCard.
 *
 * Intentionally generic for Phase 5: it keys off `DefenseMode` only and does
 * not inspect the raw value shape. Phase 6 will swap this for per-vector
 * explainers that deep-link into the encyclopedia pages; keeping the helper
 * isolated keeps that refactor local.
 */
import type { DefenseMode, VectorFamily } from '../../lib/scanner/types';

export type InterpretationMode = DefenseMode | 'pending-backend';

export function getInterpretation(
  mode: InterpretationMode | undefined,
  family: VectorFamily
): string {
  if (mode === undefined) return 'Scanning…';

  switch (mode) {
    case 'UNCHANGED':
      return 'Your browser returned a stable, identifying value. Sites that hash it get a near-unique signature.';
    case 'SPOOFED':
      return 'Value replaced with a canonical uniform fake. Every user in your cohort returns the same thing.';
    case 'FARBLED':
      return 'Value jittered per read — rotated per session and eTLD+1. Single-read fingerprints won\'t stick.';
    case 'QUANTIZED':
      return 'Value rounded into a small bucket. Stable per session, but you share it with a large cohort.';
    case 'BLOCKED':
      return 'API was missing or the read returned empty. Nothing to fingerprint here.';
    case 'INFO-PUBLIC':
      return family === 'network'
        ? 'Every HTTP server sees this — it\'s what your packets broadcast. Surface-only; no defense applies.'
        : 'Publicly observable by every site regardless of browser. Surface-only; no defense applies.';
    case 'INFO-CONTEXT':
      return 'Contextual detail — not a meaningful fingerprint on its own, shown here for transparency.';
    case 'pending-backend':
      return 'Measured server-side — requires the Phase 3 scanner backend (raw-TLS passthrough for JA4, authoritative DNS for leak observation, cache-echo endpoints for supercookies). The card fills in once those services are on. See the scanner-privacy page for the roadmap.';
  }
}
