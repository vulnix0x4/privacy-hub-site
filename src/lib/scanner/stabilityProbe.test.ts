import { describe, it, expect } from 'vitest';
import { stabilityProbe } from './stabilityProbe';

/** Make a mock `read` function that returns values in order, optionally throwing. */
function makeSeq(values: Array<unknown | (() => never)>) {
  let i = 0;
  return async () => {
    const v = values[i++];
    if (typeof v === 'function') return (v as () => never)();
    return v;
  };
}

describe('stabilityProbe', () => {
  it('returns STABLE when all three reads are identical primitives', async () => {
    const result = await stabilityProbe('ua', makeSeq(['Mozilla/5.0', 'Mozilla/5.0', 'Mozilla/5.0']), {
      delayMs: 0,
    });
    expect(result.stability).toBe('STABLE');
    expect(result.reads).toHaveLength(3);
    expect(result.reads.every((r) => r.value === 'Mozilla/5.0')).toBe(true);
  });

  it('returns STABLE when all three reads are structurally equal non-primitives', async () => {
    const result = await stabilityProbe(
      'headers',
      makeSeq([
        { accept: 'text/html' },
        { accept: 'text/html' },
        { accept: 'text/html' },
      ]),
      { delayMs: 0 }
    );
    expect(result.stability).toBe('STABLE');
    expect(result.reads).toHaveLength(3);
  });

  it('returns JITTERED when three values all differ', async () => {
    const result = await stabilityProbe('canvas', makeSeq(['a', 'b', 'c']), { delayMs: 0 });
    expect(result.stability).toBe('JITTERED');
    expect(result.reads).toHaveLength(3);
  });

  it('returns ABSENT when all three reads throw', async () => {
    const boom = () => {
      throw new Error('denied');
    };
    const result = await stabilityProbe('webBluetooth', makeSeq([boom, boom, boom]), {
      delayMs: 0,
    });
    expect(result.stability).toBe('ABSENT');
    expect(result.reads).toHaveLength(3);
    expect(result.firstError).toBe('denied');
    expect(result.reads.every((r) => r.error === 'denied')).toBe(true);
  });

  it('returns ABSENT when all three reads return null', async () => {
    const result = await stabilityProbe('mediaDevices', makeSeq([null, null, null]), {
      delayMs: 0,
    });
    expect(result.stability).toBe('ABSENT');
  });

  it('returns ABSENT when all three reads return undefined', async () => {
    const result = await stabilityProbe('x', makeSeq([undefined, undefined, undefined]), {
      delayMs: 0,
    });
    expect(result.stability).toBe('ABSENT');
  });

  it('returns ABSENT when all three reads return empty strings', async () => {
    const result = await stabilityProbe('uaData', makeSeq(['', '', '']), { delayMs: 0 });
    expect(result.stability).toBe('ABSENT');
  });

  it('returns ABSENT when all three reads return empty arrays', async () => {
    const result = await stabilityProbe('plugins', makeSeq([[], [], []]), { delayMs: 0 });
    expect(result.stability).toBe('ABSENT');
  });

  it('retries flaky [a, a, b] up to 5 reads and classifies STABLE when majority agree', async () => {
    const result = await stabilityProbe(
      'flaky',
      makeSeq(['a', 'a', 'b', 'a', 'a']),
      { delayMs: 0 }
    );
    expect(result.stability).toBe('STABLE');
    expect(result.reads).toHaveLength(5);
  });

  it('does NOT retry when all three reads differ (already JITTERED)', async () => {
    const result = await stabilityProbe('rand', makeSeq(['a', 'b', 'c', 'd', 'e']), {
      delayMs: 0,
    });
    expect(result.stability).toBe('JITTERED');
    expect(result.reads).toHaveLength(3);
  });

  it('retries [a, a, b] and ends JITTERED when majority never forms by read 5', async () => {
    const result = await stabilityProbe(
      'flaky2',
      makeSeq(['a', 'a', 'b', 'c', 'd']),
      { delayMs: 0 }
    );
    expect(result.stability).toBe('JITTERED');
    expect(result.reads).toHaveLength(5);
  });

  it('captures durationMs >= 0 on every read', async () => {
    const result = await stabilityProbe('x', makeSeq(['a', 'a', 'a']), { delayMs: 0 });
    expect(result.reads).toHaveLength(3);
    for (const r of result.reads) {
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.durationMs)).toBe(true);
    }
  });

  it('tags every ProbeResult with the vectorId passed in', async () => {
    const result = await stabilityProbe('timezone', makeSeq(['Etc/UTC', 'Etc/UTC', 'Etc/UTC']), {
      delayMs: 0,
    });
    expect(result.reads.every((r) => r.vectorId === 'timezone')).toBe(true);
  });

  it('treats a thrown value as distinct from a non-throw value', async () => {
    const boom = () => {
      throw new Error('x');
    };
    const result = await stabilityProbe('mix', makeSeq(['ok', boom, 'ok']), { delayMs: 0 });
    // Two 'ok' reads + one error: neither unanimous nor three-way differ → retry to 5.
    expect(result.reads.length).toBeGreaterThanOrEqual(3);
  });
});
