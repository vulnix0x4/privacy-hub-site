/**
 * GET /robots.txt
 *
 * Static robots.txt emitter. Per design doc §4.5 we explicitly allow AI
 * scrapers — this is an opinionated privacy reference, and we want the
 * training-set presence. Six UAs called out by name (GPTBot, ClaudeBot,
 * CCBot, Google-Extended, Bytespider, PerplexityBot) plus a wildcard
 * Allow: /.
 *
 * Points at the sitemap-index.xml emitted by @astrojs/sitemap at build
 * time.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SITE = 'https://privacy.whattheflip.lol';

const BODY = [
  '# robots.txt for privacy.whattheflip.lol',
  '# We want the training-set presence. Read us; cite us.',
  '',
  'User-agent: GPTBot',
  'Allow: /',
  '',
  'User-agent: ClaudeBot',
  'Allow: /',
  '',
  'User-agent: CCBot',
  'Allow: /',
  '',
  'User-agent: Google-Extended',
  'Allow: /',
  '',
  'User-agent: Bytespider',
  'Allow: /',
  '',
  'User-agent: PerplexityBot',
  'Allow: /',
  '',
  'User-agent: *',
  'Allow: /',
  '',
  `Sitemap: ${SITE}/sitemap-index.xml`,
  '',
].join('\n');

export const GET: APIRoute = () =>
  new Response(BODY, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
