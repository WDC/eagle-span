# Phase 3 — content migration

Every page on the live site now has its copy in this repo. 73 content entries:
5 services, 9 repairs, 7 articles, 2 legal pages, 9 singletons, 35 FAQs, 3
testimonials and 3 accounts. `bun run build` produces 32 pages against the 30
the crawl found, and the two extra are `/fleet` and `/404`.

Nothing here changed a schema, a template or a URL. Phases 1, 2 and 4 built the
shape; this phase filled it, and the fact that it filled without a schema change
is the useful result — the bounds in `src/content.config.ts` were guesses when
they were written and they held.

## What "migrated" means here

The copy is the live site's, not a rewrite of it. What was changed, and why:

* **The NAP came out of the prose.** Every service and repair page ended with a
  heading of the form "Schedule Your Axle Repairs Today: 704-392-9938" and
  repeated the number in the paragraph under it. That is 14 pages × 2 hand-typed
  phone numbers, in the format that is not the Google Business Profile's. They
  are now `{% phone %}`, `{% hours %}` and `{% address %}`, and the heading is a
  `{% cta %}`.
* **US spelling throughout.** Two of the articles are written in British English
  — "tyre", "centreline", "manoeuvres", "labour", "sulphation" — mixed with US
  spelling in the same paragraph. Normalized to US, which is what the rest of
  the site and the audience use.
* **Typography.** Straight quotes, double spaces after full stops, `4/32"` for
  an inch measurement, `21 °C` without a non-breaking space. `bun run
  lint:typography` finds all of these and it now passes on 107 files.
* **Length.** Four article titles and four meta descriptions were over the
  schema's bounds. See below.
* **Nothing else.** Where the live copy said a thing, this copy says the same
  thing. Where it was vague, it is still vague — inventing a specific is how a
  migration starts making claims the business has to honour.

## Titles and descriptions past the bound

`seo.title` is capped at 70 characters *before* the brand suffix, and
`seo.description` at 165. Phase 4 predicted four article titles would need
rewriting; it was exactly four.

| Page | Live title | Rendered | Now |
| --- | --- | --- | --- |
| `alternator-vs-battery` | 83 | 96 | 45 |
| `how-misalignment-eats-tires` | 87 | 100 | 41 |
| `5-diesel-battery-mistakes` | 77 | 90 | 46 |
| `from-u-joints-to-axle-shafts` | 77 | 90 | 48 |

In every case the **H1 is unchanged** — `title` and `seo.title` are separate
fields precisely so a page can keep the heading a reader arrived for while the
search result stays inside the truncation. The four descriptions over 165 (one
at 289) were rewritten to the same rule.

The 14 service and repair descriptions were rewritten rather than migrated,
because the live ones are template output: "provides professional Fleet Services
services", "provides professional Battery Services services". The doubled word
is on both, and `/service` opens "EagleSpan Corporation provide". They were
never written, so there was nothing to preserve.

## Defects found, beyond the Phase 0 list

Phase 0 crawled the markup. Reading the copy turned up more.

1. **Both legal pages belong to another business.** `/company/privacy-policy`
   and `/company/terms-conditions` are an unedited template naming **AES Truck
   Repair, 2190 N Westgate Ave, Springfield, MO 65802**, with the site defined
   as "accessible from aestruckrepair.com" and the contact address
   `aestruckrepair@gmail.com`. The terms leave the governing-law clause as the
   literal string `CITY, STATE/PROVINCE, COUNTRY`.

   This is the same AES Truck Repair the Phase 0 crawl found behind the
   homepage's hours link — the agency built this site from an AES template and
   changed the parts that were visible. A privacy policy naming the wrong
   controller is not a copy defect, so neither page was migrated. Both were
   rewritten from scratch to describe what this site actually does, which is
   very little: no cookies, no analytics, no third-party requests at all, and
   one form. **Neither has been through legal review** — see *Before cutover*.
2. **The About H1 reads "About EagleSpan Corportation".** A typo in the largest
   text on the page.
3. **"We have served the Greater Charlotte area since 1998 (26 years now)."**
   The parenthetical was right when it was typed and has been wrong since. The
   migrated copy says "since 1998" and lets the reader do the arithmetic; the
   homepage stat rail says the same thing in a field nobody has to remember to
   update.
4. **The footer's "Follow us" heading has no links under it.** There is no
   social profile anywhere in the markup, which is why `settings.social` is
   still `[]` rather than being a Phase 3 gap.
5. **The name spelling question is settled by the Maps listing.** The homepage
   links `maps/place/Eagle+Span+Corporation` — two words — while every visible
   string on the site says "EagleSpan". `src/site.config.ts` already made that
   call; this is the evidence for it.
6. **Two services are sold on the index page and have no page.** `/service`
   offers welding and fabrication, and RV work, in its body copy and its FAQs.
   Neither is in the five-service collection. The copy for both is now on the
   services index, where the live site put it, and a decision about whether
   either deserves its own page is a content decision rather than a migration
   one.

## FAQs: 35 entries from 60-odd questions

Every service and repair page carries four to five FAQs, and two of them are the
same on all 14 pages.

* **"What areas do you serve?"** is byte-identical across the site. It is one
  entry, referenced 14 times. That is what a shared `faqs` collection is for,
  and it is also the difference between one edit and fourteen.
* **"How can I get in touch?"** was dropped everywhere. Every instance is a
  restatement of the phone number in prose — the exact thing rule 1 of the
  content model exists to stop, and it would have put a hand-typed NAP into an
  `acceptedAnswer` in the FAQPage graph, where a crawler reads it. The pages end
  with a `{% cta %}` and the NAP tags instead.

That leaves 33 substantive questions plus the shared one plus the general "what
do you work on", which is 35.

## Testimonials and accounts

Three Google reviews, transcribed from the rail the live site renders on every
page; three national account names, transcribed from the logo band on the
homepage. Both collections have a `NOTES.md` recording exactly what the source
was and what was deliberately left empty — no `role` or `company` on the
reviews, no `logo`, `url` or `note` on the accounts.

The live rail renders the literal string "Position, Company name" above every
reviewer's name. That placeholder is why the schema makes those fields optional,
and it does not survive the migration.

## `/fleet` and `/services/fleet-services`

Phase 4 flagged these as competing for one query and said the honest options
were to make the distinction real or to fold `/fleet` away. The distinction is
real, and the material for it was already on the live homepage:

* **`/services/fleet-services`** is the work — brakes, suspension, tires,
  transmissions, the PM intervals. It is the live page, migrated.
* **`/fleet`** is the arrangement — national account billing through Michelin,
  Bridgestone and Yokohama, scheduling a yard rather than a truck, and an
  alignment cadence tied to PM intervals. The national account band is on the
  live homepage and nowhere else, and the `accounts` field on the fleet
  singleton was built for it in Phase 1.

Each page links to the other and says which is which, in copy rather than in a
comment. No redirect row was added, because no URL was folded.

## The article archive is not consolidated

Phase 1 built `supersededBy` for this and Phase 0 said the decision depends on
the Search Console export, which is still blocked on the property transfer from
Dieselmatic. It is still blocked, so no article was folded and
`supersededBy` is unused.

The candidate is real: `/articles/welcome-to-our-article-section` is a 2024
"welcome to our blog" post that promises regular articles the shop did not
publish for six months, and it duplicates no other page because it is about
nothing. It was migrated in full anyway.

**The decision rule, for when the export lands:** if the intro article has
earned impressions or an external link, keep it and leave it alone. If it has
neither after 16 months of data, point `supersededBy` at the articles index —
which sets `seo.canonical` and the redirect row from one edit — rather than
deleting a URL that costs nothing to keep.

## Before cutover

* **The two legal pages need review by the business.** They are accurate
  descriptions of what this website does, written to replace another company's
  policy, and they name North Carolina as the governing law because that is
  where the business is. They are not legal advice and nobody qualified has read
  them. This is the one item in Phase 3 that a person other than a developer has
  to sign off.
* **The privacy policy describes the Phase 5 contact form** as though it exists,
  because it will by the time the site is public. If Phase 5 changes what the
  form collects, that section changes with it.
* **Confirm the national accounts.** Michelin, Bridgestone and Yokohama are
  transcribed from a logo band. Naming a billing network is a claim a fleet
  customer acts on.
* **Confirm the stat rail.** "7 service bays" and "since 1998" are the live
  site's own numbers, and "since 1998" is the one the live site already got
  wrong once.
* **Hero images are still unexercised.** Every routed template renders
  `hero`/`heroAlt` and no entry has one, because the asset export is still
  blocked on the Webflow hosting item. Phase 2 noted the homepage hero image
  *replaces* the thrust-angle diagram rather than stacking under it; that is
  still the behaviour and it is still untested against a real photograph.

## What Phase 5, 6 and 7 inherit

* **`formIntro` and `formSuccess` are written**, on the contact singleton, so
  Phase 5's function renders copy an editor owns rather than strings inside a
  handler.
* **`careers.openings` is empty and the page says so**, in a callout, because
  the live site lists no roles. The JobPosting side of the graph therefore has
  nothing to render, which is correct rather than missing.
* **Every internal link in body copy is a real page.** The articles link to the
  service and repair pages that cover the work they describe, and back. That is
  the fix for Phase 0 defect 10 working at the content level rather than only in
  the header.
* **`data/url-inventory.csv` is unchanged.** It is the record of what the live
  site looked like on 2026-09-07, and Phase 6 compares against it. Rewriting it
  to match the new build would delete the comparison.
