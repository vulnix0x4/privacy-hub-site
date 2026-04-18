import { describe, it, expect } from 'vitest';
import { probe } from './audioFingerprinting';

describe('audioFingerprinting probe', () => {
  it('resolves with a hash or an unsupported sentinel without throwing', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('audio-fingerprinting');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    if (result.error !== undefined) {
      expect(typeof result.error).toBe('string');
      return;
    }
    const value = result.value as { hash?: string; status?: string };
    if (value.status === 'unsupported') {
      expect(value.status).toBe('unsupported');
    } else {
      expect(typeof value.hash).toBe('string');
    }
  });
});
