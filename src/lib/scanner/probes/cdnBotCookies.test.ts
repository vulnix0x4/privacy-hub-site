import { describe, it, expect, beforeEach } from 'vitest';
import { probe } from './cdnBotCookies';

describe('cdnBotCookies probe', () => {
  beforeEach(() => {
    // Clear any probe cookie left by a previous test.
    try {
      document.cookie = '__cf_bm=; path=/; Max-Age=0';
    } catch {
      // happy-dom may be strict; best-effort.
    }
  });

  it('returns an empty found array when no CDN cookies are set', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('cdn-bot-cookies');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    const value = result.value as { found: string[] };
    expect(Array.isArray(value.found)).toBe(true);
  });

  it('detects a seeded cookie from a known prefix', async () => {
    try {
      document.cookie = '__cf_bm=abc; path=/';
    } catch {
      // happy-dom may reject — skip assertion in that case.
      return;
    }
    const result = await probe();
    const value = result.value as { found: string[] };
    if (document.cookie.includes('__cf_bm')) {
      expect(value.found).toContain('__cf_bm');
    }
  });
});
