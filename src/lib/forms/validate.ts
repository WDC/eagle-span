/**
 * Server-side validation, walking the same manifest the markup renders from.
 *
 * The browser already validated this: `required`, `type="email"`, `maxlength`
 * and `pattern` are on every input, and a browser will not submit a form that
 * fails them. That is the check the reader benefits from, because it happens
 * before the round trip and points at the field.
 *
 * This one exists because the browser's check is advice to a cooperating
 * client. Anything can POST to a public endpoint, so every rule the markup
 * asserts is asserted again here, from the same declaration — which is the
 * point of reading `FORMS` rather than restating the rules.
 *
 * It is deliberately pure: `FormData` in, a result out, no network and no
 * environment. That is what makes it the part of this phase with real unit
 * tests, and the endpoint's job is reduced to calling it.
 */

import {
  CONTROL_FIELDS,
  FORMS,
  type Field,
  type FormKind,
  type FormSpec,
} from './fields.ts';

export interface ValidatedFile {
  readonly field: string;
  readonly filename: string;
  readonly type: string;
  readonly size: number;
  readonly bytes: Uint8Array;
}

export interface ValidationSuccess {
  readonly ok: true;
  /** Answers in manifest order, ready to render into an email or a task. */
  readonly answers: readonly { readonly label: string; readonly name: string; readonly value: string }[];
  readonly values: Readonly<Record<string, string>>;
  readonly files: readonly ValidatedFile[];
}

export interface ValidationFailure {
  readonly ok: false;
  /** Field name to message. Logged, and returned to the scripted client. */
  readonly errors: Readonly<Record<string, string>>;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Collapses the whitespace a paste brings with it and strips control
 * characters, which are the ones that break an email header or a JSON body.
 * Not sanitisation — nothing here is interpolated into markup — just the
 * normalisation that keeps a value the same thing everywhere it is written.
 */
function clean(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    /*
     * C0 and C1 controls, keeping newline and tab, which a textarea
     * legitimately carries. The lint rule against control characters in a
     * regular expression is aimed at the ones that get there by accident; here
     * they are the subject.
     */
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
    .trim();
}

/** Deliberately permissive: one @, no spaces, a dot in the domain. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * At least seven digits, because that is the shortest thing that can be a
 * phone number, and no opinion about the format beyond that. A reader typing
 * their own number with the punctuation they use is not making a mistake.
 */
function looksLikePhone(value: string): boolean {
  return (value.match(/\d/g) ?? []).length >= 7;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validateText(field: Extract<Field, { kind: 'text' }>, value: string): string | null {
  if (value.length > field.max) return `Keep this under ${field.max} characters.`;
  if (field.type === 'email' && !EMAIL.test(value)) return 'That does not look like an email address.';
  if (field.type === 'tel' && !looksLikePhone(value)) return 'That does not look like a phone number.';
  if (field.type === 'date') {
    if (!ISO_DATE.test(value)) return 'Use the date picker, or write the date as YYYY-MM-DD.';
    if (Number.isNaN(Date.parse(value))) return 'That is not a real date.';
  }
  if (field.pattern && !new RegExp(`^(?:${field.pattern})$`).test(value)) {
    return 'That does not look right.';
  }
  return null;
}

/**
 * A `File` the runtime handed us, narrowed to the parts we use. Typed
 * structurally rather than as the DOM `File` so this module stays free of
 * `lib.dom` and can be tested with a plain object.
 */
interface UploadLike {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function isUpload(value: unknown): value is UploadLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'arrayBuffer' in value &&
    typeof (value as UploadLike).arrayBuffer === 'function' &&
    typeof (value as UploadLike).size === 'number'
  );
}

/**
 * `FormData` narrowed to what this module reads. The endpoint passes the real
 * one; a test passes a `Map`-backed stand-in.
 */
export interface FormDataLike {
  get(name: string): unknown;
  getAll(name: string): unknown[];
}

export async function validate(kind: FormKind, data: FormDataLike): Promise<ValidationResult> {
  const spec: FormSpec = FORMS[kind];
  const errors: Record<string, string> = {};
  const answers: { label: string; name: string; value: string }[] = [];
  const values: Record<string, string> = {};
  const files: ValidatedFile[] = [];

  for (const field of spec.fields) {
    if (field.kind === 'file') {
      const raw = data.get(field.name);
      // An empty file input still posts a zero-byte part; that is "not filled in".
      if (!isUpload(raw) || raw.size === 0) {
        if (field.required) errors[field.name] = 'This one is needed.';
        continue;
      }
      if (raw.size > field.maxBytes) {
        const mb = Math.round(field.maxBytes / (1024 * 1024));
        errors[field.name] = `That file is over ${mb} MB. Send it by email instead.`;
        continue;
      }
      /*
       * The browser's `accept` is a filter on the picker, not a guarantee, and
       * the reported type comes from the client. Checked anyway — it is the
       * cheap half — and the storage side is what makes a wrong type harmless:
       * uploads are written to a private blob with a generated name and are
       * never served back from this origin.
       */
      if (!field.accept.includes(raw.type)) {
        errors[field.name] = 'That file type is not one we can take.';
        continue;
      }
      files.push({
        field: field.name,
        filename: raw.name,
        type: raw.type,
        size: raw.size,
        bytes: new Uint8Array(await raw.arrayBuffer()),
      });
      answers.push({ label: field.label, name: field.name, value: raw.name });
      continue;
    }

    const raw = data.get(field.name);
    const value = typeof raw === 'string' ? clean(raw) : '';

    if (!value) {
      if (field.required) errors[field.name] = 'This one is needed.';
      continue;
    }

    if (field.kind === 'textarea') {
      if (value.length > field.max) {
        errors[field.name] = `Keep this under ${field.max} characters.`;
        continue;
      }
    } else if (field.kind === 'select' || field.kind === 'radio') {
      if (!field.options.some((option) => option.value === value)) {
        errors[field.name] = 'Pick one of the options.';
        continue;
      }
    } else if (field.kind === 'text') {
      const problem = validateText(field, value);
      if (problem) {
        errors[field.name] = problem;
        continue;
      }
    }

    values[field.name] = value;
    answers.push({
      label: field.label,
      name: field.name,
      value:
        field.kind === 'select' || field.kind === 'radio'
          ? (field.options.find((option) => option.value === value)?.label ?? value)
          : value,
    });
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, answers, values, files };
}

/**
 * Field names the manifest does not declare.
 *
 * Not a rejection — an extra part in a multipart body is what a browser
 * extension or a proxy adds, and refusing the submission over it would drop a
 * real lead to punish something the reader did not do. It is reported so the
 * log says why a mirrored lead looks different from the form.
 */
export function unknownFields(kind: FormKind, names: readonly string[]): readonly string[] {
  const known = new Set<string>([
    ...FORMS[kind].fields.map((field) => field.name),
    ...CONTROL_FIELDS,
  ]);
  return names.filter((name) => !known.has(name));
}
