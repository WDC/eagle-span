/**
 * Single source of truth for NAP and site-wide constants.
 *
 * Every phone number, address and hours string on the site renders from here.
 * Phase 4 requires the NAP to be byte-identical to the Google Business Profile:
 * the live Webflow site emits five different phone formats and two spellings of
 * the business name, which is exactly the inconsistency that suppresses local
 * ranking. One object, one format, no exceptions.
 *
 * The name spelling is settled: two words, matching the Google Business
 * Profile (ClickUp 86bbw0ecw). The Webflow site's one-word "EagleSpan
 * Corporation" was the drift, not the listing. Phase 4 still owns the rest of
 * the NAP finalization against the live GBP.
 */

export const site = {
  url: 'https://www.eaglespancorp.com',
  name: 'Eagle Span Corporation',
  shortName: 'Eagle Span',

  address: {
    street: '3815 Beasley Lane',
    locality: 'Charlotte',
    region: 'NC',
    postalCode: '28206',
    country: 'US',
  },

  /** Display format. Used verbatim in markup; must match the GBP. */
  phoneDisplay: '(704) 392-9938',
  /** E.164, for tel: hrefs and JSON-LD only. */
  phoneE164: '+17043929938',

  /** From the Maps listing, which is authoritative over the on-page JSON-LD. */
  geo: { latitude: 35.270506, longitude: -80.839889 },

  hours: {
    days: 'Monday – Friday',
    opens: '08:00',
    closes: '17:00',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  },

  /**
   * The live homepage links its hours block to AES Truck Repair in
   * Springfield, MO. This is the correct listing.
   */
  mapsUrl: 'https://maps.app.goo.gl/qfJT7msnmayb3oLu7',

  areaServed: 'Charlotte, North Carolina and the surrounding metro',
} as const;

export type Site = typeof site;
