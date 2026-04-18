import { describe, it, expect, vi, afterEach } from 'vitest';
import { probe } from './tlsJa4';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tlsJa4 probe', () => {
  it('returns parsed {ja4, ja4Full, timestamp} on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ja4: 't13d1516h2_8daaf6152771_b0da82dd1658',
            ja4Full: 't13d1516h2_1301,1302_0005,000a',
            timestamp: 1_700_000_000_000,
          }),
          { status: 200 }
        )
      )
    );
    const result = await probe();
    expect(result.vectorId).toBe('tls-ja4');
    expect(result.error).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    const value = result.value as { ja4: string; ja4Full: string; timestamp: number };
    expect(value.ja4).toBe('t13d1516h2_8daaf6152771_b0da82dd1658');
    expect(value.ja4Full).toBe('t13d1516h2_1301,1302_0005,000a');
    expect(value.timestamp).toBe(1_700_000_000_000);
  });

  it('falls back to pending when the backend returns non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('down', { status: 502 }))
    );
    const result = await probe();
    expect(result.vectorId).toBe('tls-ja4');
    const value = result.value as { status: string; reason: string };
    expect(value.status).toBe('pending');
    expect(value.reason).toMatch(/502/);
  });

  it('falls back to pending when the fetch rejects (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('NetworkError')));
    const result = await probe();
    expect(result.vectorId).toBe('tls-ja4');
    const value = result.value as { status: string; reason: string };
    expect(value.status).toBe('pending');
    expect(value.reason).toMatch(/unreachable/);
    expect(value.reason).toMatch(/NetworkError/);
  });

  it('falls back to pending when the backend returns an empty ja4 field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ja4: '', ja4Full: '', timestamp: 1 }), {
          status: 200,
        })
      )
    );
    const result = await probe();
    const value = result.value as { status: string; reason: string };
    expect(value.status).toBe('pending');
    expect(value.reason).toMatch(/empty/);
  });

  it('tolerates malformed JSON (catches parse error as pending)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not-json', { status: 200 }))
    );
    const result = await probe();
    const value = result.value as { status: string; reason: string };
    expect(value.status).toBe('pending');
  });
});
