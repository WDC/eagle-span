// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

import { site } from './src/site.config.ts';

export default defineConfig({
  site: site.url,
  output: 'static',
  adapter: vercel(),

  /*
   * Matches current Webflow behaviour exactly — the live site 301s
   * /repairs/wheel-alignment/ to /repairs/wheel-alignment. Zero migration risk.
   */
  trailingSlash: 'never',
  build: { format: 'file' },

  /*
   * Phase 4 replaces this with real `lastmod` values read from the content
   * collections — build time is not a modification date. Until then the
   * integration exists so /sitemap-index.xml is a real URL rather than a
   * dangling reference in the head.
   */
  integrations: [sitemap()],

  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },

  image: {
    // Everything is self-hosted after the Webflow export; no remote patterns.
    responsiveStyles: true,
  },

  markdown: {
    smartypants: true,
    gfm: true,
  },

  devToolbar: { enabled: false },
});
