import { describe, it, expect } from 'vitest';
import { probe } from './fontEnumeration';

describe('fontEnumeration probe', () => {
  it('returns an array of installed font names without throwing', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('font-enumeration');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    if (result.error !== undefined) {
      expect(typeof result.error).toBe('string');
      return;
    }
    const value = result.value as { installed: string[] };
    expect(Array.isArray(value.installed)).toBe(true);
    for (const name of value.installed) {
      expect(typeof name).toBe('string');
    }
  });
});
