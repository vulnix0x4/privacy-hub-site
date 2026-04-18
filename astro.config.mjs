// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://privacy.whattheflip.lol',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react(), mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
    routing: {
      prefixDefaultLocale: true,
    },
  },
  prefetch: {
    prefetchAll: false,
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 4321,
  },
});
