/**
 * POST /api/scan/nonce
 *
 * Mints a short-lived nonce for the live-scanner flow. The client sends the
 * nonce out in subsequent probes (DNS resolver-leak, JA4 fetch) so the server
 * can correlate the request back to the originating scan without cookies.
 *
 * Response: { nonce: string, expiresAt: number }
 *
 * Privacy discipline:
 *   - Never logs the nonce or anything about the request (no console.log).
 *   - Cache-Control: no-store — nonces are unique per scan.
 *   - Rate limiting lives at the upstream Caddy (design doc §8); not here.
 *
 * The server route is on-demand (`prerender = false`) and shares a single
 * `NonceStore` singleton across requests — node:sqlite is synchronous and
 * requests serialize on the event loop, so no locking is needed.
 */
import type { APIRoute } from 'astro';
import { openNonceStore, type NonceStore } from '../../../lib/scanner/nonceStore';

export const prerender = false;

/** Module-level singleton; opened lazily on the first request. */
let store: NonceStore | null = null;

function getStore(): NonceStore {
  if (store === null) {
    store = openNonceStore();
  }
  return store;
}

function issueResponse(): Response {
  const { nonce, expiresAt } = getStore().issue();
  return new Response(JSON.stringify({ nonce, expiresAt }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export const POST: APIRoute = () => issueResponse();

// GET accepted as a dev-convenience (e.g. `curl /api/scan/nonce`).
// Same response shape; identical privacy discipline.
export const GET: APIRoute = () => issueResponse();
