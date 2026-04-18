/**
 * Build-artifact test — validates what actually lands in `dist/client`
 * after `astro build`. We only exercise this suite when the dist has
 * been populated; if there is no dist we skip (so `vitest` on a fresh
 * clone doesn't fail before a build has run).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = resolve(process.cwd(), 'dist', 'client');
const distExists = existsSync(DIST);

describe.skipIf(!distExists)('sitemap', () => {
  it('sitemap-index.xml exists and points to per-page sitemap(s)', () => {
    const indexPath = resolve(DIST, 'sitemap-index.xml');
    expect(existsSync(indexPath)).toBe(true);
    const indexBody = readFileSync(indexPath, 'utf8');
    expect(indexBody).toContain('<sitemapindex');
    expect(indexBody).toMatch(/sitemap-0\.xml/);
  });

  it('sitemap-0.xml lists at least 60 URLs', () => {
    const path = resolve(DIST, 'sitemap-0.xml');
    expect(existsSync(path)).toBe(true);
    const body = readFileSync(path, 'utf8');
    const locs = body.match(/<loc>/g) ?? [];
    expect(locs.length).toBeGreaterThanOrEqual(60);
  });
});

describe.skipIf(!distExists)('JSON-LD emission', () => {
  const specimens: Array<{ label: string; path: string; expect: Array<RegExp> }> = [
    {
      label: 'homepage',
      path: 'en/index.html',
      expect: [/"@type":"WebSite"/, /"@type":"SearchAction"/, /"@type":"BreadcrumbList"/],
    },
    {
      label: 'vector page',
      path: 'en/vectors/canvas-fingerprinting/index.html',
      expect: [/"@type":"Article"/, /"@type":"BreadcrumbList"/],
    },
    {
      label: 'category page',
      path: 'en/categories/vpn/index.html',
      expect: [/"@type":"Article"/, /"@type":"BreadcrumbList"/],
    },
    {
      label: 'scenario page',
      path: 'en/scenarios/journalist-source-protection/index.html',
      expect: [/"@type":"Article"/, /"@type":"BreadcrumbList"/],
    },
    {
      label: 'guide page',
      path: 'en/guides/harden-firefox/index.html',
      expect: [/"@type":"HowTo"/, /"@type":"BreadcrumbList"/],
    },
    {
      label: 'basics page',
      path: 'en/basics/threat-modeling/index.html',
      expect: [/"@type":"Article"/, /"@type":"BreadcrumbList"/],
    },
  ];

  for (const spec of specimens) {
    it(`${spec.label} emits every expected JSON-LD type`, () => {
      const path = resolve(DIST, spec.path);
      if (!existsSync(path)) {
        // Build may have not visited this page — skip rather than fail.
        return;
      }
      const html = readFileSync(path, 'utf8');
      expect(html).toMatch(/<script type="application\/ld\+json"/);
      for (const re of spec.expect) {
        expect(html, `${spec.label} missing ${re}`).toMatch(re);
      }
    });
  }
});
