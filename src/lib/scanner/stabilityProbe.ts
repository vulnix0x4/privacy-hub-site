import type { ProbeResult, Stability, StabilityResult } from './types';

export interface StabilityProbeOptions {
  /** Spacing between reads. Design-doc §5.4 calls for ~50 ms; tests pass 0. */
  delayMs?: number;
  /** Hard cap on total reads (3 normal + up to 2 retries). Default 5. */
  maxReads?: number;
}

const DEFAULT_DELAY_MS = 50;
const DEFAULT_MAX_READS = 5;
const INITIAL_READS = 3;

/**
 * Runs a probe's `read` callback multiple times to classify stability
 * (design doc §5.4).
 *
 * Rules (applied to the initial 3-read burst):
 *   - All reads unanimous & non-empty    → STABLE
 *   - All reads empty or threw           → ABSENT
 *   - 3 reads all distinct from each other → JITTERED (no retry; irredeemable)
 *   - Mixed with repeats (e.g. `[a, a, b]`)  → retry out to `maxReads` reads,
 *                                              then take strict majority
 *                                              (`> half`) → STABLE / ABSENT,
 *                                              else JITTERED.
 *
 * Equality: primitives compared by value (so `NaN === NaN`), non-primitives
 * via `JSON.stringify`. A thrown error and an "empty" value share the same
 * `ABSENT` bucket; a non-empty throw is a distinct bucket from any returned
 * value.
 */
export async function stabilityProbe(
  vectorId: string,
  read: () => Promise<unknown>,
  opts?: StabilityProbeOptions
): Promise<StabilityResult> {
  const delayMs = opts?.delayMs ?? DEFAULT_DELAY_MS;
  const maxReads = Math.max(INITIAL_READS, opts?.maxReads ?? DEFAULT_MAX_READS);

  const reads: ProbeResult[] = [];
  let firstError: string | undefined;

  // Initial burst of 3 reads.
  for (let i = 0; i < INITIAL_READS; i++) {
    if (i > 0 && delayMs > 0) await sleep(delayMs);
    const r = await runOne(vectorId, read);
    if (r.error !== undefined && firstError === undefined) firstError = r.error;
    reads.push(r);
  }

  let verdict = classify(reads, reads.length >= maxReads);

  // Retry loop: only MIXED (ambiguous) verdicts go here. Unanimous STABLE,
  // unanimous ABSENT, and three-way-different JITTERED all return immediately.
  while (verdict === 'MIXED' && reads.length < maxReads) {
    if (delayMs > 0) await sleep(delayMs);
    const r = await runOne(vectorId, read);
    if (r.error !== undefined && firstError === undefined) firstError = r.error;
    reads.push(r);
    verdict = classify(reads, reads.length >= maxReads);
  }

  // `classify` already returns JITTERED when it's the final read and no
  // majority formed, so we can assume verdict is a real Stability here.
  const stability: Stability = verdict === 'MIXED' ? 'JITTERED' : verdict;

  return { stability, reads, ...(firstError !== undefined ? { firstError } : {}) };
}

/* ------------------------------------------------------------------ */
/* Internal helpers                                                   */
/* ------------------------------------------------------------------ */

type Verdict = Stability | 'MIXED';

/**
 * Classify a read set.
 *
 * - Unanimous non-empty → STABLE
 * - Unanimous empty/throw → ABSENT
 * - 3 reads that all differ from each other (≥3 distinct buckets including the
 *   "absent" bucket) → JITTERED; retrying cannot convert this into STABLE.
 * - Anything else (mixed with repeats, e.g. `[a, a, b]`) → MIXED, asking the
 *   caller to retry. On the final retry, MIXED → JITTERED unless a >half
 *   majority formed.
 */
function classify(reads: readonly ProbeResult[], isFinal: boolean): Verdict {
  if (reads.length === 0) return 'MIXED';

  // Bucket every read by a stable key. "__absent__" collects empties & throws.
  const buckets = new Map<string, number>();
  for (const r of reads) {
    const key = isAbsent(r) ? '__absent__' : serializeValue(r.value);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  // Unanimous outcome.
  if (buckets.size === 1) {
    return buckets.has('__absent__') ? 'ABSENT' : 'STABLE';
  }

  // Initial burst only: three-way-different reads are irredeemable — every
  // bucket is a minority. Call it now.
  if (reads.length === INITIAL_READS && buckets.size === INITIAL_READS) {
    return 'JITTERED';
  }

  // Mixed initial burst → always exhaust the retry budget first. This keeps
  // the sample size consistent for classifying flaky vectors (design doc §5.4:
  // "retry up to 5 total reads; take majority → classification").
  if (!isFinal) return 'MIXED';

  // Final read reached: classify from the full sample. ">half" is strict, so a
  // 5-read set needs 3-of-a-kind to earn STABLE/ABSENT.
  const topCount = Math.max(...buckets.values());
  if (topCount > reads.length / 2) {
    for (const [key, count] of buckets) {
      if (count === topCount) {
        return key === '__absent__' ? 'ABSENT' : 'STABLE';
      }
    }
  }
  return 'JITTERED';
}

function isAbsent(r: ProbeResult): boolean {
  if (r.error !== undefined) return true;
  const v = r.value;
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.length === 0) return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

/**
 * Stable serialisation used for value equality. Primitives keep their literal
 * form so `Object.is(1, 1)` equivalence holds; non-primitives go through
 * `JSON.stringify`.
 */
function serializeValue(v: unknown): string {
  if (v === null) return '__null__';
  if (typeof v === 'undefined') return '__undef__';
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
    // Fallback for circular refs etc. — treat as unique per call.
    return `opaque:${Math.random()}`;
  }
}

async function runOne(vectorId: string, read: () => Promise<unknown>): Promise<ProbeResult> {
  const start = now();
  try {
    const value = await read();
    return {
      vectorId,
      value,
      durationMs: Math.max(0, now() - start),
    };
  } catch (err) {
    return {
      vectorId,
      value: undefined,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
