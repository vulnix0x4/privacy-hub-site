/**
 * JSON-LD builders for the five content layouts + the homepage.
 *
 * Kept minimal and correct per design doc §4.5 — we want canonical
 * Article / HowTo / WebSite + BreadcrumbList emission, not schema-stuffed
 * SEO spam.
 *
 * Every builder returns a plain object; the caller stringifies and emits
 * it inside a <script type="application/ld+json"> tag.
 */
export const SITE_URL = 'https://privacy.whattheflip.lol';
export const SITE_NAME = 'privacy.whattheflip.lol';
export const AUTHOR_NAME = 'vulnix0x4';

export interface BreadcrumbItem {
  name: string;
  url: string;
}

/** Trim and normalise any URL to absolute form against SITE_URL. */
function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith('/')) return `${SITE_URL}${pathOrUrl}`;
  return `${SITE_URL}/${pathOrUrl}`;
}

/** Format a Date (or ISO string) as YYYY-MM-DD for datePublished. */
function toIsoDate(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Article schema — used by Vector, Category, Scenario, Basics layouts.
 * `datePublished` uses `last_verified` because the collection schema
 * locks it; `dateModified` mirrors it. `author` is the publisher
 * pseudonym. `publisher` is the org name.
 */
export function buildArticleJsonLd(args: {
  title: string;
  description: string;
  lastVerified: Date | string;
  canonicalUrl: string;
}) {
  const date = toIsoDate(args.lastVerified);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: args.title,
    description: args.description,
    datePublished: date,
    dateModified: date,
    author: { '@type': 'Person', name: AUTHOR_NAME },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(args.canonicalUrl) },
  };
}

/**
 * HowTo schema — used by Guide layout. If `steps` is empty we emit the
 * HowTo without the step list (still valid per schema.org spec).
 * `totalTime` is ISO 8601 duration PT{n}M.
 */
export function buildHowToJsonLd(args: {
  title: string;
  description: string;
  timeMinutes: number;
  lastVerified: Date | string;
  canonicalUrl: string;
  steps?: Array<{ name: string; text: string }>;
}) {
  const date = toIsoDate(args.lastVerified);
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: args.title,
    description: args.description,
    totalTime: `PT${args.timeMinutes}M`,
    datePublished: date,
    dateModified: date,
    author: { '@type': 'Person', name: AUTHOR_NAME },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(args.canonicalUrl) },
  };
  if (args.steps && args.steps.length > 0) {
    base.step = args.steps.map((s, idx) => ({
      '@type': 'HowToStep',
      position: idx + 1,
      name: s.name,
      text: s.text,
    }));
  }
  return base;
}

/**
 * BreadcrumbList schema — cross-cuts every content layout and the
 * homepage. Accepts an ordered list of crumbs; the caller decides
 * the shape (Home > Vectors > <title>, etc.).
 */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

/**
 * WebSite schema for the homepage — attaches a SearchAction that points
 * at `/en/?q={search_term_string}`. Pagefind isn't wired yet; per the
 * plan, we keep the query URL rooted at /en/ so Google does not hit a
 * 404. The target page can respond with a "use Cmd-K" note until
 * Pagefind lands.
 */
export function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      // Placeholder target: Pagefind will own /en/search?q= later. For now
      // use the English root with the same query string — /en/ renders
      // regardless of ?q= so Google's SearchAction validator won't 404.
      target: `${SITE_URL}/en/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}
