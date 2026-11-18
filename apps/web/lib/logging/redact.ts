/**
 * Redaction for operational logs (`architecture.md` Logging & Monitoring, `apps/web/AGENTS.md`
 * Discipline: personal data never enters a log line).
 *
 * Redaction happens here, at the only place a line is serialised, rather than at each call site. Two
 * kinds of leak are covered:
 *
 * - **A field name that identifies a person.** A structured field called `memberId`, `fullName`,
 *   `telephoneNumber`, `wardDescription` or any free-text field is replaced by a constant marker
 *   before the line is written, whatever its value.
 * - **A value that looks like personal data.** A telephone number, an email address, a member or
 *   staff identifier, a bearer token or a JWT is replaced wherever it appears in a string.
 *
 * The marker is a fixed string, so a test can prove the value is gone rather than merely shortened.
 * Logging is a diagnostic path; losing a field is always preferable to retaining a resident's
 * details in an operator's terminal or a log aggregator.
 */

/** The constant written in place of a redacted value. */
export const REDACTED = '[redacted]';

/** Keys whose whole value is personal data, a credential or free text. */
const SENSITIVE_KEYS = new Set([
  'name',
  'fullname',
  'firstname',
  'lastname',
  'displayname',
  'membername',
  'username',
  'wardname',
  'warddescription',
  'telephone',
  'telephonenumber',
  'phonenumber',
  'phone',
  'msisdn',
  'email',
  'emailaddress',
  'memberid',
  'userid',
  'sessionid',
  'subjectid',
  'submission',
  'submissiontext',
  'comment',
  'commenttext',
  'freetext',
  'content',
  'text',
  'reason',
  'authorization',
  'cookie',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'password',
  'pin',
  'otp',
  'credential',
  'apikey',
  'databaseurl',
  'connectionstring',
  'dsn',
]);

/** Suffixes that mark a key as personal even when the prefix varies, e.g. `applicantFullName`. */
const SENSITIVE_SUFFIXES = [
  'fullname',
  'firstname',
  'lastname',
  'displayname',
  'membername',
  'wardname',
  'telephonenumber',
  'phonenumber',
  'memberid',
  'userid',
  'sessionid',
];

const VALUE_PATTERNS = [
  // Nigerian mobile numbers, with or without the country code and with common separators.
  /(?<!\d)(?:\+234|0)[\s-]?[789](?:[\s-]?\d){9}(?!\d)/g,
  // Any other international number long enough to be a subscriber number.
  /\+\d{1,3}[\s-]?\d{6,14}\b/g,
  // Email addresses.
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  // Member, staff, user, person, token and session identifiers (`C-001`).
  /\b(?:mbr|stf|usr|per|tok|ses)_[0-9A-Z]{4,26}\b/g,
  // A bearer credential.
  /\bBearer\s+[A-Z0-9._~+/-]+=*/gi,
  // A JSON Web Token, whose three dot-separated segments are recognisable on their own.
  /\beyJ[A-Z0-9_-]+\.[A-Z0-9_-]+\.[A-Z0-9_-]+\b/gi,
];

/** Maximum characters retained from one string; longer diagnostic text is truncated. */
const MAX_STRING = 2048;

/** Maximum nesting depth walked before the value is dropped. */
const MAX_DEPTH = 6;

/** Maximum array entries retained. */
const MAX_ARRAY = 50;

/** Maximum object keys retained. */
const MAX_KEYS = 100;

/** Normalises a key so `member_id`, `memberId` and `member-id` compare alike. */
function normaliseKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/** True when a field name is classified as personal data, a credential or free text. */
function isSensitiveKey(key: string): boolean {
  const normalised = normaliseKey(key);
  return (
    SENSITIVE_KEYS.has(normalised) ||
    SENSITIVE_SUFFIXES.some((suffix) => normalised.endsWith(suffix))
  );
}

/**
 * Removes values that look like personal data from a free-text string.
 *
 * @param text - The string about to be logged.
 * @returns The string with matching values replaced by {@link REDACTED}, capped at 2048 characters.
 */
export function redactText(text: string): string {
  let redacted = text;
  for (const pattern of VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED);
  }
  // Truncate after redaction, so a phone number straddling the cap cannot leave a partial value.
  return redacted.slice(0, MAX_STRING);
}

/**
 * Serialises an `Error` without its message or stack.
 *
 * Both can carry a resident's text, a telephone number or a credential, so only the class name and a
 * stable code survive. The redacted message is not worth the risk; the event name and correlation
 * identifier are how an operator finds the failure.
 */
function redactError(error: Error): Record<string, unknown> {
  const record: Record<string, unknown> = { name: error.name };
  const code = (error as Error & { code?: unknown }).code;
  if (typeof code === 'string' || typeof code === 'number') {
    record['code'] = code;
  }
  return record;
}

/**
 * Recursively redacts a value before it is serialised.
 *
 * @param value - The value supplied as log context.
 * @param depth - The current nesting level, used to bound the walk.
 * @returns A JSON-safe value with sensitive fields and patterns replaced.
 */
export function redactLogValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';

  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (value instanceof Error) return redactError(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? REDACTED : value.toISOString();

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((entry) => redactLogValue(entry, depth + 1));
  }

  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  let kept = 0;
  for (const [key, entry] of Object.entries(record)) {
    if (kept >= MAX_KEYS) break;
    kept += 1;
    output[key] = isSensitiveKey(key) ? REDACTED : redactLogValue(entry, depth + 1);
  }
  return output;
}

/**
 * Redacts a whole context object, dropping the entries whose redacted value is `undefined`.
 *
 * @param context - The structured fields a caller attached to a log line.
 * @returns A JSON-safe context object.
 */
export function redactLogContext(context: Record<string, unknown>): Record<string, unknown> {
  const redacted = redactLogValue(context);
  return redacted !== null && typeof redacted === 'object' && !Array.isArray(redacted)
    ? (redacted as Record<string, unknown>)
    : {};
}
