import { defineCollection, z } from 'astro:content';
import { file, glob } from 'astro/loaders';

// Common frontmatter — every MDX content page enforces these.
// `last_verified` is snake_case (design doc §4.3) and locked.
// `related` min 2 so every page cross-links into the web (build fails on
// fewer than 2 entries, see design doc §4.3).
const common = z.object({
  title: z.string().min(3),
  description: z.string().min(20).max(160),
  difficulty: z.enum(['easy', 'intermediate', 'advanced']).optional(),
  last_verified: z.coerce.date(),
  related: z.array(z.string()).min(2),
});

const vectors = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/vectors' }),
  schema: common.extend({
    family: z.enum([
      'network',
      'fingerprint',
      'sensors',
      'permissions',
      'storage',
      'behavioral',
      'cross-site',
    ]),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    prevalence: z.enum(['very-common', 'common', 'rare']),
    in_scanner: z.boolean().default(true),
  }),
});

const categories = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/categories' }),
  schema: common.extend({
    hero_pick: z.string(),
    alternatives: z.array(z.string()).min(1),
    affiliate: z
      .enum([
        'proton',
        'privacy-com',
        'smspool',
        'bitwarden',
        'brave',
        'kagi',
        'obsidian',
        'ente',
        'none',
      ])
      .default('none'),
  }),
});

const scenarios = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/scenarios' }),
  schema: common.extend({
    playlist: z
      .array(
        z.object({
          type: z.enum(['basics', 'vector', 'category', 'guide']),
          slug: z.string(),
          why: z.string().min(10),
        }),
      )
      .min(5),
    jurisdiction_note: z.string().optional(),
  }),
});

const guides = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/guides' }),
  schema: common.extend({
    time_minutes: z.number().int().positive(),
    prerequisites: z.array(z.string()).default([]),
  }),
});

const basics = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/basics' }),
  schema: common,
});

// Glossary is a YAML data collection — one file, array of `{ id, term, definition, see_also }`.
// Loaded via `file()` rather than `glob()` because it's a single file, not a per-entry tree.
const glossary = defineCollection({
  loader: file('src/content/glossary/glossary.yaml'),
  schema: z.object({
    term: z.string().min(2),
    definition: z.string().min(20),
    see_also: z.array(z.string()).default([]),
  }),
});

export const collections = {
  vectors,
  categories,
  scenarios,
  guides,
  basics,
  glossary,
};
