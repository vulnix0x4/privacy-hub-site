import type { DefenseMode, StabilityResult, VectorFamily } from './types';

export interface DefenseModeInput {
  vectorId: string;
  family: VectorFamily;
  stability: StabilityResult;
  /**
   * Map of `browserId → canonical spoof value` for this vector. If the observed
   * value (deep-equal) matches any entry, the vector is reported as SPOOFED.
   */
  knownSpoofValues?: Record<string, unknown>;
  /**
   * Known Firefox FPP quantized buckets for this vector. If the observed value
   * lands in one of these buckets (deep-equal), the vector is QUANTIZED.
   */
  knownQuantizedBuckets?: unknown[];
}

/**
 * IDs in the `network` family whose STABLE state is every-site-visible and
 * therefore not a defense failure — they get INFO-PUBLIC instead of UNCHANGED.
 * Keep this list explicit (vs an `endsWith('Address')` heuristic) so expansion
 * is a deliberate review moment.
 */
const NETWORK_INFO_PUBLIC_VECTORS = new Set<string>([
  'ipAddress',
  'acceptLanguageHeader',
  'acceptEncodingHeader',
  'acceptHeader',
  'clientHintsHeaders',
]);

/**
 * Map (Stability × known-spoof × known-bucket × family/vector) → DefenseMode.
 * Pure function; no I/O, no framework dependencies.
 */
export function classifyDefenseMode(input: DefenseModeInput): DefenseMode {
  const { stability, family, vectorId, knownSpoofValues, knownQuantizedBuckets } = input;

  if (stability.stability === 'ABSENT') return 'BLOCKED';
  if (stability.stability === 'JITTERED') return 'FARBLED';

  // stability === 'STABLE' from here on. Pick the representative value from
  // the first read — all 3 reads are unanimous in this branch.
  const observed = stability.reads[0]?.value;

  if (knownSpoofValues && matchesAny(observed, Object.values(knownSpoofValues))) {
    return 'SPOOFED';
  }

  if (knownQuantizedBuckets && matchesAny(observed, knownQuantizedBuckets)) {
    return 'QUANTIZED';
  }

  if (family === 'network' && NETWORK_INFO_PUBLIC_VECTORS.has(vectorId)) {
    return 'INFO-PUBLIC';
  }

  return 'UNCHANGED';
}

/** Deep-equality match of `v` against a candidate set using JSON serialisation. */
function matchesAny(v: unknown, candidates: readonly unknown[]): boolean {
  const target = serialize(v);
  for (const c of candidates) {
    if (serialize(c) === target) return true;
  }
  return false;
}

function serialize(v: unknown): string {
  if (v === null) return '__null__';
  if (v === undefined) return '__undef__';
  if (typeof v === 'number' && Number.isNaN(v)) return '__nan__';
  if (
    typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean' ||
    typeof v === 'bigint'
  ) {
    return `${typeof v}:${String(v)}`;
  }
  try {
    return `json:${JSON.stringify(v)}`;
  } catch {
    return `opaque:${Math.random()}`;
  }
}
