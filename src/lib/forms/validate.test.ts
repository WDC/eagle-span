import { describe, expect, test } from 'bun:test';

import { FORMS, HONEYPOT_FIELD } from './fields.ts';
import { unknownFields, validate, type FormDataLike } from './validate.ts';

/**
 * A stand-in for `FormData`.
 *
 * The real one needs a runtime that has it and a multipart body to fill it;
 * this needs neither, which is what keeps these tests about the rules rather
 * than about the request. `validate()` takes the narrow `FormDataLike` for
 * exactly this reason.
 */
function form(values: Record<string, unknown>): FormDataLike {
  return {
    get: (name) => values[name] ?? null,
    getAll: (name) => (name in values ? [values[name]] : []),
  };
}

/** A file part the way a runtime hands one over. */
function file(name: string, type: string, size: number): unknown {
  return {
    name,
    type,
    size,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(size)),
  };
}

const validService = {
  name: 'Dale Whitfield',
  phone: '(704) 555-0134',
  email: 'dale@example.com',
  vehicleType: 'truck',
  symptom: 'Air brakes dragging on the drive axle after a cold start.',
  urgency: 'scheduled',
};

describe('the service request', () => {
  test('accepts the answers the shop asks for', async () => {
    const result = await validate('service', form(validService));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values['name']).toBe('Dale Whitfield');
    expect(result.values['vehicleType']).toBe('truck');
  });

  test('answers carry the label, so a lead reads the same as the form', async () => {
    const result = await validate('service', form(validService));
    if (!result.ok) throw new Error('expected valid');
    const vehicle = result.answers.find((answer) => answer.name === 'vehicleType');
    // The stored value is the slug; what a human reads is the option's label.
    expect(vehicle?.value).toBe('Truck');
    expect(vehicle?.label).toBe('Vehicle type');
  });

  test('every required field is required', async () => {
    for (const field of FORMS.service.fields.filter((one) => one.required)) {
      const without = { ...validService } as Record<string, unknown>;
      delete without[field.name];
      const result = await validate('service', form(without));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors[field.name]).toBeDefined();
    }
  });

  test('optional fields stay optional', async () => {
    const result = await validate('service', form(validService));
    expect(result.ok).toBe(true);
  });

  test('whitespace-only is the same as absent', async () => {
    const result = await validate('service', form({ ...validService, name: '   \n  ' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors['name']).toBeDefined();
  });

  test('a choice outside the manifest is refused', async () => {
    const result = await validate('service', form({ ...validService, vehicleType: 'spaceship' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors['vehicleType']).toBeDefined();
  });

  test('an address with no @ is refused, and a normal one is not', async () => {
    expect((await validate('service', form({ ...validService, email: 'dale.example.com' }))).ok).toBe(false);
    expect((await validate('service', form({ ...validService, email: 'a+b@sub.example.co.uk' }))).ok).toBe(true);
  });

  test('a phone number is judged on digits, not on formatting', async () => {
    for (const written of ['7043929938', '(704) 392-9938', '704.392.9938', '+1 704 392 9938']) {
      const result = await validate('service', form({ ...validService, phone: written }));
      expect(result.ok).toBe(true);
    }
    // Four digits is not a phone number in any formatting.
    expect((await validate('service', form({ ...validService, phone: '1234' }))).ok).toBe(false);
  });

  test('the length bound is the manifest bound', async () => {
    const symptom = FORMS.service.fields.find((field) => field.name === 'symptom');
    if (symptom?.kind !== 'textarea') throw new Error('symptom is a textarea');
    const atBound = 'x'.repeat(symptom.max);
    const overBound = 'x'.repeat(symptom.max + 1);
    expect((await validate('service', form({ ...validService, symptom: atBound }))).ok).toBe(true);
    expect((await validate('service', form({ ...validService, symptom: overBound }))).ok).toBe(false);
  });

  test('a VIN is checked against the pattern but never demanded', async () => {
    expect((await validate('service', form({ ...validService, vin: '1FUJGLDR9CSBF1234' }))).ok).toBe(true);
    // I, O and Q are not VIN characters.
    expect((await validate('service', form({ ...validService, vin: 'IOQ11111111111111' }))).ok).toBe(false);
    expect((await validate('service', form(validService))).ok).toBe(true);
  });

  test('control characters are stripped rather than rejected', async () => {
    const result = await validate('service', form({ ...validService, name: 'Dale\u0000 Whit\u0007field' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values['name']).toBe('Dale Whitfield');
  });

  test('a newline in a textarea survives, because it is how someone writes', async () => {
    const symptom = 'Line one.\nLine two.';
    const result = await validate('service', form({ ...validService, symptom }));
    if (!result.ok) throw new Error('expected valid');
    expect(result.values['symptom']).toBe(symptom);
  });
});

describe('uploads', () => {
  test('an empty file part is not a file', async () => {
    const result = await validate('service', form({ ...validService, photo: file('', '', 0) }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files).toHaveLength(0);
  });

  test('a photo within the bounds is carried through', async () => {
    const result = await validate('service', form({ ...validService, photo: file('brakes.jpg', 'image/jpeg', 1024) }));
    if (!result.ok) throw new Error('expected valid');
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.filename).toBe('brakes.jpg');
  });

  test('an oversized file is refused with an answer the sender can act on', async () => {
    const photo = FORMS.service.fields.find((field) => field.name === 'photo');
    if (photo?.kind !== 'file') throw new Error('photo is a file field');
    const result = await validate('service', form({ ...validService, photo: file('big.jpg', 'image/jpeg', photo.maxBytes + 1) }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors['photo']).toContain('MB');
  });

  test('a type outside the accept list is refused', async () => {
    const result = await validate('service', form({ ...validService, photo: file('payload.exe', 'application/x-msdownload', 32) }));
    expect(result.ok).toBe(false);
  });
});

describe('the careers application', () => {
  const validCareers = {
    name: 'Ruth Alvarez',
    phone: '704 555 0199',
    email: 'ruth@example.com',
    experience: 'Twelve years on heavy-duty drivetrains, six of them on trailers.',
  };

  test('accepts an application with no resume attached', async () => {
    const result = await validate('careers', form(validCareers));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files).toHaveLength(0);
  });

  test('takes a PDF resume', async () => {
    const result = await validate('careers', form({ ...validCareers, resume: file('ruth.pdf', 'application/pdf', 2048) }));
    if (!result.ok) throw new Error('expected valid');
    expect(result.files[0]?.field).toBe('resume');
  });

  test('does not accept the service form under a different name', async () => {
    // `symptom` is not a careers field, so the required careers fields are missing.
    const result = await validate('careers', form(validService));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors['experience']).toBeDefined();
  });
});

describe('unknown fields', () => {
  test('control fields are not unknown', () => {
    expect(unknownFields('service', [HONEYPOT_FIELD, 'form', 'renderedAt', 'cf-turnstile-response'])).toEqual([]);
  });

  test('a field nobody declared is reported', () => {
    expect(unknownFields('service', ['name', 'utm_source'])).toEqual(['utm_source']);
  });
});
