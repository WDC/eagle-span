/**
 * Where a submission goes: an email, a ClickUp task, and a blob for the file.
 *
 * The ordering matters and it is the reason the ClickUp mirror is in the phase
 * brief at all. **Email is not durable storage.** It is a notification that
 * happens to be archived by whoever received it, and it is filtered, forwarded,
 * deleted and left unread by people who are under a truck at the time. A lead
 * about a unit that is down is worth four figures; the record of it should not
 * live only in one person's inbox.
 *
 * So both destinations are attempted, independently, and the endpoint reports
 * success if **either** worked. A lead that reached the board but not the inbox
 * is a lead; one that reached neither is the only real failure.
 */

import type { ClickUpConfig, FormsEnv, ResendConfig } from './env.ts';
import type { FormSpec } from './fields.ts';
import type { ValidatedFile, ValidationSuccess } from './validate.ts';

export interface Lead {
  readonly spec: FormSpec;
  readonly submission: ValidationSuccess;
  /** False when Turnstile could not vouch for the sender. Carried into both destinations. */
  readonly verified: boolean;
  readonly receivedAt: Date;
  /** Where the reader was when they wrote in. */
  readonly sourcePath: string;
}

export interface DeliveryOutcome {
  readonly delivered: boolean;
  /** One phrase per destination attempted, for the log line. */
  readonly results: readonly string[];
  /** Blob URLs for whatever was uploaded, referenced from both destinations. */
  readonly uploads: readonly { readonly field: string; readonly filename: string; readonly url: string }[];
}

/** The one label that says a lead needs answering before the others. */
function isUrgent(lead: Lead): boolean {
  return lead.submission.values['urgency'] === 'down-now';
}

function subjectFor(lead: Lead): string {
  const who = lead.submission.values['company'] ?? lead.submission.values['name'] ?? 'Someone';
  const flags = [isUrgent(lead) ? 'DOWN NOW' : null, lead.verified ? null : 'unverified'].filter(
    (flag): flag is string => flag !== null,
  );
  const prefix = flags.length > 0 ? `[${flags.join(' · ')}] ` : '';
  return `${prefix}${lead.spec.title}: ${who}`;
}

/**
 * The body, as plain text.
 *
 * Text rather than HTML on purpose: this is read on a phone in a shop, it has
 * to survive every mail client without a rendering question, and there is
 * nothing in a lead that a label and a value cannot carry. It also means the
 * answers can be written verbatim without any escaping question — no markup,
 * nothing to inject into.
 */
function bodyFor(lead: Lead, uploads: DeliveryOutcome['uploads']): string {
  const lines = [
    `${lead.spec.title} from the website`,
    `Received ${lead.receivedAt.toISOString()}`,
    `Page: ${lead.sourcePath}`,
    '',
  ];

  for (const answer of lead.submission.answers) {
    const upload = uploads.find((file) => file.field === answer.name);
    lines.push(`${answer.label}: ${upload ? `${answer.value} — ${upload.url}` : answer.value}`);
  }

  if (!lead.verified) {
    lines.push(
      '',
      'Note: this submission carried no Turnstile token, so it could not be',
      'confirmed as coming from a browser. That is the expected state for a',
      'reader with JavaScript turned off, and it is also what a script looks',
      'like. Worth a glance before calling back.',
    );
  }

  return lines.join('\n');
}

async function sendEmail(
  config: ResendConfig,
  lead: Lead,
  uploads: DeliveryOutcome['uploads'],
  fetchImpl: typeof fetch,
): Promise<string> {
  const replyTo = lead.submission.values['email'];
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: config.to,
      subject: subjectFor(lead),
      text: bodyFor(lead, uploads),
      // So hitting reply in the inbox answers the customer, not the robot.
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`resend ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return 'email:sent';
}

/**
 * Mirrors the lead into the Leads list.
 *
 * The task name follows the convention already on that board — `Lead — {who} ·
 * {what}` — so a lead from the site sorts alongside one entered by hand.
 * Urgency maps to ClickUp's own priority rather than to a tag, because priority
 * is the field a list is sorted by.
 */
async function mirrorToClickUp(
  config: ClickUpConfig,
  lead: Lead,
  uploads: DeliveryOutcome['uploads'],
  fetchImpl: typeof fetch,
): Promise<string> {
  const who = lead.submission.values['company'] ?? lead.submission.values['name'] ?? 'Unknown';
  const what =
    lead.spec.kind === 'service'
      ? (lead.submission.answers.find((answer) => answer.name === 'vehicleType')?.value ?? 'Service')
      : 'Careers';

  const description = [
    ...lead.submission.answers.map((answer) => {
      const upload = uploads.find((file) => file.field === answer.name);
      return upload
        ? `**${answer.label}:** [${answer.value}](${upload.url})`
        : `**${answer.label}:** ${answer.value}`;
    }),
    '',
    `_Received ${lead.receivedAt.toISOString()} from ${lead.sourcePath}._`,
    lead.verified ? '' : '_No Turnstile token: unconfirmed as coming from a browser._',
  ]
    .filter((line) => line !== '')
    .join('\n\n');

  const response = await fetchImpl(`https://api.clickup.com/api/v2/list/${config.listId}/task`, {
    method: 'POST',
    headers: { authorization: config.token, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `Lead — ${who} · ${what}`,
      markdown_description: description,
      priority: isUrgent(lead) ? 1 : 3,
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`clickup ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return 'clickup:mirrored';
}

/**
 * Puts one upload in Vercel Blob and returns its URL.
 *
 * `addRandomSuffix` so two people sending `photo.jpg` do not overwrite each
 * other, and the pathname carries the date so the store is browsable a year
 * from now. The uploader's filename is kept only as a label in the lead — it is
 * not part of the stored path, so nothing a sender types becomes a URL.
 *
 * The REST API is called directly rather than through `@vercel/blob`, for the
 * same reason as Upstash: one PUT, and a dependency in the function is a
 * dependency in the thing `verify:static-build` is watching.
 */
async function putBlob(
  token: string,
  file: ValidatedFile,
  receivedAt: Date,
  fetchImpl: typeof fetch,
): Promise<string> {
  const day = receivedAt.toISOString().slice(0, 10);
  const extension = file.filename.includes('.') ? `.${file.filename.split('.').pop()}` : '';
  const pathname = `leads/${day}/${file.field}${extension}`;

  const response = await fetchImpl(`https://blob.vercel-storage.com/${encodeURI(pathname)}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'x-content-type': file.type,
      'x-add-random-suffix': '1',
      // Not public: a lead's photo is the customer's, and nothing links to it.
      'x-api-version': '7',
      'content-type': file.type,
    },
    body: file.bytes as unknown as BodyInit,
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`blob ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const result = (await response.json()) as { url?: string };
  if (!result.url) throw new Error('blob: no url in response');
  return result.url;
}

export async function deliver(
  env: FormsEnv,
  lead: Lead,
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryOutcome> {
  const results: string[] = [];
  const uploads: { field: string; filename: string; url: string }[] = [];

  /*
   * Uploads first, because both destinations reference the URLs. A file that
   * fails to store does not fail the lead: the answers are the lead, and the
   * photo was optional. The log says it happened and the email says the file
   * is missing rather than pretending there was none.
   */
  for (const file of lead.submission.files) {
    if (!env.blob) {
      results.push(`upload:${file.field}:no-store`);
      continue;
    }
    try {
      const url = await putBlob(env.blob.token, file, lead.receivedAt, fetchImpl);
      uploads.push({ field: file.field, filename: file.filename, url });
      results.push(`upload:${file.field}:stored`);
    } catch (error) {
      results.push(`upload:${file.field}:failed(${(error as Error).message})`);
    }
  }

  const attempts: Promise<string>[] = [];
  if (env.resend) attempts.push(sendEmail(env.resend, lead, uploads, fetchImpl));
  if (env.clickUp) attempts.push(mirrorToClickUp(env.clickUp, lead, uploads, fetchImpl));

  const settled = await Promise.allSettled(attempts);
  let delivered = false;
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      delivered = true;
      results.push(outcome.value);
    } else {
      results.push(`failed:${(outcome.reason as Error).message}`);
    }
  }

  return { delivered, results, uploads };
}

export const forTests = { subjectFor, bodyFor, isUrgent };
