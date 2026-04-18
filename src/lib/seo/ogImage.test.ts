import { describe, expect, it } from 'vitest';
import { buildOgSvg, renderOgPng } from './ogImage';

describe('buildOgSvg', () => {
  it('emits a 1200x630 svg with the title and last_verified date', () => {
    const svg = buildOgSvg({
      title: 'Canvas fingerprinting',
      category: 'Tracking vector',
      lastVerified: '2026-04-18',
    });
    expect(svg).toMatch(/<svg[^>]*width="1200"/);
    expect(svg).toMatch(/<svg[^>]*height="630"/);
    expect(svg).toContain('Canvas fingerprinting');
    expect(svg).toContain('2026-04-18');
    expect(svg).toContain('Tracking vector');
    expect(svg).toContain('privacy.whattheflip.lol');
  });

  it('XML-escapes untrusted characters in the title', () => {
    const svg = buildOgSvg({
      title: 'Cookies & <storage>',
      category: 'Tracking vector',
      lastVerified: '2026-04-18',
    });
    expect(svg).toContain('Cookies &amp; &lt;storage&gt;');
    expect(svg).not.toContain('Cookies & <storage>');
  });

  it('wraps long titles onto two lines with an ellipsis when needed', () => {
    const longTitle =
      'A very long title that absolutely will not fit on a single line of the OG card even in small type';
    const svg = buildOgSvg({
      title: longTitle,
      category: 'Guide',
      lastVerified: '2026-04-18',
    });
    // Two <tspan> lines expected.
    const tspanCount = (svg.match(/<tspan /g) ?? []).length;
    expect(tspanCount).toBe(2);
    // Something was elided.
    expect(svg).toMatch(/…/);
  });
});

describe('renderOgPng', () => {
  it('renders a non-empty PNG buffer starting with the PNG magic bytes', () => {
    const png = renderOgPng({
      title: 'Harden Firefox',
      category: 'Guide',
      lastVerified: '2026-04-18',
    });
    expect(png.byteLength).toBeGreaterThan(1000);
    // PNG magic: 89 50 4E 47 0D 0A 1A 0A
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });
});
