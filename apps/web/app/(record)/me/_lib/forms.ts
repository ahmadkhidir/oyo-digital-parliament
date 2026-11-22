/**
 * The My Record form readers and status words (`C-033` to `C-035`, `screens/13-my-record.md`).
 *
 * Every form post is read here before it reaches a use case, so a value the browser could have
 * rewritten is re-read at the boundary and a field's failure can be named under its control
 * (`apps/web/AGENTS.md` Discipline). The words a status renders are mapped here too, so a status
 * never reaches a reader as a raw enum token and no sentence is assembled in a component.
 *
 * Nothing in this module holds a member's values beyond the call that parsed them.
 */
import type { ConsentPurpose, DataRequestType, Locale } from '@odp/domain';
import type { Messages } from '../../../../messages';

/** The catalogue slice these readers and mappings serve. */
export type MyRecordCopy = Messages['myRecord'];

/** One form field as the browser sent it, or the empty string when absent. */
export function fieldValue(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === 'string' ? raw : '';
}

/** The correction form's submission, before the use case validates it (`C-033`). */
export interface CorrectionSubmission {
  readonly displayName: string;
  readonly fullName: string;
  /** The locale as submitted; the domain reads it and answers `ENUM_MISMATCH` itself. */
  readonly locale: Locale;
  /**
   * Which form posted: the full correction, or the footer's language-only switch.
   *
   * Both reach the one `C-033` entry. A language-only post takes the member's current display and
   * full name from the record, because the contract rewrites all three fields together.
   */
  readonly mode: 'details' | 'language';
  /** The opaque echo digest, when this render minted one. */
  readonly echoKey: string;
}

/** Reads the correction form (`C-033`). */
export function readCorrectionSubmission(formData: FormData): CorrectionSubmission {
  const rawLocale = fieldValue(formData, 'locale');
  return {
    displayName: fieldValue(formData, 'displayName'),
    fullName: fieldValue(formData, 'fullName'),
    locale: rawLocale as Locale,
    mode:
      fieldValue(formData, 'intent') === 'language' || !formData.has('displayName')
        ? 'language'
        : 'details',
    echoKey: fieldValue(formData, 'echoKey'),
  };
}

/** One consent toggle's submission (`C-034`). */
export interface ConsentSubmission {
  readonly purpose: ConsentPurpose | null;
  readonly granted: boolean | null;
}

/**
 * Reads one consent toggle.
 *
 * A native checkbox sends nothing when it is clear, so each toggle form carries a hidden `false`
 * first; the last value is what the reader intended. An unreadable answer is `null`, which the
 * use case refuses with its own field reasons rather than guessing a direction.
 */
export function readConsentSubmission(formData: FormData): ConsentSubmission {
  const purposes: readonly ConsentPurpose[] = [
    'decision_notices',
    'record_transfer',
    'assisted_recording',
  ];
  const rawPurpose = fieldValue(formData, 'purpose');
  const purpose = purposes.find((value) => value === rawPurpose) ?? null;
  const answers = formData.getAll('granted');
  const last = answers.at(-1);
  const granted = last === 'true' ? true : last === 'false' ? false : null;
  return { purpose, granted };
}

/** One data-request form's submission (`C-035`). */
export interface DataRequestSubmission {
  readonly type: DataRequestType | null;
  readonly idempotencyKey: string;
}

/** Reads the export or deletion form (`C-035`); the request carries its type and nothing else. */
export function readDataRequestSubmission(formData: FormData): DataRequestSubmission {
  const types: readonly DataRequestType[] = ['access', 'correction', 'export', 'deletion'];
  const rawType = fieldValue(formData, 'type');
  return {
    type: types.find((value) => value === rawType) ?? null,
    idempotencyKey: fieldValue(formData, 'idempotencyKey'),
  };
}

/** The words one submission status renders, keyed by the schema's own enum (`schema.md`). */
const SUBMISSION_STATUSES = [
  'awaiting_decision',
  'decided',
  'withdrawn',
  'withheld',
  'out_of_area',
] as const;

type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

function isSubmissionStatus(value: string): value is SubmissionStatus {
  return (SUBMISSION_STATUSES as readonly string[]).includes(value);
}

/** The translated word for one submission status. */
export function submissionStatusWord(copy: MyRecordCopy, status: string): string {
  return isSubmissionStatus(status) ? copy.submissions.statuses[status] : status;
}

/** The translated word for one decision type (`C-032` `decision.type`). */
export function decisionWord(
  copy: MyRecordCopy,
  type: 'commit' | 'decline' | 'refer' | null,
): string | null {
  return type === null ? null : copy.submissions.decisions[type];
}

/** The status marker a decision carries (`packages/ui` `StatusKey`). */
export function decisionStatusKey(
  type: 'commit' | 'decline' | 'refer',
): 'committed' | 'declined' | 'referred' {
  switch (type) {
    case 'commit':
      return 'committed';
    case 'decline':
      return 'declined';
    case 'refer':
      return 'referred';
  }
}

/** The translated word for one backing state. */
export function backingStateWord(
  copy: MyRecordCopy,
  state: 'active' | 'withdrawn' | 'voided',
): string {
  return copy.backings.states[state];
}

/** The translated word for one data-request type. */
export function requestTypeWord(copy: MyRecordCopy['requests'], type: DataRequestType): string {
  return copy.types[type];
}

/** The translated word for one data-request status. */
export function requestStatusWord(copy: MyRecordCopy['requests'], status: string): string {
  const statuses = copy.statuses as Readonly<Record<string, string>>;
  return statuses[status] ?? status;
}

/** The translated word for one identity state (`FEAT-001`: exactly two). */
export function identityStateWord(copy: MyRecordCopy, state: 'registered' | 'checked'): string {
  return copy.identityStates[state];
}

/** The translated word for one consent row, or the unanswered sentence. */
export function consentStateWord(copy: MyRecordCopy['consent'], granted: boolean | null): string {
  if (granted === null) return copy.notAnswered;
  return granted ? copy.granted : copy.withdrawn;
}

/**
 * The sentence one correction field's `C-001` reason renders under its control.
 *
 * @param field - The field the use case named.
 * @param reason - The field-level reason token it answered with.
 * @returns The sentence, or `undefined` when the field or reason is not one this form renders.
 */
export function correctionErrorWord(
  copy: MyRecordCopy,
  field: string,
  reason: string,
): string | undefined {
  const errors = copy.correction.errors;
  switch (field) {
    case 'displayName':
      if (reason === 'REQUIRED') return errors.displayNameRequired;
      if (reason === 'TOO_LONG') return errors.displayNameLong;
      if (reason === 'ALREADY_SET') return errors.displayNameTaken;
      return undefined;
    case 'fullName':
      if (reason === 'REQUIRED') return errors.fullNameRequired;
      if (reason === 'TOO_LONG') return errors.fullNameLong;
      return undefined;
    case 'locale':
      if (reason === 'ENUM_MISMATCH') return errors.languageInvalid;
      return undefined;
    default:
      return undefined;
  }
}
