import { describe, it, expect } from 'vitest';
import { probe } from './permissionsBitmap';

describe('permissionsBitmap probe', () => {
  it('returns a shape record covering all 23 permission names', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('permissions-bitmap');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    const value = result.value as { shape: Record<string, string> };
    expect(value.shape).toBeDefined();
    // Exactly 23 names as the spec dictates.
    expect(Object.keys(value.shape).length).toBe(23);
    for (const state of Object.values(value.shape)) {
      expect(['granted', 'denied', 'prompt', 'unsupported']).toContain(state);
    }
  });
});
