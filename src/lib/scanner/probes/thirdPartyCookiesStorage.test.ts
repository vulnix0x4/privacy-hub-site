import { describe, it, expect } from 'vitest';
import { probe } from './thirdPartyCookiesStorage';

const EXPECTED_KEYS = [
  'cookieEnabled',
  'ourSetCookieReadback',
  'localStorage',
  'sessionStorage',
  'indexedDB',
];

describe('thirdPartyCookiesStorage probe', () => {
  it('returns all five storage flags without throwing', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('third-party-cookies-storage');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    const value = result.value as Record<string, unknown>;
    for (const key of EXPECTED_KEYS) {
      expect(key in value).toBe(true);
    }
  });
});
