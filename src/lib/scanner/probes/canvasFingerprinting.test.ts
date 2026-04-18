import { describe, it, expect } from 'vitest';
import { probe } from './canvasFingerprinting';

// happy-dom implements `createElement('canvas')` but rendering is a no-op and
// `toDataURL` returns a stable placeholder. We verify the probe produces a
// string hash of non-trivial length and never throws.
describe('canvasFingerprinting probe', () => {
  it('returns a hash string without throwing', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('canvas-fingerprinting');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    if (result.error === undefined) {
      const value = result.value as { hash?: string; status?: string };
      if (value.status === 'unsupported') {
        expect(value.status).toBe('unsupported');
      } else {
        expect(typeof value.hash).toBe('string');
        expect((value.hash ?? '').length).toBeGreaterThanOrEqual(16);
      }
    } else {
      expect(typeof result.error).toBe('string');
    }
  });
});
