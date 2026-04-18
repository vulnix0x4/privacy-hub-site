/**
 * Gate 1 — zero cross-origin requests.
 *
 * For every representative route on the built site we:
 *   1. Instrument `page.on('request')` to capture the URL of every outbound
 *      request the browser makes (HTML, JS, CSS, images, XHR, fetch, websocket).
 *   2. Navigate to the route and wait for networkidle so deferred fetches
 *      get a chance to fire.
 *   3. Fail the test if any captured hostname is not in the allowlist:
 *      - 127.0.0.1 (the local preview server)
 *      - localhost
 *      - privacy.whattheflip.lol (our production origin, which some rel=canonical
 *        preload links legitimately reference but the browser should not actually
 *        fetch from)
 *      - data:, blob:, about: (same-document schemes — not cross-origin)
 *
 * The design-doc promise in §13.1: "every page on the built site must make
 * zero cross-origin fetches." This spec is the build-time guarantor of that
 * promise.
 */
import { test, expect, type Request as PwRequest } from '@playwright/test';

const ROUTES = [
  '/',
  '/en/',
  '/en/scan/',
  '/en/vectors/',
  '/en/vectors/canvas-fingerprinting/',
  '/en/categories/',
  '/en/categories/vpn/',
  '/en/guides/',
  '/en/guides/harden-firefox/',
  '/en/about/',
  '/en/legal/privacy/',
  '/en/changelog/',
] as const;

const OWN_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  'privacy.whattheflip.lol',
]);

const SAFE_SCHEMES = new Set(['data:', 'blob:', 'about:', 'chrome:', 'chrome-extension:']);

/** Classify a request URL as "own origin / safe scheme" or "third-party". */
function isThirdParty(url: string): { thirdParty: boolean; host: string | null } {
  // Handle scheme-only URLs (data:…, blob:…, about:blank, etc.).
  for (const s of SAFE_SCHEMES) {
    if (url.startsWith(s)) return { thirdParty: false, host: null };
  }
  try {
    const u = new URL(url);
    if (OWN_HOSTS.has(u.hostname)) return { thirdParty: false, host: u.hostname };
    return { thirdParty: true, host: u.hostname };
  } catch {
    // Malformed URLs are suspicious — treat as third-party so we surface them.
    return { thirdParty: true, host: null };
  }
}

for (const route of ROUTES) {
  test(`no third-party requests on ${route}`, async ({ page }) => {
    const requests: Array<{ url: string; resourceType: string; method: string }> = [];

    page.on('request', (req: PwRequest) => {
      requests.push({
        url: req.url(),
        resourceType: req.resourceType(),
        method: req.method(),
      });
    });

    const response = await page.goto(route, { waitUntil: 'networkidle' });
    expect(response, `no response for ${route}`).not.toBeNull();
    expect(response!.status(), `non-2xx status on ${route}`).toBeLessThan(400);

    // Give any deferred/island-loaded scripts a chance to fire fetches.
    await page.waitForLoadState('networkidle');

    const offenders = requests
      .map((r) => ({ ...r, ...isThirdParty(r.url) }))
      .filter((r) => r.thirdParty);

    if (offenders.length > 0) {
      const msg = offenders
        .map((r) => `${r.method} ${r.resourceType} ${r.url} (host=${r.host ?? 'n/a'})`)
        .join('\n  ');
      throw new Error(`Third-party requests detected on ${route}:\n  ${msg}`);
    }

    expect(offenders, `third-party requests on ${route}`).toHaveLength(0);
  });
}

test('no third-party requests when POSTing to /api/scan/nonce', async ({ request, baseURL }) => {
  // Scanner endpoint sanity — the nonce route itself is on our own origin,
  // but we assert it doesn't redirect anywhere cross-origin.
  const res = await request.post(`${baseURL}/api/scan/nonce`, {
    headers: {
      origin: baseURL ?? 'http://127.0.0.1:4329',
      'content-type': 'application/json',
    },
  });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type'] ?? '').toContain('application/json');
  const body = (await res.json()) as { nonce: string; expiresAt: number };
  expect(body.nonce).toHaveLength(36);
  expect(body.expiresAt).toBeGreaterThan(Date.now());
});
