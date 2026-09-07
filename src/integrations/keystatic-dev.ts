import type { AstroIntegration } from 'astro';

/**
 * Registers Keystatic and its React runtime for `astro dev` only.
 *
 * `@keystatic/astro` injects two routes — `/keystatic/[...params]` and
 * `/api/keystatic/[...params]` — both with `prerender: false`. In a production
 * build that is two serverless functions on Vercel: an admin UI and an endpoint
 * that writes files, deployed to a public origin. In local mode neither one has
 * any authentication in front of it, because none is needed when the only way
 * to reach it is a dev server on 127.0.0.1.
 *
 * So the integration is not registered for a build at all. Not gated behind an
 * environment variable, not deployed and protected: absent. The production
 * build stays fully static — no functions, no React in the bundle, and nothing
 * for Vercel's deployment protection to have to cover — and
 * `verify:static-build` fails if a keystatic route ever reaches `dist/`.
 *
 * The imports are dynamic so that a production build never loads Keystatic or
 * React at all; both are devDependencies, and the build must not need them.
 *
 * When this project moves to GitHub storage — the flip described in
 * `keystatic.config.ts` — this is the second half of that change: drop the
 * `command` check, and add the authentication routes Keystatic's GitHub mode
 * needs. Until then, one editor, one working tree.
 */
export default function keystaticDev(): AstroIntegration {
  return {
    name: 'eagle-span:keystatic-dev',
    hooks: {
      'astro:config:setup': async ({ command, updateConfig, logger }) => {
        if (command !== 'dev') return;

        const [{ default: keystatic }, { default: react }] = await Promise.all([
          import('@keystatic/astro'),
          import('@astrojs/react'),
        ]);

        // React first: Keystatic's admin page is a `client:only="react"` island
        // and the renderer has to be registered before the route is injected.
        updateConfig({ integrations: [react(), keystatic()] });
        logger.info('Keystatic is at /keystatic (dev only, local storage).');
      },
    },
  };
}
