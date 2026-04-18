import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { probe } from './dnsLeaks';

// Helper: shape fetch responses per URL so the probe sees the right mock.
interface Handlers {
  nonce?: () => Response | Promise<Response>;
  dnsTrigger?: () => Response | Promise<Response>;
  leakCheck?: () => Response | Promise<Response>;
}

function mockFetch(handlers: Handlers): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/scan/nonce') && !url.includes('dns-leak-check')) {
      if (!handlers.nonce) throw new Error('unexpected nonce fetch');
      return handlers.nonce();
    }
    if (url.includes('/api/scan/dns-leak-check')) {
      if (!handlers.leakCheck) throw new Error('unexpected leak-check fetch');
      return handlers.leakCheck();
    }
    if (/\/echo$/.test(url) || url.includes('.scan.')) {
      if (handlers.dnsTrigger) return handlers.dnsTrigger();
      // Default: throw (the probe expects this to fail).
      throw new Error('dns trigger aborted');
    }
    throw new Error(`unhandled fetch: ${url}`);
  });
}

beforeEach(() => {
  // The probe sleeps 3s between trigger and leak-check. Fake timers so tests
  // don't actually wait.
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('dnsLeaks probe', () => {
  it('falls back to pending when nonce endpoint is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        nonce: () => new Response('boom', { status: 503 }),
      })
    );
    const pending = probe();
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pending;
    expect(result.vectorId).toBe('dns-leaks');
    const value = result.value as { status: string; reason: string };
    expect(value.status).toBe('pending');
    expect(value.reason).toMatch(/nonce endpoint/);
  });

  it('returns isLeaking=true when resolverIp differs from clientIp', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        nonce: () =>
          new Response(
            JSON.stringify({ nonce: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', expiresAt: Date.now() + 60_000 }),
            { status: 200 }
          ),
        leakCheck: () =>
          new Response(
            JSON.stringify({
              resolverIp: '8.8.8.8',
              clientIp: '203.0.113.5',
              isLeaking: true,
              status: 'ok',
            }),
            { status: 200 }
          ),
      })
    );
    const pending = probe();
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pending;
    expect(result.vectorId).toBe('dns-leaks');
    const value = result.value as { resolverIp: string; clientIp: string; isLeaking: boolean };
    expect(value.resolverIp).toBe('8.8.8.8');
    expect(value.clientIp).toBe('203.0.113.5');
    expect(value.isLeaking).toBe(true);
  });

  it('returns isLeaking=false when resolverIp matches clientIp', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        nonce: () =>
          new Response(
            JSON.stringify({ nonce: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', expiresAt: Date.now() + 60_000 }),
            { status: 200 }
          ),
        leakCheck: () =>
          new Response(
            JSON.stringify({
              resolverIp: '203.0.113.5',
              clientIp: '203.0.113.5',
              isLeaking: false,
              status: 'ok',
            }),
            { status: 200 }
          ),
      })
    );
    const pending = probe();
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pending;
    const value = result.value as { resolverIp: string; clientIp: string; isLeaking: boolean };
    expect(value.isLeaking).toBe(false);
    expect(value.resolverIp).toBe(value.clientIp);
  });

  it('falls back to pending when the leak-check says status=pending (no resolver hit)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        nonce: () =>
          new Response(
            JSON.stringify({ nonce: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', expiresAt: Date.now() + 60_000 }),
            { status: 200 }
          ),
        leakCheck: () =>
          new Response(
            JSON.stringify({
              resolverIp: null,
              clientIp: '203.0.113.5',
              isLeaking: false,
              status: 'pending',
            }),
            { status: 200 }
          ),
      })
    );
    const pending = probe();
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pending;
    const value = result.value as { status: string; reason: string };
    expect(value.status).toBe('pending');
    expect(value.reason).toMatch(/resolver observation/);
  });

  it('falls back to pending when the nonce has already expired', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        nonce: () =>
          new Response(
            JSON.stringify({ nonce: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', expiresAt: Date.now() + 60_000 }),
            { status: 200 }
          ),
        leakCheck: () =>
          new Response(
            JSON.stringify({
              resolverIp: null,
              clientIp: '203.0.113.5',
              isLeaking: false,
              status: 'expired',
            }),
            { status: 200 }
          ),
      })
    );
    const pending = probe();
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pending;
    const value = result.value as { status: string; reason: string };
    expect(value.status).toBe('pending');
    expect(value.reason).toMatch(/expired/);
  });

  it('falls back to pending when the leak-check endpoint throws', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        nonce: () =>
          new Response(
            JSON.stringify({ nonce: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', expiresAt: Date.now() + 60_000 }),
            { status: 200 }
          ),
        leakCheck: () => new Response('err', { status: 500 }),
      })
    );
    const pending = probe();
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pending;
    const value = result.value as { status: string; reason: string };
    expect(value.status).toBe('pending');
    expect(value.reason).toMatch(/leak-check/);
  });
});
