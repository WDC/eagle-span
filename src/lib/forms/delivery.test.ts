import { describe, expect, test } from 'bun:test';

import { deliver, forTests, type Lead } from './delivery.ts';
import type { FormsEnv } from './env.ts';
import { FORMS } from './fields.ts';
import type { ValidationSuccess } from './validate.ts';

const submission: ValidationSuccess = {
  ok: true,
  answers: [
    { label: 'Your name', name: 'name', value: 'Dale Whitfield' },
    { label: 'Company', name: 'company', value: 'Whitfield Haulage' },
    { label: 'Vehicle type', name: 'vehicleType', value: 'Truck' },
    { label: 'What is it doing?', name: 'symptom', value: 'Air leak on the drive axle.' },
  ],
  values: {
    name: 'Dale Whitfield',
    company: 'Whitfield Haulage',
    email: 'dale@example.com',
    vehicleType: 'truck',
    urgency: 'scheduled',
    symptom: 'Air leak on the drive axle.',
  },
  files: [],
};

const lead: Lead = {
  spec: FORMS.service,
  submission,
  verified: true,
  receivedAt: new Date('2026-09-08T14:00:00.000Z'),
  sourcePath: '/contact',
};

const nothing: FormsEnv = {
  resend: null,
  clickUp: null,
  blob: null,
  turnstile: null,
  rateLimit: null,
};

const resend = { apiKey: 'key', from: 'site@example.com', to: ['shop@example.com'] };
const clickUp = { token: 'token', listId: '901420338460' };

/** A `fetch` that succeeds or fails per host, and records every call. */
function router(rules: Record<string, boolean>) {
  const calls: { url: string; body: unknown }[] = [];
  const impl = ((url: string, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, body: init?.body });
    const host = Object.keys(rules).find((key) => href.includes(key));
    const ok = host ? rules[host] : true;
    return Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve({ url: 'https://blob.example.com/leads/x.jpg' }),
      text: () => Promise.resolve(ok ? 'ok' : 'upstream said no'),
    } as Response);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('the subject line', () => {
  test('names the company, because that is what the shop recognises', () => {
    expect(forTests.subjectFor(lead)).toBe('Service request: Whitfield Haulage');
  });

  test('a down truck is flagged ahead of everything else', () => {
    const urgent = { ...lead, submission: { ...submission, values: { ...submission.values, urgency: 'down-now' } } };
    expect(forTests.subjectFor(urgent)).toContain('DOWN NOW');
  });

  test('an unverified submission says so, so the reader can judge it', () => {
    expect(forTests.subjectFor({ ...lead, verified: false })).toContain('unverified');
  });

  test('falls back to the person when there is no company', () => {
    const noCompany = { ...submission, values: { ...submission.values } };
    delete (noCompany.values as Record<string, string>)['company'];
    expect(forTests.subjectFor({ ...lead, submission: noCompany })).toContain('Dale Whitfield');
  });
});

describe('the body', () => {
  test('carries every answer, in the order the form asked', () => {
    const body = forTests.bodyFor(lead, []);
    expect(body).toContain('Your name: Dale Whitfield');
    expect(body).toContain('What is it doing?: Air leak on the drive axle.');
    expect(body.indexOf('Your name')).toBeLessThan(body.indexOf('Vehicle type'));
  });

  test('says when a submission could not be confirmed as a browser', () => {
    expect(forTests.bodyFor({ ...lead, verified: false }, [])).toContain('no Turnstile token');
    expect(forTests.bodyFor(lead, [])).not.toContain('no Turnstile token');
  });
});

describe('fanning out', () => {
  test('both destinations are attempted when both are configured', async () => {
    const { impl, calls } = router({});
    const outcome = await deliver({ ...nothing, resend, clickUp }, lead, impl);
    expect(outcome.delivered).toBe(true);
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.resend.com/emails',
      'https://api.clickup.com/api/v2/list/901420338460/task',
    ]);
  });

  /*
   * The rule the ClickUp mirror exists for. Email is not durable storage, so a
   * lead that reached the board and not the inbox is still a lead — and the
   * reader must not be told to call back when the shop already has it.
   */
  test('the board alone is enough when the mail fails', async () => {
    const { impl } = router({ 'api.resend.com': false });
    const outcome = await deliver({ ...nothing, resend, clickUp }, lead, impl);
    expect(outcome.delivered).toBe(true);
    expect(outcome.results.some((result) => result.startsWith('failed:'))).toBe(true);
    expect(outcome.results).toContain('clickup:mirrored');
  });

  test('and the inbox alone is enough when the board fails', async () => {
    const { impl } = router({ 'api.clickup.com': false });
    const outcome = await deliver({ ...nothing, resend, clickUp }, lead, impl);
    expect(outcome.delivered).toBe(true);
    expect(outcome.results).toContain('email:sent');
  });

  test('both failing is the one real failure', async () => {
    const { impl } = router({ 'api.resend.com': false, 'api.clickup.com': false });
    const outcome = await deliver({ ...nothing, resend, clickUp }, lead, impl);
    expect(outcome.delivered).toBe(false);
  });

  test('nothing configured attempts nothing and delivers nothing', async () => {
    const { impl, calls } = router({});
    const outcome = await deliver(nothing, lead, impl);
    expect(outcome.delivered).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('uploads', () => {
  const withPhoto: Lead = {
    ...lead,
    submission: {
      ...submission,
      answers: [...submission.answers, { label: 'Photo', name: 'photo', value: 'brakes.jpg' }],
      files: [
        {
          field: 'photo',
          filename: 'brakes.jpg',
          type: 'image/jpeg',
          size: 12,
          bytes: new Uint8Array(12),
        },
      ],
    },
  };

  test('a stored file is referenced from the message', async () => {
    const { impl } = router({});
    const outcome = await deliver({ ...nothing, resend, blob: { token: 'blob' } }, withPhoto, impl);
    expect(outcome.uploads).toHaveLength(1);
    expect(forTests.bodyFor(withPhoto, outcome.uploads)).toContain('https://blob.example.com/leads/x.jpg');
  });

  /*
   * The photo was optional and the answers are the lead. Losing the upload must
   * not lose the message that came with it.
   */
  test('a failed upload does not fail the lead', async () => {
    const { impl } = router({ 'blob.vercel-storage.com': false });
    const outcome = await deliver({ ...nothing, resend, blob: { token: 'blob' } }, withPhoto, impl);
    expect(outcome.delivered).toBe(true);
    expect(outcome.uploads).toHaveLength(0);
    expect(outcome.results.some((result) => result.includes('upload:photo:failed'))).toBe(true);
  });

  test('no blob store configured is recorded rather than silently dropped', async () => {
    const { impl } = router({});
    const outcome = await deliver({ ...nothing, resend }, withPhoto, impl);
    expect(outcome.results).toContain('upload:photo:no-store');
    expect(outcome.delivered).toBe(true);
  });
});
