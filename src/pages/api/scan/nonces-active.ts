/**
 * GET /api/scan/nonces-active
 *
 * Internal endpoint: only the scanner-nonce sidecar polls this, once per
 * 2 seconds, inside the Docker bridge network. It returns the set of
 * currently-active nonces so the sidecar can regenerate the NSD zone file.
 *
 * Why an HTTP endpoint instead of direct SQLite access from the sidecar?
 * Cleanest boundary: the sidecar stays dep-free (no Go SQLite driver), the
 * only shared surface is JSON. Privacy discipline is unchanged — the web
 * server logs nothing, the sidecar logs nothing, and the response contains
 * no resolver IPs or client data.
 *
 * Response shape:
 *   { nonces: string[] }
 *
 * Cap: max 1000 nonces per response. Each UUIDv4 is 36 bytes → worst case
 * ~36 KB payload, well under any reasonable limit.
 *
 * This route is NOT meant to be exposed publicly — the upstream Caddy should
 * not reverse-proxy /api/scan/nonces-active. The scanner-nonce container
 * reaches it via the compose bridge network as `http://web:4321/...`.
 */
import type { APIRoute } from 'astro';
import { openNonceStore, type NonceStore } from '../../../lib/scanner/nonceStore';

export const prerender = false;

let store: NonceStore | null = null;
function getStore(): NonceStore {
  if (store === null) {
    store = openNonceStore();
  }
  return store;
}

export const GET: APIRoute = () => {
  const nonces = getStore().listActive();
  return new Response(JSON.stringify({ nonces }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
