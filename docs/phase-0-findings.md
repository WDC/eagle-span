# Phase 0 — crawl, URL inventory, redirect map

Crawl date: 2026-09-07. Origin: `https://www.eaglespancorp.com` (Webflow, behind
Cloudflare). All 30 sitemap URLs fetched; every one returned 200.

Deliverables: [`data/url-inventory.csv`](../data/url-inventory.csv) (parity
sheet), [`data/redirects.csv`](../data/redirects.csv) (redirect map).

## What is missing from this pass

The redirect map is built from the live crawl and the sitemap only. Two inputs
named in the task are **not** yet available and both are gated on the Blockers
list:

- **GSC Pages export (16 months)** and **external links** — blocked on
  "Get Search Console property transferred from Dieselmatic". Without it we
  cannot see pre-Webflow legacy URLs that no longer appear in the crawl, and
  we cannot yet decide which articles are earning clicks. Phase 3's
  consolidation decision depends on this.
- **Webflow page list** — blocked on "Export all Webflow assets before hosting
  lapses". The sitemap may omit unpublished or orphaned template pages.

Treat `data/redirects.csv` as complete for everything reachable from the live
site, and expect it to grow once those two exports land.

## URL structure

Reproduced 1:1 as instructed. The existing paths are shallow and
keyword-appropriate; nothing warranted a change.

| Section | Count | Pattern |
| --- | --- | --- |
| Services | 5 | `/services/{slug}` |
| Repairs | 9 | `/repairs/{slug}` |
| Articles | 7 | `/articles/{slug}` |
| Company | 5 | `/company/{slug}` |
| Index / other | 4 | `/`, `/contact`, `/service`, `/repair` |

**Correction to the task's assumption:** articles live at `/articles/{slug}`,
not `/company/articles/{slug}`. The index is at `/company/articles` but the
entries are not nested under it. Keeping the article URLs as-is — moving 7 URLs
to gain nothing but tidiness is unforced risk.

## Redirects added

Six rows, all small, as expected.

| Source | Destination | Why |
| --- | --- | --- |
| `/index.html` | `/` | **Live site serves a 200 here** — a full duplicate of the homepage with no canonical tag to disambiguate it. |
| `/blog` | `/company/articles` | Already 301s on the live site. Pre-Webflow legacy path; preserve it. |
| `/services` | `/service` | Live site 301s this to `/`, which reads as a soft 404. Point it at the real index. |
| `/repairs` | `/repair` | Live site 404s the plural while `/repair` exists and all children are `/repairs/*`. |
| `/articles` | `/company/articles` | Live site 404s the bare path even though every article sits under it. |
| `/company` | `/company/about` | Live site 404s the section parent. |

Case handling and trailing slashes need no rows: the origin already 301s
`/repairs/wheel-alignment/` → `/repairs/wheel-alignment`, which is why
`trailingSlash: 'never'` is zero-risk, and uppercase paths 404 rather than
duplicating.

`www` stays canonical — the apex already 301s to it.

## Defects found in the crawl

Confirmed, with the evidence in the inventory sheet.

1. **No canonical tag on any of the 30 pages.** Combined with `/index.html`
   serving 200, the homepage is genuinely duplicated. Fixed in the new
   `BaseLayout`.
2. **The footer hours link points at AES Truck Repair in Springfield, MO**
   (`maps/place/AES+Truck+Repair/@37.2378218,-93.3674019`). Homepage only,
   attached to the clock icon. This is the item flagged in the Phase 6 QA task;
   the correct listing is now the single `mapsUrl` in `src/site.config.ts`.
3. **The favicon is Dieselmatic's**, served from the agency's own Webflow CDN
   bucket (`dieselmatic-icon-256x256.png`). The site is advertising its former
   agency in every browser tab.
4. **Five different phone formats** across the site: `(704) 392-9938`,
   `704-392-9938`, `704 392 9938`, `7043929938`, `+17043929938`. Phase 4
   requires NAP byte-identical to the GBP; the new build renders every instance
   from one constant and CI fails on drift.
5. **Business name mismatch.** The site says "EagleSpan Corporation"; the linked
   Google listing says "Eagle Span Corporation" (two words). One of these is
   wrong and it is the kind of inconsistency that quietly suppresses local
   ranking. **Resolved in Phase 2** (ClickUp 86bbw0ecw): two words, matching the
   listing. The Webflow spelling was the drift. `src/site.config.ts` carries it
   and `verify:jsonld` fails the build on drift.
6. **Geo drift.** On-page JSON-LD carries `35.2705919 / -80.83994129999999`;
   the Maps listing and the Phase 4 spec carry `35.270506 / -80.839889`. Using
   the listing's values.
7. **Typo in the live JSON-LD description**: "vehciles".
8. **No schema on any service or repair page.** Only the homepage
   (`AutoRepair`) and the articles (`BlogPosting`) carry JSON-LD. All 14
   service/repair pages have none — Phase 4 adds `Service` nodes throughout.
9. **Placeholder testimonial attribution.** The homepage testimonial renders
   the literal string "Position, Company name" above the reviewer name. This is
   the wrong-attribution item in the Missing Content list.
10. **`/service` and `/repair` are orphans.** Both are in the sitemap; neither
    is linked from any of the 30 pages. Every page links to the 14 children
    directly, so the two index pages accumulate no internal link equity.

## Page weight baseline

For the Phase 6 comparison: every page loads the same shared Webflow CSS
bundle, and templates carry 32–45 `<img>` elements each regardless of what is
visible. Alt text is present throughout (0 missing) — the one thing the
previous build got right, and content parity must preserve it.
