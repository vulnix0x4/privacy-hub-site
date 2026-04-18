import { describe, it, expect } from 'vitest';
import { probe } from './screenViewport';

const EXPECTED_KEYS = [
  'screenWidth',
  'screenHeight',
  'availWidth',
  'availHeight',
  'colorDepth',
  'pixelDepth',
  'innerWidth',
  'innerHeight',
  'devicePixelRatio',
];

describe('screenViewport probe', () => {
  it('returns all nine screen + viewport scalars', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('screen-viewport');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    const value = result.value as Record<string, unknown>;
    for (const key of EXPECTED_KEYS) {
      expect(key in value).toBe(true);
    }
  });
});
