import { describe, it, expect } from 'vitest';
import { probe } from './extensionDetection';

// happy-dom doesn't resolve chrome-extension:// URLs; all fetches reject.
// The probe should surface { probed: [...], detected: [] } without throwing.
describe('extensionDetection probe', () => {
  it('resolves with probed + detected arrays without throwing', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('extension-detection');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    const value = result.value as { probed: string[]; detected: string[] };
    expect(Array.isArray(value.probed)).toBe(true);
    expect(Array.isArray(value.detected)).toBe(true);
    // All detected IDs must have been probed.
    for (const id of value.detected) {
      expect(value.probed).toContain(id);
    }
  });
});
