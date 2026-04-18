/**
 * GET /og/{slug}.png
 *
 * Renders a 1200x630 OG card as PNG using an SVG template + resvg-js.
 * Slug shape: `{collection}--{entry-id}` (double-dash separator so
 * normal slugs with single hyphens round-trip cleanly). Example:
 *   - /og/vectors--canvas-fingerprinting.png
 *   - /og/guides--harden-firefox.png
 *   - /og/home.png (the homepage / fallback card)
 *
 * Prerendered at build time for every entry in vectors, categories,
 * scenarios, guides, basics. Requests for a slug that didn't get
 * prerendered (e.g. a typo) fall back to the static /og-default.png.
 *
 * See src/lib/seo/ogImage.ts for the SVG template.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { renderOgPng } from '../../lib/seo/ogImage';

export const prerender = true;

type CollectionName = 'vectors' | 'categories' | 'scenarios' | 'guides' | 'basics';

const CATEGORY_LABEL: Record<CollectionName, string> = {
  vectors: 'Tracking vector',
  categories: 'Tool pick',
  scenarios: 'Threat-model scenario',
  guides: 'Guide',
  basics: 'Basics',
};

export async function getStaticPaths() {
  const collections: CollectionName[] = ['vectors', 'categories', 'scenarios', 'guides', 'basics'];
  const paths: Array<{ params: { slug: string }; props: { title: string; category: string; lastVerified: string } }> = [
    {
      params: { slug: 'home' },
      props: {
        title: 'Opinionated privacy tools that just work.',
        category: 'Privacy hub',
        lastVerified: '2026-04-18',
      },
    },
  ];
  for (const col of collections) {
    const entries = await getCollection(col);
    for (const entry of entries) {
      paths.push({
        params: { slug: `${col}--${entry.id}` },
        props: {
          title: entry.data.title,
          category: CATEGORY_LABEL[col],
          lastVerified: entry.data.last_verified.toISOString().slice(0, 10),
        },
      });
    }
  }
  return paths;
}

export const GET: APIRoute = ({ props }) => {
  // `props` comes from getStaticPaths. For prerendered builds this is
  // always populated. In dev, Astro still runs getStaticPaths for path
  // match, so props is safe to trust here.
  const { title, category, lastVerified } = props as {
    title: string;
    category: string;
    lastVerified: string;
  };
  const png = renderOgPng({ title, category, lastVerified });
  // Copy into a fresh ArrayBuffer — keeps the Fetch Response body type
  // narrow and avoids the shared-ArrayBuffer generic that upsets TS.
  const copy = new ArrayBuffer(png.byteLength);
  new Uint8Array(copy).set(png);
  return new Response(copy, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
