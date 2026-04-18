/**
 * pa11y-ci config — Gate 2 of Phase 12 launch verification.
 *
 * Runs automated WCAG 2.2 AA checks against the same route set as Gate 1.
 * Zero-warning policy: the known-violation allowlist is empty. Every flag
 * pa11y raises blocks CI until the root cause is fixed in a layout or
 * component.
 *
 * Usage:
 *   $ npm run build                # produces dist/
 *   $ node dist/server/entry.mjs & # or: npm run preview
 *   $ npm run test:a11y
 *
 * In CI (.github/workflows/deploy.yml) we spawn the server with the same
 * PORT=4329 we use for Playwright so both gates share the same running
 * preview.
 *
 * NOTE: WCAG2AA is the HTML_CodeSniffer equivalent of WCAG 2.2 AA. Pa11y
 * uses axe + htmlcs; the `WCAG2AA` alias captures both Level A and Level
 * AA rules. No `ignore` list — we aim for zero.
 */
const PORT = process.env.PA11Y_PORT || '4329';
const BASE = `http://127.0.0.1:${PORT}`;

/** Same route set as the Playwright no-third-party spec. */
const ROUTES = [
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
];

module.exports = {
  defaults: {
    standard: 'WCAG2AA',
    runners: ['htmlcs'],
    timeout: 30000,
    wait: 1000,
    threshold: 0,
    hideElements: '',
    includeWarnings: false,
    includeNotices: false,
    chromeLaunchConfig: {
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  urls: ROUTES.map((r) => `${BASE}${r}`),
};
