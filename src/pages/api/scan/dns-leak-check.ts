/**
 * GET /api/scan/dns-leak-check?nonce=<uuid>
 *
 * Called by the dnsLeaks probe after it has fired a DNS lookup for
 * `${nonce}.scan.privacy.whattheflip.lol`. The lookup path is:
 *
 *   browser → client's configured resolver → (maybe upstream resolvers) →
 *     our authoritative NSD → zone TXT record for <nonce>.scan.*
 *
 * NSD hands the resolver-IP observation to the nonceStore via the sidecar
 * (design doc §12.5). This endpoint looks up the nonce in the store and
 * returns the resolver IP we observed for it, alongside the observed client
 * IP for the current HTTP request.
 *
 * IMPORTANT — Phase 3 limitation: resolver-IP observation requires dnstap
 * or equivalent query-stream output from NSD, which we have NOT wired yet
 * because design §13.1 #5 chose NSD specifically for its lack of a query
 * log. Until dnstap (or a comparable non-persistent observation mechanism)
 * is wired in scanner/nsd/, `resolverIp` will always be null and this
 * endpoint will return `{ status: 'pending' }`. The dnsLeaks probe's
 * pending-fallback path renders that state correctly; no user-visible
 * breakage, just no leak verdict until the observer ships.
 * See docs/plans/ and scanner/nsd/nsd.conf for the design note. The probe compares the two: if the
 * resolver IP differs from the client's egress IP, that's a DNS leak
 * (or, more charitably, a non-colocated recursive resolver).
 *
 * Response shape:
 *   {
 *     resolverIp: string | null,   // what NSD saw; null if nonce expired
 *                                  // or no lookup has arrived yet
 *     clientIp: string,            // what Caddy's XFF told us about the HTTP caller
 *     isLeaking: boolean,          // true iff resolverIp present and !== clientIp
 *     status: 'ok' | 'pending' | 'expired'
 *   }
 *
 * "pending" means the nonce is still valid but we haven't observed a
 * resolver hit yet — the probe should poll a few more times before giving up.
 *
 * Privacy discipline:
 *   - Cache-Control: no-store.
 *   - No logging of the nonce, resolver IP, or client IP.
 *   - The resolver-IP → nonce association evaporates when the nonce TTL
 *     expires (60s by default); the SQLite store is on tmpfs so the whole
 *     association set dies with the container.
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

/** Same XFF-first resolution pattern as /api/scan/headers. */
function resolveClientIp(
  request: Request,
  fallback: () => string | undefined
): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  try {
    return fallback() ?? '';
  } catch {
    return '';
  }
}

export const GET: APIRoute = (context) => {
  const nonce = new URL(context.request.url).searchParams.get('nonce') ?? '';
  const clientIp = resolveClientIp(context.request, () => context.clientAddress);

  // Validate nonce shape before touching the store. Same rule as the Go
  // sidecar: [a-zA-Z0-9-], length 8..64.
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(nonce)) {
    return json(400, { error: 'invalid_nonce' });
  }

  const row = getStore().readOne(nonce);
  if (row === null) {
    return json(200, {
      resolverIp: null,
      clientIp,
      isLeaking: false,
      status: 'expired' as const,
    });
  }
  if (row.resolverIp === null) {
    return json(200, {
      resolverIp: null,
      clientIp,
      isLeaking: false,
      status: 'pending' as const,
    });
  }
  const resolverIp = row.resolverIp;
  const isLeaking = resolverIp !== clientIp;
  return json(200, {
    resolverIp,
    clientIp,
    isLeaking,
    status: 'ok' as const,
  });
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
