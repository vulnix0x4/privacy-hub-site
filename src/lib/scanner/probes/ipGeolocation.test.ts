import { describe, it, expect, vi, afterEach } from 'vitest';
import { probe } from './ipGeolocation';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ipGeolocation probe', () => {
  it('returns parsed payload on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ ip: '203.0.113.5', headers: { 'user-agent': 'test' } }),
          { status: 200 }
        )
      )
    );
    const result = await probe();
    expect(result.vectorId).toBe('ip-geolocation');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    const value = result.value as { ip: string; headers: Record<string, string> };
    expect(value.ip).toBe('203.0.113.5');
    expect(value.headers['user-agent']).toBe('test');
  });

  it('surfaces HTTP errors as result.error without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('down', { status: 503 }))
    );
    const result = await probe();
    expect(result.vectorId).toBe('ip-geolocation');
    expect(result.value).toBeNull();
    expect(result.error).toBe('HTTP 503');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('catches thrown network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await probe();
    expect(result.vectorId).toBe('ip-geolocation');
    expect(result.value).toBeNull();
    expect(result.error).toBe('offline');
  });
});
