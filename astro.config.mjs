// @ts-check
import { defineConfig } from 'astro/config';
import markdoc from '@astrojs/markdoc';
import vercel from '@astrojs/vercel';

import keystaticDev from './src/integrations/keystatic-dev.ts';
import remarkTypography from './src/lib/remark-typography.ts';
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

  integrations: [
    /*
     * Markdoc, not MDX: content cannot import a module or evaluate an
     * expression, and the only tags it can use are the ones declared in
     * markdoc.config.mjs. See docs/phase-1-content-model.md.
     */
    markdoc(),

    /*
     * No sitemap integration. `src/pages/sitemap.xml.ts` writes it instead,
     * because the integration's `lastmod` is the build time — it derives its
     * URLs by scanning routes and has no way to ask the content when it
     * changed. See the header of that file.
     */

    /*
     * Adds Keystatic only under `astro dev`, so /keystatic and its write
     * endpoint are absent from every build. verify:static-build enforces it.
     */
    keystaticDev(),
  ],

  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },

  image: {
    // Everything is self-hosted after the Webflow export; no remote patterns.
    responsiveStyles: true,
  },

  markdown: {
    /*
     * Stage 1 of the text pipeline. Astro registers remark-smartypants ahead of
     * any user plugin, so remarkTypography below receives a tree whose quotes
     * and dashes are already correct and applies stages 2-4 on top:
     * nbsp -> widont -> normalize. See src/lib/typography.ts.
     */
    smartypants: true,
    gfm: true,
    remarkPlugins: [remarkTypography],
  },

  devToolbar: { enabled: false },
});
