import { describe, expect, it } from 'vitest';
import { GET } from './robots.txt';

const AI_SCRAPERS = ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended', 'Bytespider', 'PerplexityBot'];

describe('robots.txt endpoint', () => {
  it('returns 200 with text/plain body', async () => {
    const res = await GET({} as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/plain/);
  });

  it('names every required AI scraper user-agent', async () => {
    const body = await (await GET({} as never)).text();
    for (const ua of AI_SCRAPERS) {
      expect(body, `missing User-agent: ${ua}`).toMatch(new RegExp(`^User-agent: ${ua}$`, 'm'));
    }
  });

  it('includes a wildcard Allow: / directive', async () => {
    const body = await (await GET({} as never)).text();
    expect(body).toMatch(/^User-agent: \*$/m);
    // After the wildcard UA we should see an Allow: / before the next blank line.
    const wildcardBlock = body.split(/\n\n/).find((block) => /^User-agent: \*$/m.test(block));
    expect(wildcardBlock).toMatch(/^Allow: \/$/m);
  });

  it('references the sitemap-index.xml URL', async () => {
    const body = await (await GET({} as never)).text();
    expect(body).toMatch(/^Sitemap: https:\/\/privacy\.whattheflip\.lol\/sitemap-index\.xml$/m);
  });
});
