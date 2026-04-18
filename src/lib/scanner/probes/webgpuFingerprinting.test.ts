import { describe, it, expect } from 'vitest';
import { probe } from './webgpuFingerprinting';

// happy-dom has no WebGPU. The probe should return { status: 'unsupported' }.
describe('webgpuFingerprinting probe', () => {
  it('returns unsupported sentinel or a valid info object without throwing', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('webgpu-fingerprinting');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    if (result.error !== undefined) {
      expect(typeof result.error).toBe('string');
      return;
    }
    const value = result.value as Record<string, unknown>;
    const hasKeys =
      'vendor' in value &&
      'architecture' in value &&
      'device' in value &&
      'description' in value;
    const isSentinel = value.status === 'unsupported' || value.status === 'unavailable';
    expect(hasKeys || isSentinel).toBe(true);
  });
});
