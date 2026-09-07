import { execFileSync } from 'node:child_process';

import type { SitePage } from './pages.ts';

/**
 * When a page last actually changed.
 *
 * `lastmod` is the one field in a sitemap a crawler can act on, and the one
 * that is almost always wrong. The default everywhere is the build time, which
 * says every page on the site was rewritten at 3am on the day of the last
 * deploy — for a fourteen-page shop that redeploys on a dependency bump, that
 * is a claim of constant churn, and Google's documented response to a sitemap
 * whose dates it cannot trust is to ignore the dates entirely. A wrong
 * `lastmod` is worse than none.
 *
 * So there are two honest sources and no third:
 *
 *   1. **The content.** An article's revision date, a policy's effective date.
 *      An editor asserting when something changed outranks everything else.
 *   2. **Git.** For the pages whose schema carries no date — a service, an
 *      index, the homepage — the commit that last touched the entry's file is
 *      the closest thing to the truth that exists, and it is automatic, which
 *      matters: a manual `updatedAt` on fourteen service pages is a field
 *      nobody will remember to set.
 *
 * When neither is available the URL ships with no `lastmod` at all. That is the
 * point of the whole module: the fallback is silence, never `new Date()`.
 */

/**
 * Git history has to be *there* to be read, and in CI it usually is not.
 *
 * `actions/checkout` clones at depth 1 by default, and in a one-commit clone
 * `git log -1 -- <file>` returns the tip commit for every path — every page
 * gets an identical date, which is the build-time lie wearing a different hat.
 * It is worth detecting rather than shipping, so a shallow clone disables the
 * git source entirely and says so once. `.github/workflows/ci.yml` sets
 * `fetch-depth: 0` for the job that builds.
 */
function gitAvailability(): { usable: boolean; reason?: string } {
  const git = (...args: string[]) =>
    execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

  try {
    if (git('rev-parse', '--is-inside-work-tree') !== 'true') {
      return { usable: false, reason: 'not a git work tree' };
    }
    if (git('rev-parse', '--is-shallow-repository') === 'true') {
      return { usable: false, reason: 'shallow clone — every path would report the tip commit' };
    }
    return { usable: true };
  } catch {
    return { usable: false, reason: 'git is not available' };
  }
}

let availability: { usable: boolean; reason?: string } | null = null;
const cache = new Map<string, Date | undefined>();

function gitLastModified(path: string): Date | undefined {
  availability ??= gitAvailability();
  if (!availability.usable) return undefined;

  if (cache.has(path)) return cache.get(path);

  let date: Date | undefined;
  try {
    /*
     * Committer date, not author date: a rebase or a cherry-pick keeps the
     * author date of the original work, and what a crawler is being told is
     * when this content became what it is on this branch.
     */
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', path], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    /* Empty means the file has no commits — new, or untracked. Both are "unknown". */
    date = out ? new Date(out) : undefined;
  } catch {
    date = undefined;
  }

  cache.set(path, date);
  return date;
}

/** Reported once per build, so a CI run says why its sitemap has no dates. */
export function lastmodSourceNote(): string | undefined {
  availability ??= gitAvailability();
  return availability.usable ? undefined : `lastmod: git dates unavailable (${availability.reason}).`;
}

/**
 * The `lastmod` for one page, or `undefined` when neither source can answer.
 *
 * Content wins over git deliberately. A commit that reflows frontmatter or
 * fixes a typo in a policy does not change when that policy took effect, and
 * the editor's date is the one a reader would recognise.
 */
export function lastmodFor(page: SitePage): Date | undefined {
  if (page.contentDate) return page.contentDate;
  return page.source ? gitLastModified(page.source) : undefined;
}
