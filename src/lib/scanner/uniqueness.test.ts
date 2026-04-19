import { describe, it, expect } from 'vitest';
import {
  UNIQUENESS_BY_VECTOR,
  assertUniquenessCoverage,
  bitsToOneInN,
  formatOneInN,
  getUniqueness,
} from './uniqueness';
import { VECTOR_CATALOG } from './registry';

describe('uniqueness coverage', () => {
  it('has a row for every registry id', () => {
    expect(() => assertUniquenessCoverage()).not.toThrow();
  });

  it('covers all 22 catalog vectors exactly once', () => {
    const ids = new Set(VECTOR_CATALOG.map((v) => v.id));
    const rowIds = new Set(Object.keys(UNIQUENESS_BY_VECTOR));
    for (const id of ids) expect(rowIds.has(id), `missing ${id}`).toBe(true);
  });
});

describe('uniqueness entries', () => {
  it('context vectors have bits=0 and no one-in-N claim', () => {
    for (const row of Object.values(UNIQUENESS_BY_VECTOR)) {
      if (row.mode === 'context') expect(row.bits).toBe(0);
    }
  });

  it('entropy vectors have positive bits', () => {
    for (const row of Object.values(UNIQUENESS_BY_VECTOR)) {
      if (row.mode === 'entropy') expect(row.bits).toBeGreaterThan(0);
    }
  });

  it('every row has a non-empty mitigation and source', () => {
    for (const row of Object.values(UNIQUENESS_BY_VECTOR)) {
      expect(row.mitigation.length, `mitigation for ${row.vectorId}`).toBeGreaterThan(0);
      expect(row.source.length, `source for ${row.vectorId}`).toBeGreaterThan(0);
    }
  });

  it('bucket is common|moderate|rare', () => {
    for (const row of Object.values(UNIQUENESS_BY_VECTOR)) {
      expect(['common', 'moderate', 'rare']).toContain(row.bucket);
    }
  });
});

describe('bitsToOneInN', () => {
  it('returns 1 for zero or negative bits', () => {
    expect(bitsToOneInN(0)).toBe(1);
    expect(bitsToOneInN(-5)).toBe(1);
  });

  it('returns 2**bits rounded', () => {
    expect(bitsToOneInN(10)).toBe(1024);
    expect(bitsToOneInN(11)).toBe(2048);
    expect(bitsToOneInN(14)).toBe(16384);
  });

  it('caps at 1_000_000 so we never over-claim', () => {
    expect(bitsToOneInN(100)).toBe(1_000_000);
  });
});

describe('formatOneInN', () => {
  it('formats with locale separators', () => {
    expect(formatOneInN(11)).toBe('≈1 in 2,048');
  });

  it('collapses very-low entropy to 1 in 2', () => {
    expect(formatOneInN(1)).toBe('≈1 in 2');
  });
});

describe('getUniqueness', () => {
  it('returns undefined for an unknown vector id', () => {
    expect(getUniqueness('does-not-exist')).toBeUndefined();
  });

  it('returns a row for a known vector id', () => {
    const row = getUniqueness('canvas-fingerprinting');
    expect(row?.mode).toBe('entropy');
    expect(row?.bits).toBeGreaterThan(0);
  });
});
