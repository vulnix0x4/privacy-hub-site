/**
 * Gate 5 — build-artifact assertions.
 *
 * Runs after `npm run build` and inspects `dist/client/**` to ensure the
 * prerendered output carries every SEO and privacy guarantee the design
 * doc promises (§12, §13). Purely file-system based — no browser, no
 * server boot. Should complete in well under 5 seconds.
 *
 * If `dist/client` is absent (e.g. fresh clone, pre-build), every suite
 * skips so `npm run test` still passes. The CI workflow is responsible
 * for running `npm run build` first.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = resolve(process.cwd(), 'dist', 'client');
const distExists = existsSync(DIST);

const OWN_HOSTS = new Set([
  'privacy.whattheflip.lol',
  'localhost',
  '127.0.0.1',
]);

/** Recursively walks `dir` and returns absolute paths of every `index.html`. */
function collectHtmlFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectHtmlFiles(full, out);
    } else if (name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

const allHtml: string[] = distExists ? collectHtmlFiles(DIST) : [];

describe.skipIf(!distExists)('Gate 5 — sitemap + robots + indexnow artifacts', () => {
  it('sitemap-index.xml exists and references sitemap-0.xml', () => {
    const indexPath = resolve(DIST, 'sitemap-index.xml');
    expect(existsSync(indexPath)).toBe(true);
    const body = readFileSync(indexPath, 'utf8');
    expect(body).toContain('<sitemapindex');
    expect(body).toMatch(/sitemap-0\.xml/);
  });

  it('sitemap-0.xml lists at least 60 URLs', () => {
    const path = resolve(DIST, 'sitemap-0.xml');
    expect(existsSync(path)).toBe(true);
    const body = readFileSync(path, 'utf8');
    const locs = body.match(/<loc>/g) ?? [];
    expect(locs.length).toBeGreaterThanOrEqual(60);
  });

  // robots.txt is emitted at request time (prerender = false). We assert its
  // route source, not a built static file. The runtime smoke test in Gate 4
  // re-verifies the served body contains `Allow: /`.
  it('robots.txt route source contains Allow: directive', () => {
    const routePath = resolve(process.cwd(), 'src', 'pages', 'robots.txt.ts');
    expect(existsSync(routePath)).toBe(true);
    const body = readFileSync(routePath, 'utf8');
    expect(body).toMatch(/Allow:\s*\//);
  });

  it('IndexNow key file exists at root of dist/client', () => {
    const key = resolve(DIST, 'c7aa43b8abe34668bf459415f270fd97.txt');
    expect(existsSync(key)).toBe(true);
  });
});

describe.skipIf(!distExists)('Gate 5 — per-page SEO contracts', () => {
  it('every prerendered HTML declares a non-empty meta description', () => {
    const offenders: string[] = [];
    for (const file of allHtml) {
      const html = readFileSync(file, 'utf8');
      const match = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
      if (!match || match[1].trim().length === 0) {
        offenders.push(relative(DIST, file));
      }
    }
    expect(offenders, `pages missing meta description: ${offenders.join(', ')}`).toEqual([]);
  });

  it('every prerendered HTML (except noindex) declares a canonical link', () => {
    const offenders: string[] = [];
    for (const file of allHtml) {
      const html = readFileSync(file, 'utf8');
      const isNoIndex = /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
      if (isNoIndex) continue;
      if (!/<link\s+rel="canonical"\s+href="[^"]+"/i.test(html)) {
        offenders.push(relative(DIST, file));
      }
    }
    expect(offenders, `pages missing canonical: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe.skipIf(!distExists)('Gate 5 — JSON-LD spot checks', () => {
  it('canvas-fingerprinting vector emits Article + BreadcrumbList', () => {
    const path = resolve(DIST, 'en/vectors/canvas-fingerprinting/index.html');
    expect(existsSync(path)).toBe(true);
    const html = readFileSync(path, 'utf8');
    expect(html).toMatch(/<script\s+type="application\/ld\+json"/);
    expect(html).toMatch(/"@type":"Article"/);
    expect(html).toMatch(/"@type":"BreadcrumbList"/);
  });

  it('homepage emits WebSite + SearchAction + BreadcrumbList', () => {
    const path = resolve(DIST, 'en/index.html');
    expect(existsSync(path)).toBe(true);
    const html = readFileSync(path, 'utf8');
    expect(html).toMatch(/"@type":"WebSite"/);
    expect(html).toMatch(/"@type":"SearchAction"/);
    expect(html).toMatch(/"@type":"BreadcrumbList"/);
  });

  it('harden-firefox guide emits HowTo', () => {
    const path = resolve(DIST, 'en/guides/harden-firefox/index.html');
    expect(existsSync(path)).toBe(true);
    const html = readFileSync(path, 'utf8');
    expect(html).toMatch(/"@type":"HowTo"/);
  });
});

describe.skipIf(!distExists)('Gate 5 — no cross-origin script sources', () => {
  it('no prerendered HTML loads a script from a non-own host', () => {
    const offenders: Array<{ page: string; src: string }> = [];
    // Scripts can be `<script src="…">` (classic) or `<script type="module" src="…">`.
    // We look for any http(s):// URL in a src= attribute inside a <script> tag.
    const scriptSrcRe = /<script\b[^>]*\bsrc="(https?:\/\/[^"]+)"/gi;
    for (const file of allHtml) {
      const html = readFileSync(file, 'utf8');
      for (const match of html.matchAll(scriptSrcRe)) {
        const url = match[1];
        try {
          const host = new URL(url).hostname;
          if (!OWN_HOSTS.has(host)) {
            offenders.push({ page: relative(DIST, file), src: url });
          }
        } catch {
          offenders.push({ page: relative(DIST, file), src: url });
        }
      }
    }
    expect(
      offenders,
      `third-party script srcs found: ${offenders.map((o) => `${o.page} -> ${o.src}`).join('; ')}`
    ).toEqual([]);
  });

  it('no prerendered HTML loads a stylesheet from a non-own host', () => {
    const offenders: Array<{ page: string; src: string }> = [];
    const linkRe = /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="(https?:\/\/[^"]+)"/gi;
    for (const file of allHtml) {
      const html = readFileSync(file, 'utf8');
      for (const match of html.matchAll(linkRe)) {
        const url = match[1];
        try {
          const host = new URL(url).hostname;
          if (!OWN_HOSTS.has(host)) {
            offenders.push({ page: relative(DIST, file), src: url });
          }
        } catch {
          offenders.push({ page: relative(DIST, file), src: url });
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
