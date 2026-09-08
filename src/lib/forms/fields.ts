/**
 * What a form asks, declared once.
 *
 * Two things need to agree about every field on this site: the markup that
 * renders it and the function that validates what comes back. When those two
 * are written separately they drift — a field gets renamed in the template and
 * the validator keeps checking the old key, which does not fail, it just
 * silently stops validating. The submission still arrives, missing the one
 * answer the shop needed.
 *
 * So the manifest is the source and both sides read it. `Form.astro` renders
 * from `FORMS[kind].fields`; `validate.ts` walks the same array. A field that
 * is not here cannot be rendered, and a field that is here cannot go
 * unvalidated. `scripts/verify-forms.mjs` closes the loop from the other end by
 * checking the built HTML actually carries every field the manifest declares —
 * the same shape as `markdoc-tags.ts` and `verify:content`.
 *
 * The labels are copy. They are short enough to live here rather than in the
 * content model, and unlike `formIntro`/`formSuccess` they are structural: an
 * editor renaming "Unit number" to something else would be renaming a field the
 * validator and the ClickUp mirror both key off.
 */

/** Every form on the site. The endpoint dispatches on this. */
export const FORM_KINDS = ['service', 'careers'] as const;
export type FormKind = (typeof FORM_KINDS)[number];

interface FieldBase {
  /** The `name` attribute, the validator key, and the ClickUp mirror label. */
  readonly name: string;
  readonly label: string;
  readonly required: boolean;
  /** Sits under the input. Says what a good answer looks like, not what the field is. */
  readonly help?: string;
  /** Fills the row rather than sharing it. */
  readonly wide?: boolean;
}

export interface TextField extends FieldBase {
  readonly kind: 'text';
  /** Maps to the input type, which is what drives the phone and email keyboards. */
  readonly type: 'text' | 'tel' | 'email' | 'date';
  readonly max: number;
  /** Native validation, so a wrong answer is caught before it is sent. */
  readonly pattern?: string;
  readonly autocomplete?: string;
}

export interface TextareaField extends FieldBase {
  readonly kind: 'textarea';
  readonly max: number;
  readonly rows: number;
}

export interface ChoiceField extends FieldBase {
  readonly kind: 'select' | 'radio';
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

export interface FileField extends FieldBase {
  readonly kind: 'file';
  /** The `accept` attribute, and the server-side allow list. */
  readonly accept: readonly string[];
  readonly maxBytes: number;
}

export type Field = TextField | TextareaField | ChoiceField | FileField;

/**
 * 4 MB, under Vercel's request body limit for a function.
 *
 * The upload arrives inside the form POST rather than through a presigned PUT,
 * which is the one deviation from the phase brief and is deliberate: a
 * presigned PUT is a JavaScript handshake, and a form that only accepts a photo
 * when scripting is available is not the progressively enhanced form this phase
 * is supposed to ship. Posting the file with the rest of the answers works in
 * a browser with no JavaScript at all, and at résumé and phone-photo sizes the
 * body limit is not the binding constraint. See docs/phase-5-forms.md.
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Non-required so a bad OCR or a hand-typed VIN cannot block a down truck. */
const VIN_PATTERN = '[A-HJ-NPR-Za-hj-npr-z0-9]{11,17}';

const name: TextField = {
  kind: 'text',
  type: 'text',
  name: 'name',
  label: 'Your name',
  required: true,
  max: 120,
  autocomplete: 'name',
};

const phone: TextField = {
  kind: 'text',
  type: 'tel',
  name: 'phone',
  label: 'Phone',
  required: true,
  max: 40,
  help: 'The number to call you back on.',
  autocomplete: 'tel',
};

const email: TextField = {
  kind: 'text',
  type: 'email',
  name: 'email',
  label: 'Email',
  required: true,
  max: 254,
  autocomplete: 'email',
};

/**
 * The service request.
 *
 * Ordered the way the shop asks it on the phone: who you are, what the unit is,
 * what it is doing, and when you need it. `urgency` sits last because the
 * answer to it changes what the page tells you to do next — "down now" is a
 * call, not a form, and the form says so.
 */
const serviceFields: readonly Field[] = [
  { ...name, autocomplete: 'name' },
  {
    kind: 'text',
    type: 'text',
    name: 'company',
    label: 'Company',
    required: false,
    max: 160,
    autocomplete: 'organization',
  },
  phone,
  email,
  {
    kind: 'select',
    name: 'vehicleType',
    label: 'Vehicle type',
    required: true,
    options: [
      { value: 'truck', label: 'Truck' },
      { value: 'trailer', label: 'Trailer' },
      { value: 'bus', label: 'Bus' },
      { value: 'rv', label: 'RV' },
      { value: 'heavy-equipment', label: 'Heavy equipment' },
    ],
  },
  {
    kind: 'text',
    type: 'text',
    name: 'unitNumber',
    label: 'Unit number',
    required: false,
    max: 60,
    help: 'Your own number for the unit, if it has one.',
  },
  {
    kind: 'text',
    type: 'text',
    name: 'vin',
    label: 'VIN',
    required: false,
    max: 17,
    pattern: VIN_PATTERN,
    help: 'Optional. Helps us pull the right parts before you arrive.',
  },
  {
    kind: 'textarea',
    name: 'symptom',
    label: 'What is it doing?',
    required: true,
    max: 4000,
    rows: 6,
    wide: true,
    help: 'What it is doing, whether it moved under its own power, and where it is now.',
  },
  {
    kind: 'radio',
    name: 'urgency',
    label: 'How urgent is it?',
    required: true,
    wide: true,
    options: [
      { value: 'down-now', label: 'Down now' },
      { value: 'scheduled', label: 'Scheduled work' },
    ],
  },
  {
    kind: 'text',
    type: 'date',
    name: 'preferredDate',
    label: 'Date you need it back',
    required: false,
    max: 10,
  },
  {
    kind: 'file',
    name: 'photo',
    label: 'Photo',
    required: false,
    accept: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
    maxBytes: MAX_UPLOAD_BYTES,
    help: 'Optional. A picture of the damage or the reading is often faster than describing it.',
  },
];

/** The careers application. Deliberately short: the résumé carries the detail. */
const careersFields: readonly Field[] = [
  name,
  phone,
  email,
  {
    kind: 'textarea',
    name: 'experience',
    label: 'Your experience',
    required: true,
    max: 4000,
    rows: 6,
    wide: true,
    help: 'What you have worked on, and what you are good at.',
  },
  {
    kind: 'file',
    name: 'resume',
    label: 'Resume',
    required: false,
    accept: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    maxBytes: MAX_UPLOAD_BYTES,
    help: 'Optional. PDF or Word. You can also paste the detail above instead.',
  },
];

export interface FormSpec {
  readonly kind: FormKind;
  /** Used in the email subject and the ClickUp task name. */
  readonly title: string;
  readonly submitLabel: string;
  readonly fields: readonly Field[];
}

export const FORMS: Record<FormKind, FormSpec> = {
  service: {
    kind: 'service',
    title: 'Service request',
    submitLabel: 'Send this to the shop',
    fields: serviceFields,
  },
  careers: {
    kind: 'careers',
    title: 'Application',
    submitLabel: 'Send the application',
    fields: careersFields,
  },
};

/**
 * The honeypot.
 *
 * Named after a field a bot wants to fill and a human never sees. It is not
 * `type="hidden"` — some bots skip hidden inputs and every bot fills a visible
 * text input called "website" — so it is a real text input moved out of view
 * and out of the tab order, with `autocomplete="off"` so a password manager
 * does not fill it on the reader's behalf.
 */
export const HONEYPOT_FIELD = 'website';

/**
 * Where the client stamps the time the form was rendered, in epoch
 * milliseconds. It is set by script, so it is absent for a reader with no
 * JavaScript, and `spam.ts` treats absent as "no signal" rather than as a
 * failure — see the note there about why that is the honest reading.
 */
export const TIMING_FIELD = 'renderedAt';

/** Cloudflare's own field name. Turnstile writes the token into it. */
export const TURNSTILE_FIELD = 'cf-turnstile-response';

/** Carries the form kind through a POST that has no other way to say it. */
export const KIND_FIELD = 'form';

/** Fields the endpoint reads that are not answers, and never reach a lead. */
export const CONTROL_FIELDS: readonly string[] = [
  HONEYPOT_FIELD,
  TIMING_FIELD,
  TURNSTILE_FIELD,
  KIND_FIELD,
];

export function isFormKind(value: unknown): value is FormKind {
  return typeof value === 'string' && (FORM_KINDS as readonly string[]).includes(value);
}
