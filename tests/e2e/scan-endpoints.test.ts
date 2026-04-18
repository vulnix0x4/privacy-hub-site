/**
 * @vitest-environment node
 *
 * Gate 4 — scanner endpoint smoke test.
 *
 * Boots the built Astro Node server on a random port and exercises the
 * two on-demand routes that back the live scanner:
 *
 *   POST /api/scan/nonce    -> { nonce: uuid36, expiresAt: number > now }
 *   GET  /api/scan/headers  -> { ip: string, headers: { accept: "..." } }
 *
 * Requires `npm run build` to have produced `dist/server/entry.mjs`.
 * Skips the whole suite if that file is missing so a fresh clone still
 * passes vitest.
 *
 * Runs in Node env (not happy-dom) so `fetch` isn't subject to same-origin
 * policy — we're deliberately a test harness probing an HTTP endpoint.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SERVER_ENTRY = resolve(process.cwd(), 'dist', 'server', 'entry.mjs');
const serverExists = existsSync(SERVER_ENTRY);

// UUID v4-ish matcher: 8-4-4-4-12 hex, total 36 chars (with dashes).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Probe for a free TCP port by binding to 0 and reading the assigned one. */
async function getFreePort(): Promise<number> {
  return new Promise((resolveFn, rejectFn) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', rejectFn);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolveFn(port));
      } else {
        rejectFn(new Error('could not determine port'));
      }
    });
  });
}

/** Poll `http://127.0.0.1:<port>/` until it responds or `timeoutMs` elapses. */
async function waitForServer(port: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(500),
      });
      // Any response (even a redirect) means the server is up.
      if (res.status < 600) return;
    } catch {
      // not yet — keep trying
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Astro server on port ${port} did not become ready in ${timeoutMs}ms`);
}

describe.skipIf(!serverExists)('Gate 4 — /api/scan/{nonce,headers} smoke', () => {
  let child: ChildProcessWithoutNullStreams | null = null;
  let port = 0;

  beforeAll(async () => {
    port = await getFreePort();
    child = spawn(process.execPath, [SERVER_ENTRY], {
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Surface errors to the test output without crashing the harness.
    child.stderr.on('data', (buf) => {
      const msg = buf.toString();
      if (!/ExperimentalWarning/.test(msg)) {
        process.stderr.write(`[astro-server] ${msg}`);
      }
    });
    await waitForServer(port);
  }, 20_000);

  afterAll(() => {
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
  });

  // Astro's built-in origin-check middleware rejects cross-site POSTs without
  // a matching Origin header. Every POST in this suite sets Origin to the
  // server's own URL, mirroring what the real scanner UI does from the browser.
  function postNonce(): Promise<Response> {
    const origin = `http://127.0.0.1:${port}`;
    return fetch(`${origin}/api/scan/nonce`, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
      },
    });
  }

  it('POST /api/scan/nonce returns a fresh UUID with future expiry', async () => {
    const before = Date.now();
    const res = await postNonce();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('application/json');
    const body = (await res.json()) as { nonce: string; expiresAt: number };
    expect(typeof body.nonce).toBe('string');
    expect(body.nonce).toHaveLength(36);
    expect(body.nonce).toMatch(UUID_RE);
    expect(typeof body.expiresAt).toBe('number');
    expect(body.expiresAt).toBeGreaterThan(before);
  });

  it('/api/scan/nonce issues a distinct nonce each call', async () => {
    const a = (await (await postNonce()).json()) as { nonce: string };
    const b = (await (await postNonce()).json()) as { nonce: string };
    expect(a.nonce).not.toBe(b.nonce);
  });

  it('GET /api/scan/headers echoes the accept header and returns an ip field', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/scan/headers`, {
      headers: { accept: 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('application/json');
    const body = (await res.json()) as { ip: string; headers: Record<string, string> };
    expect(typeof body.ip).toBe('string');
    // `ip` is non-empty when there's an observable client IP. We hit the server
    // via 127.0.0.1 with no x-forwarded-for, so we should see the loopback
    // address rather than an empty string.
    expect(body.ip.length).toBeGreaterThan(0);
    expect(body.headers).toBeTypeOf('object');
    expect(body.headers.accept).toBeDefined();
    expect(body.headers.accept).toContain('application/json');
  });

  it('/api/scan/nonce sets Cache-Control: no-store', async () => {
    const res = await postNonce();
    expect(res.headers.get('cache-control') ?? '').toMatch(/no-store/);
  });
});
