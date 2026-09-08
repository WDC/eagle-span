# Phase 5 — forms, spam screening, and the lead mirror

ClickUp [86bbw0819](https://app.clickup.com/t/86bbw0819). Two forms, one
serverless function, four spam layers, and every submission written to two
places because email is not storage.

This is the phase that spends the property Phase 1 bought. The deployed site had
no serverless function at all, which is what made `script-src 'self'` honest and
what `verify:static-build` existed to protect. A contact form cannot be
delivered that way. So the phase spends exactly one function and re-gates the
property around it, and most of what follows is about which of the old
guarantees survived and which had to be rewritten.

## The one rule

**A lost lead costs more than a received spam.**

This is a truck shop. One missed message about a unit that is down is a
four-figure job, and the recipient is a person reading an inbox rather than an
automated pipeline that spam would poison. Every judgement call in this phase
resolves the same way: a doubtful submission is delivered and marked, not
refused. The only things refused outright are submissions that could not
plausibly have come from a person.

That rule is why the spam layers fail open, why an outage at Cloudflare or
Upstash does not close the form, and why a submission with no Turnstile token
still gets through.

## What the reader gets

| Page | Form | Fields |
| --- | --- | --- |
| `/contact` | Service request | Name, company, phone, email, vehicle type, unit number, VIN, symptom, urgency, date, photo |
| `/company/careers` | Application | Name, phone, email, experience, résumé |
| `/contact/thanks` | — | Where a submission lands with no JavaScript |

Both post to `/api/contact`. They are two shapes of one transaction — somebody
writing to the shop — and splitting them would have doubled the spam screening,
the delivery fan-out and the surface being gated, to save a `switch`.

## It works with no JavaScript

Not as a fallback. As the design.

The form is a real `method="post"` to a real `action`, with `required`,
`maxlength`, `pattern` and `type` doing the client-side validation a browser
already does better than a script would. On the way back the endpoint answers
two clients from the same code path:

* **No script.** 303 to `/contact/thanks` on success, or to
  `/contact#form-problem` on failure. POST-redirect-GET, so a refresh does not
  re-send the message.
* **Script.** The same body with `Accept: application/json`, answered with JSON,
  so a reader who mistyped their email keeps the four paragraphs they just
  wrote instead of getting them back through the browser's history.

The script adds three things and removes none: the timestamp the timing trap
reads, the Turnstile widget, and inline errors. If it fails to load, the form
still submits.

### Showing a server-side result on a static page

The failure landing is the interesting part. `/contact` is a static file, so it
cannot read `?error=1` without script, and there is no server render to put a
message into. The endpoint redirects to `#form-problem` instead, and the panel
is `display: none` until it is the `:target`:

```css
.form__problem { display: none; }
.form__problem:target { display: block; }
```

The message appears exactly once, for the reader it happened to, and never on a
fresh page load. No script, no query string, no cache problem.

It says one thing — *that did not go through, here is the number* — because the
two cases that reach it are a spam rejection, which must not explain itself to
the thing it caught, and a delivery failure, which the reader cannot act on
except by calling. **A rejection and a failure are deliberately
indistinguishable from outside.**

### Down now is a call, not a form

Choosing "Down now" reveals the phone number, through `:has()` on the checked
radio rather than a script:

```css
.form__form:has(input[value='down-now']:checked) .form__urgent { display: flex; }
```

It appears at the moment the number matters, rather than after the reader has
typed four more answers into a form that will be read during shop hours.

## One manifest, three readers

`src/lib/forms/fields.ts` declares what a form asks. Three things read it and
none of them restates it:

1. `Form.astro` renders the markup, including every validation attribute.
2. `validate.ts` enforces the same rules server-side.
3. `verify:forms` checks the built HTML carries what the manifest declares.

The failure this prevents is specific and quiet: a field renamed in the template
while the validator keeps checking the old key. Nothing errors. The submission
still arrives — just without the one answer the shop needed. Same shape as
`markdoc-tags.ts` and `verify:content` in Phase 1.

The third reader is the one worth explaining. The manifest keeps the component
and the endpoint honest with each other, but it cannot catch the *page* — a
form that was never rendered, or a `method` lost in a refactor. Those look fine
in any browser with scripting on, because the enhancement submits it anyway.
`verify:forms` reads `dist/` and asserts the form is there, posts, is
multipart, carries every field with the manifest's `required` and `maxlength`,
has an unreachable honeypot, and that `/contact/thanks` exists to redirect to.

## The four spam layers

| Layer | Catches | Costs a real lead when |
| --- | --- | --- |
| Honeypot | Anything that fills every input | A password manager fills it |
| Timing | Anything that submits instantly | Nothing |
| Turnstile | Anything without a real browser | Scripting is off |
| Rate limit | The same source, repeatedly | A yard sends five trucks in |

They run in cost order — the free checks before the network ones — so a filled
honeypot never costs a request to Cloudflare.

**The honeypot** is a real text input called `website`, not `type="hidden"`: a
bot that skips hidden inputs still fills a visible one with that name. It is
moved off-canvas rather than `display: none`, because a bot reading computed
style skips what is not displayed. Out of the tab order, `aria-hidden`, and
`autocomplete="off"` so a password manager does not fill it on the reader's
behalf and cost them their message.

**The timing trap** has an honest limitation. The page is static and cached, so
there is no per-render token to embed — a build-time timestamp would say the
same thing to every visitor for a week. The stamp is written by script on load,
which means a reader with no JavaScript sends none, and so does a bot that
simply omits the field. **Absent is therefore not a failure.** Treating it as
one would refuse every no-script submission, which is exactly the reader this
phase promised to keep. The trap catches the bots that do fill it.

**Turnstile** is the same shape of compromise, one step further. It needs
JavaScript to produce a token at all, so requiring one would quietly make
scripting mandatory for reaching this shop. A missing token is "no signal": the
submission is delivered, marked `unverified` in the subject line and on the
ClickUp task, and held to the stricter rate limit. A token Cloudflare actively
*rejects* is refused — that is a real negative rather than an absent positive.

A network failure against Cloudflare also reads as no signal, because the
alternative is that an outage at a third party silently stops a truck shop
receiving work.

**The rate limit** is a fixed window in Upstash Redis over its REST API, keyed
on the client address and nothing else — no cookie, no fingerprint, and the key
expires with the window, so the limiter holds no record of who wrote in. Two
ceilings:

| | Limit | Window |
| --- | --- | --- |
| Turnstile vouched for it | 5 | 10 minutes |
| It could not | 3 | 1 hour |

The generous one is for the dispatcher sending in a yard of trucks. The strict
one is the compromise that lets the no-script path stay open without leaving it
unmetered.

Unconfigured means unlimited, deliberately: a limiter nobody set up must not be
the reason a customer cannot reach the shop.

## Every submission goes to two places

`Every submission mirrors to the Leads list` is in the phase brief, and the
reason is worth keeping. **Email is not durable storage.** It is a notification
that happens to be archived by whoever received it, and it is filtered,
forwarded, deleted and left unread by people who are under a truck at the time.

So a lead is attempted against both destinations, independently, and the
endpoint reports success if **either** worked:

* **Resend** sends plain text — read on a phone in a shop, no rendering
  question, and nothing to escape. `reply_to` is the sender, so hitting reply
  answers the customer. A down truck and an unverified sender are both flagged
  in the subject.
* **ClickUp** creates a task in the Leads list (`901420338460`), named
  `Lead — {who} · {what}` to match the convention already on that board, with
  urgency mapped to ClickUp's priority rather than a tag, because priority is
  what a list sorts by.

A lead that reached the board and not the inbox is a lead, and the reader is not
told to call back when the shop already has it. Both failing is the one real
failure, and it answers 502 rather than a thank-you page.

Nothing configured at all is the third case, and it is the one the reader is
told the truth about: 503, and the phone number.

## Uploads: one deviation from the brief, on purpose

The brief says a photo goes up through **a Vercel Blob presigned PUT**. It does
not. The file is posted with the rest of the answers as `multipart/form-data`
and written to Blob server-side.

A presigned PUT is a JavaScript handshake — get a token from a route, then PUT
to storage. A form that can only take a photo when scripting is available is not
the progressively enhanced form this phase is supposed to ship, and the photo of
a cracked hub is exactly the attachment worth keeping. Posting it with the form
works in a browser with no scripting at all, needs no client library and no
`connect-src` opening.

The cost is Vercel's request body limit, which is why the manifest caps uploads
at 4 MB. At phone-photo and résumé sizes that is not the binding constraint.

Two other decisions: the uploader's filename is kept only as a label on the
lead, never as part of the stored path, so nothing a sender types becomes a URL;
and a failed upload does not fail the lead, because the answers *are* the lead
and the photo was optional. The log says it happened and the message says the
file is missing rather than pretending there was none.

## What this cost the Phase 1 guarantees

### The build is no longer flat

One on-demand route splits Astro's output into `dist/client/` for the files and
`dist/server/` for the function, which the adapter then moves into
`.vercel/output/`. That moved the ground under **every gate that reads the
build** — the sitemap check, the JSON-LD check, the redirect check, the motion
check and the link check were all resolving against a directory that now
contains one subdirectory.

`scripts/lib/dist.mjs` answers "where is the static site" once, and the gates
ask it. The `existsSync` branch in it is not defensiveness about today's layout;
it is what keeps them correct if the last on-demand route is ever removed.

### `verify:static-build` had to get sharper

The old claim was "there are no functions". The new one is "there is one, and
only these routes reach it" — and the adapter bundles *every* on-demand route
into a single `_render.func`, so counting functions would never notice a second
one. The routing table is where a new dynamic route actually appears, so that is
what is now checked:

```
^/api/contact$              the contact endpoint
^/_server-islands/([^/]+?)$ the adapter's, emitted whether or not one is used
^/_image$                   Astro's image endpoint
```

Anything else routed to a function fails the build. Shipping a second endpoint
means editing that list, in a diff somebody reviews.

### The CSP grew by one origin, and was missing one

`script-src` is no longer `'self'` alone: Turnstile needs a script, a frame and
a fetch back to `challenges.cloudflare.com`. That is the only third-party script
on the site and the only reason `frame-src` exists — the Maps iframe is still
not here and is not coming.

While editing it: **`img-src` was wrong.** Phase 4.5 put placeholder photography
on every page from `picsum.photos` and left `img-src` at `'self' data: blob:`,
so on a deployed origin every placeholder was blocked and only the badge
rendered. It reads as fine locally, because the CSP lives in `vercel.json` and
nothing serves it under `astro dev`. Both picsum origins are in `img-src` now,
and both go when `src/lib/placeholders.ts` does.

### `no-console` is off for the endpoint

That rule is about the browser, where a log line is noise nobody sees. On a
function it inverts: the platform log is the only record that a lead arrived,
which layers screened it and which destinations took it. Scoped to
`src/pages/api/**`.

### The typography gate had a blind spot

`<style>` and `<script>` blocks in a component were being linted as copy, so a
BEM modifier (`.form__field--wide`) was reported as a missing em dash. Nothing
had tripped it because no `.astro` style block had used a `--` modifier before.
They are treated as code now, the same way the frontmatter fence already was.

## Click-to-call, which is only half done

The brief is right that this is the headline mobile conversion for this
business, ahead of form fills. Somebody whose truck is down calls; they do not
fill in a form.

**There is nowhere to send the event.** The site has no analytics platform: the
GA4 property transfer is an open blocker ([86bbw07b7](https://app.clickup.com/t/86bbw07b7)),
and the design carries no third-party scripts. Inventing a destination — beacons
into a log nobody reads, a counter with no store behind it — would be motion
rather than measurement.

What is done is the half that has to be right before any of that works: every
`tel:` link on the site carries `data-conversion="call"`, and `verify:forms`
fails the build if one does not. There are 168 of them across the build, from
the masthead, the footer, the sticky action bar, every offering page and both
forms. Whatever analytics lands binds to one selector rather than to fourteen
templates, and a new template cannot quietly add an unmeasured call link.

The event itself is Phase 6 or Phase 7 work, once the analytics decision is
made.

## Configuration

Everything is optional at runtime and the site builds with none of it set. What
changes is how much the form can do. `src/lib/forms/env.ts` reports the state on
every request, in the log line.

| Variable | Kind | Unset means |
| --- | --- | --- |
| `PUBLIC_TURNSTILE_SITE_KEY` | Build-time, public | No widget; every submission is `unverified` |
| `TURNSTILE_SECRET_KEY` | Runtime secret | Tokens are not verified |
| `RESEND_API_KEY` | Runtime secret | No email |
| `LEAD_FROM_EMAIL` | Runtime | No email |
| `LEAD_TO_EMAIL` | Runtime | No email |
| `CLICKUP_API_TOKEN` | Runtime secret | No lead on the board |
| `CLICKUP_LEADS_LIST_ID` | Runtime | No lead on the board |
| `UPSTASH_REDIS_REST_URL` | Runtime | No rate limit |
| `UPSTASH_REDIS_REST_TOKEN` | Runtime secret | No rate limit |
| `BLOB_READ_WRITE_TOKEN` | Runtime secret | Uploads are dropped, and said so in the lead |

The three email variables are all-or-nothing: an API key with no recipient sends
a lead into the void.

`PUBLIC_TURNSTILE_SITE_KEY` is the only one baked in at build, so changing it
needs a rebuild rather than a redeploy.

## What is blocked

**The mailbox does not exist yet.** `service@eaglespancorp.com` is
[86bbw07dr](https://app.clickup.com/t/86bbw07dr), still open, and Resend also
needs the sending domain verified — which needs DNS, which needs the registrar
confirmation in [86bbw07dc](https://app.clickup.com/t/86bbw07dc). Until both
land, `LEAD_TO_EMAIL` and `LEAD_FROM_EMAIL` have nothing correct to be set to.

**This is survivable, and that is the point of the fan-out.** With ClickUp
configured and Resend not, a lead still reaches the shop — it lands on the board
instead of in the inbox, the log says `email:off clickup:on`, and nothing is
lost. The email is an addition when the mailbox lands, not a prerequisite.

## Gates

| Command | What it covers |
| --- | --- |
| `bun run verify:forms` | **new** — both forms in the built HTML, every field against the manifest, `method`/`action`/`enctype`, the honeypot out of the tab order, the redirect target built, and every `tel:` link carrying the conversion hook |
| `bun run verify:static-build` | …and now the *routing table*: one function, three routes, no others |
| `bun test` | 56 new tests: validation against the manifest, all four spam layers including every fail-open path, and the delivery fan-out including "either destination is enough" |

`verify:forms` is in `bun run check` and in the CI `gates` job.

## What Phase 6 and Phase 7 inherit

* **The endpoint has never delivered a real lead.** Every branch is verified —
  405 on GET, the honeypot and timing rejections, per-field errors, multipart
  uploads accepted and refused, and the no-destination 503 — but the success
  path is proven by unit tests with an injected `fetch`, because there is
  nothing to configure yet. The first configured deployment is the first real
  send, and it should be watched.
* **Turnstile is unconfigured, so the site is on the strict limit.** Three
  submissions per address per hour is right for an unverified sender and wrong
  as a permanent setting. Creating the widget and setting both keys moves it to
  five per ten minutes.
* **axe has two new surfaces.** Both forms: label association, the `:target`
  panel's `role="alert"`, the fieldset and legend on the urgency radios, the
  file inputs, and error text tied to fields by `aria-describedby`.
* **Lighthouse will see a third-party script** once Turnstile is configured,
  where it currently sees none. The 24-request third-party allowance is there
  for the placeholder photography and still has to go back to 0 with the real
  assets — Turnstile will need its own allowance, separately and deliberately.
* **`/contact/thanks` is a conversion URL.** It is `noindex` and out of the
  sitemap, and it is the one page whose pageview means a form was completed.
  Worth wiring as a goal when analytics lands.
