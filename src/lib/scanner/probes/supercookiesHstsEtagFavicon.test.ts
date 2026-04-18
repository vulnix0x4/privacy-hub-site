import { describe, it, expect } from 'vitest';
import { probe } from './supercookiesHstsEtagFavicon';

describe('supercookiesHstsEtagFavicon probe (v1 stub)', () => {
  it('resolves with a pending sentinel and no error', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('supercookies-hsts-etag-favicon');
    expect(result.error).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    const value = result.value as { status: string; reason: string };
    expect(value.status).toBe('pending');
    expect(typeof value.reason).toBe('string');
  });
});
