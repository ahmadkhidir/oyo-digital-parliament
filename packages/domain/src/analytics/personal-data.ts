/**
 * The no-personal-data rule for analytics (`analytics.md` Analytics Data Governance, `C-089`).
 *
 * `C-089` rejects the whole event rather than redacting it: an event that was assembled with a name,
 * a telephone number, a ward description, submission text, comment text or an extracted budget line
 * was misdesigned at the call site, and a redacted version would hide that.
 *
 * Two layers enforce the rule. The structural layer is the taxonomy itself: every property is
 * declared against a boolean, an integer, a closed enum, a stable code, a record identifier or a
 * quarter, so there is no field that can hold a sentence. This layer catches what structure misses:
 * a code-shaped value that is really a telephone number, a value long enough to be an excerpt, a
 * property key that names something personal, and a nested object or array used as a container.
 */
/**
 * Property keys that name personal data or free text. Compared with underscores, hyphens and casing
 * removed, so `ward_description`, `wardDescription` and `WardDescription` are one key here.
 */ const PERSONAL_KEY_STEMS: readonly string[] = [
  'fullname',
  'displayname',
  'firstname',
  'lastname',
  'surname',
  'name',
  'telephone',
  'telephonenumber',
  'phonenumber',
  'phone',
  'msisdn',
  'email',
  'emailaddress',
  'address',
  'streetaddress',
  'declaredage',
  'dateofbirth',
  'birthdate',
  'memberid',
  'authorid',
  'moderatorid',
  'reviewerid',
  'requestedbyid',
  'confirmedbyid',
  'residence',
  'warddescription',
  'wardname',
  'text',
  'body',
  'content',
  'excerpt',
  'submissiontext',
  'commenttext',
  'budgetline',
  'budgetlinetext',
  'freetext',
  'note',
  'message',
  'reason',
];

/** A run of at least this many consecutive digits is a reference, not a count. */
const LONG_DIGIT_RUN = 10;

/**
 * A Nigerian telephone number, with the separators people type into a form: `0803 123 4567`,
 * `+234-803-123-4567`, `2348031234567`. The shape is a leading `0` with ten more digits, or `234`
 * with ten more, and the digits may be separated by spaces, dots, dashes or brackets.
 */
const TELEPHONE_PATTERN = /(?:\+?234|0)[\s().-]*[0-9](?:[\s().-]*[0-9]){9,}/;

/** Whether a string contains something shaped like a telephone number. */
export function containsTelephoneNumber(value: string): boolean {
  if (TELEPHONE_PATTERN.test(value)) return true;
  let run = 0;
  for (const character of value) {
    if (character >= '0' && character <= '9') {
      run += 1;
      if (run >= LONG_DIGIT_RUN) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

/** A value at least this long that contains whitespace is read as prose rather than a code. */
const PROSE_LENGTH = 20;

/** A value longer than this is treated as an excerpt of something a person wrote. */
const EXCERPT_LENGTH = 200;

/** Normalises a property key for comparison: lower case, letters and digits only. */
function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Whether a key names personal data or free text. */
export function isPersonalPropertyKey(key: string): boolean {
  const normalised = normaliseKey(key);
  // `reason_code` and `reason_present` are declared codes; only a bare `reason` names prose.
  return PERSONAL_KEY_STEMS.some((stem) => normalised === stem);
}

/** Why one property value was refused, if it was. */
export type PersonalDataFinding =
  | { readonly kind: 'PERSONAL_KEY'; readonly key: string }
  | { readonly kind: 'TELEPHONE_NUMBER'; readonly key: string }
  | { readonly kind: 'EMAIL_ADDRESS'; readonly key: string }
  | { readonly kind: 'FREE_TEXT'; readonly key: string }
  | { readonly kind: 'NESTED_VALUE'; readonly key: string };

/**
 * The reasons a raw property bag cannot be sent, in the order they are checked. An empty array means
 * the bag is structurally clean; kind validation then runs over the same bag.
 */
export function findPersonalDataFindings(
  properties: Readonly<Record<string, unknown>>,
): PersonalDataFinding[] {
  const findings: PersonalDataFinding[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (isPersonalPropertyKey(key)) {
      findings.push({ kind: 'PERSONAL_KEY', key });
      continue;
    }
    if (typeof value === 'string') {
      if (value.includes('@') && /\.[a-z]{2,}/i.test(value)) {
        findings.push({ kind: 'EMAIL_ADDRESS', key });
        continue;
      }
      if (containsTelephoneNumber(value)) {
        findings.push({ kind: 'TELEPHONE_NUMBER', key });
        continue;
      }
      if (value.length > EXCERPT_LENGTH || (value.length >= PROSE_LENGTH && /\s/.test(value))) {
        findings.push({ kind: 'FREE_TEXT', key });
      }
      continue;
    }
    if (value !== null && typeof value === 'object') {
      findings.push({ kind: 'NESTED_VALUE', key });
    }
  }
  return findings;
}
