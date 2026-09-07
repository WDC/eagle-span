// @ts-check
import { defineConfig } from 'astro/config';
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
