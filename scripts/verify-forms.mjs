#!/usr/bin/env node
/**
 * The built forms match the manifest, and they work with no JavaScript.
 *
 * `src/lib/forms/fields.ts` is read by the component that renders the form and
 * by the function that validates it, so those two cannot drift from each other.
 * What that arrangement cannot catch is the third party: the *page*. A form
 * whose component is correct still ships broken if the page never rendered it,
 * if a field was dropped in a refactor, or if the `method` came off the element
 * — and every one of those failures looks fine in a browser with scripting on,
 * because the enhancement submits it anyway.
 *
 * That is the gap this gate covers. It reads the built HTML, not the source:
 *
 *   1. Every form the manifest declares is on the page that is supposed to
 *      carry it, with `method="post"` and the right `action` and `enctype`.
 *   2. Every field is present, with the name, the required flag and the bounds
 *      the manifest gives it. A field the validator enforces and the page never
 *      renders is a question the reader is never asked.
 *   3. The honeypot is there and is not reachable.
 *   4. The success page the endpoint redirects to exists in the build, and the
 *      failure fragment it redirects to is an element on the form page.
 *   5. Every `tel:` link on the site carries the click-to-call hook. This is
 *      the headline conversion for this business and it is not measurable if
 *      one template writes the link a different way.
 *
 * Run after `bun run build`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

import { staticRoot } from './lib/dist.mjs';

import { FORMS, HONEYPOT_FIELD, KIND_FIELD, TIMING_FIELD } from '../src/lib/forms/fields.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = staticRoot(root);

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  ✗ ${message}`);
};

if (!existsSync(dist)) {
  console.error('dist/ is missing. Run `bun run build` first.');
  process.exit(1);
}

/** Which page carries which form. The endpoint redirects back to these. */
const PLACEMENTS = [
  { kind: 'service', file: 'contact/index.html', path: '/contact' },
  { kind: 'careers', file: 'company/careers/index.html', path: '/company/careers' },
];

const ENDPOINT = '/api/contact';
const THANKS = 'contact/thanks/index.html';
const PROBLEM_ID = 'form-problem';

/** The attribute a click-to-call link is measured by. */
const CALL_HOOK = 'data-conversion="call"';

function read(relPath) {
  const full = resolve(dist, relPath);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf8');
}

/**
 * The one `<form>` on the page that posts to the endpoint.
 *
 * Sliced out rather than parsed: the check is about attributes and field names
 * being present in a document this build just produced, and a DOM parser is a
 * dependency for a substring search. The slice is anchored on the opening tag
 * that carries the endpoint, so a second form elsewhere on the page cannot
 * satisfy a check about this one.
 */
function formMarkup(html, kind) {
  const open = html.indexOf(`data-form="${kind}"`);
  if (open === -1) return null;
  const start = html.lastIndexOf('<form', open);
  const end = html.indexOf('</form>', open);
  if (start === -1 || end === -1) return null;
  return html.slice(start, end);
}

for (const { kind, file, path } of PLACEMENTS) {
  const spec = FORMS[kind];
  const html = read(file);
  if (html === null) {
    fail(`${file} is not in the build, so the ${kind} form has nowhere to be`);
    continue;
  }

  const form = formMarkup(html, kind);
  if (form === null) {
    fail(`${path} does not render the ${kind} form`);
    continue;
  }

  // A form that only submits through fetch is a form that does not submit.
  if (!/\bmethod="post"/i.test(form)) fail(`${path}: the ${kind} form has no method="post"`);
  if (!form.includes(`action="${ENDPOINT}"`)) fail(`${path}: the ${kind} form does not post to ${ENDPOINT}`);
  if (!form.includes('enctype="multipart/form-data"')) {
    fail(`${path}: the ${kind} form is not multipart, so an upload cannot reach the endpoint`);
  }

  // The kind has to survive a POST that carries nothing else to identify it.
  if (!new RegExp(`name="${KIND_FIELD}"[^>]*value="${kind}"`).test(form)) {
    fail(`${path}: the ${kind} form does not carry its form kind`);
  }
  if (!form.includes(`name="${TIMING_FIELD}"`)) {
    fail(`${path}: the ${kind} form has no ${TIMING_FIELD} field, so the timing trap has no signal`);
  }

  if (!form.includes(`name="${HONEYPOT_FIELD}"`)) {
    fail(`${path}: the ${kind} form has no honeypot`);
  } else if (!form.includes('tabindex="-1"')) {
    fail(`${path}: the honeypot is in the tab order, which puts it in a reader's way`);
  }

  for (const field of spec.fields) {
    if (!form.includes(`name="${field.name}"`)) {
      fail(`${path}: the ${kind} form is missing the "${field.name}" field the validator enforces`);
      continue;
    }

    /*
     * The required flag has to agree in both directions. Required in the
     * manifest and optional in the markup means the reader is bounced by the
     * server for something the page never asked; the reverse means a field
     * the browser blocks on that the server would have accepted.
     */
    const control = new RegExp(`name="${field.name}"[^>]*>`, 'g');
    const rendered = [...form.matchAll(control)].map((match) => match[0]);
    const anyRequired = rendered.some((tag) => /\brequired\b/.test(tag));
    if (field.required !== anyRequired) {
      fail(
        `${path}: "${field.name}" is ${field.required ? 'required' : 'optional'} in the manifest ` +
          `and ${anyRequired ? 'required' : 'optional'} in the markup`,
      );
    }

    if ((field.kind === 'text' || field.kind === 'textarea') && !rendered.some((tag) => tag.includes(`maxlength="${field.max}"`))) {
      fail(`${path}: "${field.name}" does not carry the manifest's maxlength of ${field.max}`);
    }

    if (field.kind === 'select' || field.kind === 'radio') {
      for (const option of field.options) {
        if (!form.includes(`value="${option.value}"`)) {
          fail(`${path}: "${field.name}" is missing the option "${option.value}"`);
        }
      }
    }
  }

  // Where the endpoint sends a no-script reader when it could not take the form.
  if (!html.includes(`id="${PROBLEM_ID}"`)) {
    fail(`${path}: no #${PROBLEM_ID} element, so a failed submission lands on nothing`);
  }
}

if (read(THANKS) === null) {
  fail(`${THANKS} is not in the build, so a successful submission redirects to a 404`);
}

/*
 * Click-to-call, across the whole build.
 *
 * The phase brief puts this ahead of form fills as the conversion that matters
 * for this business, and the site has no analytics platform yet — the GA4
 * transfer is still open (ClickUp 86bbw07b7). What can be gated today is that
 * every call link is marked the same way, so whatever lands later binds to one
 * selector rather than to fourteen templates. See docs/phase-5-forms.md.
 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

let callLinks = 0;
for (const file of walk(dist)) {
  const html = readFileSync(file, 'utf8');
  for (const tag of html.match(/<a\b[^>]*href="tel:[^"]*"[^>]*>/g) ?? []) {
    callLinks += 1;
    if (!tag.includes(CALL_HOOK)) {
      fail(`dist/${relative(dist, file)}: a tel: link with no ${CALL_HOOK} — ${tag.slice(0, 120)}`);
    }
  }
}

if (callLinks === 0) fail('no tel: links in the build at all, which cannot be right');

console.log(
  `\nforms: ${PLACEMENTS.length} forms, ` +
    `${PLACEMENTS.reduce((n, p) => n + FORMS[p.kind].fields.length, 0)} fields, ` +
    `${callLinks} call links, ${failures} problem${failures === 1 ? '' : 's'}.`,
);
if (failures) process.exit(1);
