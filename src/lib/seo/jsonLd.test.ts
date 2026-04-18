import { describe, expect, it } from 'vitest';
import {
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
  buildHowToJsonLd,
  buildWebSiteJsonLd,
  SITE_NAME,
  SITE_URL,
} from './jsonLd';

describe('buildArticleJsonLd', () => {
  it('emits a valid Article with Person author and Organization publisher', () => {
    const out = buildArticleJsonLd({
      title: 'Canvas fingerprinting',
      description: 'How sites read a unique ID from a 2D canvas.',
      lastVerified: new Date('2026-04-18T00:00:00Z'),
      canonicalUrl: '/en/vectors/canvas-fingerprinting',
    });
    expect(out['@context']).toBe('https://schema.org');
    expect(out['@type']).toBe('Article');
    expect(out.headline).toBe('Canvas fingerprinting');
    expect(out.datePublished).toBe('2026-04-18');
    expect(out.dateModified).toBe('2026-04-18');
    expect((out.author as Record<string, string>).name).toBe('vulnix0x4');
    expect((out.publisher as Record<string, string>).name).toBe(SITE_NAME);
    expect((out.mainEntityOfPage as Record<string, string>)['@id']).toBe(
      `${SITE_URL}/en/vectors/canvas-fingerprinting`,
    );
  });

  it('accepts an ISO string for last_verified', () => {
    const out = buildArticleJsonLd({
      title: 'T',
      description: 'Description longer than twenty chars.',
      lastVerified: '2026-01-02',
      canonicalUrl: '/en/whatever',
    });
    expect(out.datePublished).toBe('2026-01-02');
  });
});

describe('buildHowToJsonLd', () => {
  it('emits a HowTo with totalTime in ISO 8601 minutes', () => {
    const out = buildHowToJsonLd({
      title: 'Harden Firefox',
      description: 'FPP-first Firefox config',
      timeMinutes: 15,
      lastVerified: new Date('2026-04-18T00:00:00Z'),
      canonicalUrl: '/en/guides/harden-firefox',
    });
    expect(out['@type']).toBe('HowTo');
    expect(out.totalTime).toBe('PT15M');
    expect(out.step).toBeUndefined();
  });

  it('emits HowToStep array when steps are provided', () => {
    const out = buildHowToJsonLd({
      title: 'Harden Firefox',
      description: 'FPP-first Firefox config',
      timeMinutes: 15,
      lastVerified: '2026-04-18',
      canonicalUrl: '/en/guides/harden-firefox',
      steps: [
        { name: 'ETP Strict', text: 'Switch Enhanced Tracking Protection to Strict.' },
        { name: 'uBlock Origin', text: 'Install uBlock Origin.' },
      ],
    });
    expect(Array.isArray(out.step)).toBe(true);
    const steps = out.step as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(2);
    const [first, second] = steps;
    expect(first!['@type']).toBe('HowToStep');
    expect(first!.position).toBe(1);
    expect(second!.position).toBe(2);
  });
});

describe('buildBreadcrumbJsonLd', () => {
  it('emits ordered ListItem entries with absolute URLs', () => {
    const out = buildBreadcrumbJsonLd([
      { name: 'Home', url: '/en/' },
      { name: 'Vectors', url: '/en/vectors' },
      { name: 'Canvas', url: '/en/vectors/canvas-fingerprinting' },
    ]);
    expect(out['@type']).toBe('BreadcrumbList');
    expect(out.itemListElement).toHaveLength(3);
    const items = out.itemListElement;
    const [first, , third] = items;
    expect(first!.position).toBe(1);
    expect(third!.position).toBe(3);
    expect(first!.item).toBe(`${SITE_URL}/en/`);
    expect(third!.item).toBe(`${SITE_URL}/en/vectors/canvas-fingerprinting`);
  });
});

describe('buildWebSiteJsonLd', () => {
  it('emits a WebSite with SearchAction pointing at a valid route', () => {
    const out = buildWebSiteJsonLd();
    expect(out['@type']).toBe('WebSite');
    expect(out.url).toBe(SITE_URL);
    const action = out.potentialAction as Record<string, unknown>;
    expect(action['@type']).toBe('SearchAction');
    expect(action.target).toBe(`${SITE_URL}/en/?q={search_term_string}`);
    expect(action['query-input']).toBe('required name=search_term_string');
  });
});

describe('JSON-LD emitted payloads are valid JSON', () => {
  it('round-trips through JSON.stringify for every builder', () => {
    const payloads = [
      buildArticleJsonLd({
        title: 't',
        description: 'description of the page long enough',
        lastVerified: '2026-04-18',
        canonicalUrl: '/en/x',
      }),
      buildHowToJsonLd({
        title: 't',
        description: 'description of the page long enough',
        timeMinutes: 10,
        lastVerified: '2026-04-18',
        canonicalUrl: '/en/x',
      }),
      buildBreadcrumbJsonLd([{ name: 'Home', url: '/en/' }]),
      buildWebSiteJsonLd(),
    ];
    for (const p of payloads) {
      const s = JSON.stringify(p);
      expect(typeof s).toBe('string');
      const re = JSON.parse(s);
      expect(re['@context']).toBe('https://schema.org');
      expect(re['@type']).toBeDefined();
    }
  });
});
