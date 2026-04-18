import { describe, it, expect } from 'vitest';
import { probe } from './mediaDevices';

describe('mediaDevices probe', () => {
  it('returns a devices array and per-kind counts without throwing', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('media-devices');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    const value = result.value as {
      devices: unknown[];
      counts: { audioinput: number; audiooutput: number; videoinput: number };
    };
    expect(Array.isArray(value.devices)).toBe(true);
    expect(typeof value.counts.audioinput).toBe('number');
    expect(typeof value.counts.audiooutput).toBe('number');
    expect(typeof value.counts.videoinput).toBe('number');
  });
});
