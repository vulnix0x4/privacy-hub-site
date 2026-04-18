import { describe, it, expect } from 'vitest';
import { probe } from './webglFingerprinting';

describe('webglFingerprinting probe', () => {
  it('resolves with an object containing the expected keys', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('webgl-fingerprinting');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    if (result.error !== undefined) {
      expect(typeof result.error).toBe('string');
      return;
    }
    const value = result.value as Record<string, unknown>;
    // happy-dom usually reports WebGL as unsupported. Either shape is fine.
    if ('status' in value) {
      expect(value.status).toBe('unsupported');
    } else {
      for (const key of [
        'vendor',
        'renderer',
        'unmaskedVendor',
        'unmaskedRenderer',
        'version',
      ]) {
        expect(key in value).toBe(true);
      }
    }
  });
});
