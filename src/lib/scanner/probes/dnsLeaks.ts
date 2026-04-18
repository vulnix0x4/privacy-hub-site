/**
 * Vector probe: `dns-leaks`
 *
 * Full DNS-leak / DoH check against the Phase-3 NSD backend.
 *
 * Flow:
 *   1. POST /api/scan/nonce → get a fresh `{ nonce, expiresAt }`.
 *   2. Trigger a DNS lookup for `${nonce}.scan.privacy.whattheflip.lol` by
 *      hitting an invented URL on that hostname (`/echo`). We don't care if
 *      the HTTP request completes — we only care that the browser *resolves
 *      the name*, which forces its recursive resolver to query our NSD.
 *   3. Wait ~3 seconds for the resolver query to arrive at NSD and the
 *      sidecar to record the observed resolver IP in the nonce store.
 *   4. GET /api/scan/dns-leak-check?nonce=<nonce> → learn the resolver IP,
 *      the client's HTTP-time IP, and whether they differ.
 *
 * Verdict shape:
 *   - `{ status: 'pending', reason: '...' }` — backend unreachable / nonce
 *     endpoint failed / no resolver hit within the wait window.
 *   - `{ resolverIp, clientIp, isLeaking }` — full verdict.
 *
 * Privacy discipline: no logging, no timing side channels surfaced beyond
 * the probe's normal `durationMs`, no storage of any IP beyond the one
 * round-trip through the server.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'dns-leaks';

const DEFAULT_DOMAIN = 'scan.privacy.whattheflip.lol';
const RESOLVE_WAIT_MS = 3_000;

interface NonceResponse {
  nonce?: unknown;
  expiresAt?: unknown;
}

interface LeakCheckResponse {
  resolverIp?: unknown;
  clientIp?: unknown;
  isLeaking?: unknown;
  status?: unknown;
}

function resolveDomain(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const fromEnv = env?.['PUBLIC_SCAN_DNS_DOMAIN'];
    if (fromEnv && typeof fromEnv === 'string') {
      return fromEnv;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_DOMAIN;
}

async function fetchNonce(): Promise<string | null> {
  try {
    const res = await fetch('/api/scan/nonce', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as NonceResponse;
    if (typeof body.nonce !== 'string' || body.nonce.length < 8) return null;
    return body.nonce;
  } catch {
    return null;
  }
}

async function triggerDNSLookup(nonce: string, domain: string): Promise<void> {
  // We expect this request to fail (no HTTP server responds at that nonce
  // subdomain) — but the *DNS query* going through the client's resolver is
  // the whole point. Abort quickly so we don't hang the probe.
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), 1_500);
  try {
    await fetch(`https://${nonce}.${domain}/echo`, {
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors',
      signal: controller.signal,
    });
  } catch {
    /* expected */
  } finally {
    clearTimeout(abortTimer);
  }
}

async function checkLeak(nonce: string): Promise<LeakCheckResponse | null> {
  try {
    const res = await fetch(
      `/api/scan/dns-leak-check?nonce=${encodeURIComponent(nonce)}`,
      { cache: 'no-store', credentials: 'omit' }
    );
    if (!res.ok) return null;
    return (await res.json()) as LeakCheckResponse;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function probe(): Promise<ProbeResult> {
  const start = now();

  const nonce = await fetchNonce();
  if (!nonce) {
    return {
      vectorId: VECTOR_ID,
      value: { status: 'pending', reason: 'nonce endpoint unreachable' },
      durationMs: Math.max(0, now() - start),
    };
  }

  await triggerDNSLookup(nonce, resolveDomain());

  // Give the resolver time to hit NSD and the sidecar to record.
  await sleep(RESOLVE_WAIT_MS);

  const check = await checkLeak(nonce);
  if (check === null) {
    return {
      vectorId: VECTOR_ID,
      value: { status: 'pending', reason: 'leak-check endpoint unreachable' },
      durationMs: Math.max(0, now() - start),
    };
  }

  const status = typeof check.status === 'string' ? check.status : 'pending';
  const resolverIp = typeof check.resolverIp === 'string' ? check.resolverIp : null;
  const clientIp = typeof check.clientIp === 'string' ? check.clientIp : '';

  if (status === 'expired') {
    return {
      vectorId: VECTOR_ID,
      value: { status: 'pending', reason: 'nonce expired before resolver hit' },
      durationMs: Math.max(0, now() - start),
    };
  }
  if (status === 'pending' || resolverIp === null) {
    return {
      vectorId: VECTOR_ID,
      value: { status: 'pending', reason: 'no resolver observation within window' },
      durationMs: Math.max(0, now() - start),
    };
  }

  const isLeaking = resolverIp !== clientIp;
  return {
    vectorId: VECTOR_ID,
    value: { resolverIp, clientIp, isLeaking },
    durationMs: Math.max(0, now() - start),
  };
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
