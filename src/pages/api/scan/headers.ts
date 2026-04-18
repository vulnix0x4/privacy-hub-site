/**
 * GET /api/scan/headers
 *
 * Echoes the subset of request headers the scanner UI surfaces on the
 * "network" card, plus the observed client IP. The browser already sends these
 * to every site it visits — this route is diagnostic, not surveillance. We
 * return them so the user can see what they broadcast without shipping a
 * third-party analytics call to work it out.
 *
 * Response shape:
 *   { ip: string, headers: Record<string, string> }
 *
 * Only headers actually present on the request are included — no empty strings
 * for missing values.
 *
 * Privacy discipline:
 *   - No logging of the IP, headers, or any request data.
 *   - Cache-Control: no-store — values change per request.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Allow-list of header names to echo back. Every item is a low-risk, UA-emitted
 * header already visible to any server. Keep this list explicit — additions are
 * a deliberate review moment.
 */
const ECHO_HEADERS = [
  'accept',
  'accept-language',
  'accept-encoding',
  'user-agent',
  'dnt',
  'sec-gpc',
  'sec-ch-ua',
  'sec-ch-ua-platform',
  'sec-ch-ua-mobile',
  'sec-fetch-site',
  'sec-fetch-mode',
  'sec-fetch-dest',
  'sec-fetch-user',
  'priority',
  'referer',
] as const;

/**
 * Resolve the client IP: prefer the first token of `x-forwarded-for` (what
 * Caddy/Traefik set when terminating TLS), else fall back to Astro's
 * `clientAddress`. Returns `""` if neither yields a value (which is fine — we
 * just omit nothing; the UI shows whatever we return).
 */
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
    // `clientAddress` throws if called outside a server context — be defensive.
    return '';
  }
}

export const GET: APIRoute = (context) => {
  const echoed: Record<string, string> = {};
  for (const name of ECHO_HEADERS) {
    const value = context.request.headers.get(name);
    if (value !== null && value !== '') {
      echoed[name] = value;
    }
  }

  const ip = resolveClientIp(context.request, () => context.clientAddress);

  return new Response(JSON.stringify({ ip, headers: echoed }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
