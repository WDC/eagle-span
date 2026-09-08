/**
 * Where the static site actually is.
 *
 * Astro puts a fully static build in `dist/`. The moment one route is rendered
 * on demand — which since Phase 5 one is, `/api/contact` — it splits the output
 * into `dist/client/` for the files and `dist/server/` for the function, and
 * the adapter then moves the server half into `.vercel/output/`.
 *
 * That rearrangement moved the ground under every gate that reads the build:
 * the sitemap check, the JSON-LD check, the redirect check and the link check
 * were all resolving paths against a directory that now contains one
 * subdirectory. Each of them re-deriving the answer is four places for it to be
 * wrong, so they ask here instead.
 *
 * The `existsSync` branch is not defensiveness about the current layout — it is
 * what keeps this correct if the last on-demand route is ever removed and the
 * build goes back to being flat.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function staticRoot(root) {
  const split = resolve(root, 'dist/client');
  return existsSync(split) ? split : resolve(root, 'dist');
}
