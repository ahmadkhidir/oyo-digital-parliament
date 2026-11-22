/**
 * Ward Confirmation — `docs/OyoDigitalParliament/screens/05-ward-confirmation.md`, wired to
 * `C-009` (the reference the page reads), `C-010` (the suggestion the client island asks for) and
 * `C-011` (`actions.ts`).
 *
 * The screen states resolve on the server wherever a datum decides them:
 *
 * - **Default** — the local government area and the description field, with the unresolved note
 *   stating that an area not on a list is still accepted.
 * - **Candidates / No match** — the client island's answer from `C-010`; the server renders the
 *   field and the actions either way, so a failed suggestion never blocks the resident.
 * - **Suggestion unavailable** — `C-010` answers `capabilityStatus:"fallback"` and the screen shows
 *   no notice, exactly as the screen file states.
 * - **Error** — the reference could not be read: the description field alone remains usable and
 *   "None of these" still queues the words (`C-009` `SERVICE_DEGRADED`).
 * - **Confirmed** — a member whose ward is already on the record sees it named above the form; a
 *   successful confirmation follows `C-011`'s `nextScreen` to the record home.
 * - **Unresolved** — after "None of these", `C-011` answers with the queued review and this page
 *   renders the "Area sent for confirmation" sheet and a way on.
 * - **Offline / Confirming** — the client island's states.
 *
 * The resident's words travel in the form post and never in a URL; a refused attempt is echoed
 * server-side under an opaque digest (`_lib/form-echo.ts`).
 */
import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { WardPorts } from '@odp/domain';
import { getMessages, type Messages } from '../../../../messages';
import { resolveLocale } from '../../../../lib/i18n/locale';
import { interpolate } from '../../../../lib/i18n/format';
import { presentedMemberSessionToken } from '../../../../lib/session/session-cookies';
import { buildWardReadPorts, getWardDependencies, resolveMemberSession } from './_lib/runtime';
import { echoKey, readEcho } from './_lib/form-echo';
import { SIGN_IN_PATH } from './_lib/confirm';
import { WardForm } from './_shared/ward-form';
import { confirmWardAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  return { title: getMessages(locale).ward.title };
}

/** The ward copy for one locale. */
type WardCopy = Messages['ward'];

/** The echo token is a SHA-256 digest; anything else is ignored rather than trusted as a key. */
const DIGEST = /^[0-9a-f]{64}$/;

/** The field sentences a refusal reason names, keyed to the control each belongs to. */
function errorsFor(
  copy: WardCopy,
  reason: string | null,
): {
  readonly description?: string;
  readonly localGovernmentArea?: string;
  readonly choice?: string;
  readonly whole?: string;
} {
  switch (reason) {
    case 'description_required':
      return { description: copy.errors.descriptionRequired };
    case 'description_long':
      return { description: copy.errors.descriptionLong };
    case 'area_long':
      return { localGovernmentArea: copy.errors.areaLong };
    case 'choice_required':
      return { choice: copy.errors.choiceRequired };
    case 'ward_unknown':
      return { choice: copy.errors.wardUnknown };
    case 'idempotency_required':
      return { whole: copy.errors.idempotencyRequired };
    case 'idempotency_conflict':
      return { whole: copy.errors.idempotencyConflict };
    case 'write_failed':
      return { whole: copy.errors.writeFailed };
    default:
      return {};
  }
}

/** The reference's local government areas, sorted, or `null` when it could not be read. */
async function readLocalGovernmentAreas(
  reference: Pick<WardPorts, 'wards'>,
): Promise<readonly string[] | null> {
  try {
    const wards = await reference.wards.listForMatching();
    return [...new Set(wards.map((ward) => ward.localGovernmentArea))].sort((left, right) =>
      left.localeCompare(right),
    );
  } catch {
    return null;
  }
}

interface WardPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export default async function WardPage({ searchParams }: WardPageProps) {
  const locale = await resolveLocale();
  const messages = getMessages(locale);
  const copy = messages.ward;

  const token = await presentedMemberSessionToken();
  const member = await resolveMemberSession(token ?? undefined);
  if (member === null) redirect(SIGN_IN_PATH);

  const dependencies = await getWardDependencies();
  const reference = buildWardReadPorts(dependencies.database);
  const localGovernmentAreas = await readLocalGovernmentAreas(reference);
  const referenceUnavailable = localGovernmentAreas === null;

  // The recorded ward is named above the form when the member already has one (`screens/05`
  // Confirmed); a reference that cannot answer leaves the form usable and names no ward.
  const recordedWard =
    member.wardId === undefined
      ? null
      : await reference.wards.getById(member.wardId).catch(() => null);

  const query = await searchParams;
  const sent = query['sent'] === 'review';
  const queued = sent
    ? await reference.wardDescriptionReviews
        .listQueuedByMember(member.id)
        .then((reviews) => reviews.length > 0)
        .catch(() => false)
    : false;

  const rawReason = query['e'];
  const reason = typeof rawReason === 'string' ? rawReason : null;
  const rawDigest = query['k'];
  const digest = typeof rawDigest === 'string' && DIGEST.test(rawDigest) ? rawDigest : null;
  const echo =
    digest === null
      ? null
      : await readEcho(dependencies.platform.cache, echoKey('confirm', digest));

  const errors = errorsFor(copy, reason);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-lg px-md py-xl">
      <h1 className="text-h1 text-text-primary">{copy.heading}</h1>
      <p className="text-body text-text-secondary">{copy.intro}</p>

      {errors.whole === undefined ? null : (
        <div
          role="alert"
          className="border border-border bg-surface px-md py-sm text-body text-text-primary"
        >
          {errors.whole}
        </div>
      )}

      {/* Confirmed: the ward already on the record (`screens/05` Confirmed). */}
      {recordedWard === null || member.wardStatus !== 'resolved' ? null : (
        <section
          aria-labelledby="ward-recorded"
          className="border border-primary-300 bg-primary-100 px-md py-md text-primary-900"
        >
          <h2 id="ward-recorded" className="text-h3 text-primary-900">
            {copy.recordedHeading}
          </h2>
          <p className="mt-xs text-body">
            {interpolate(copy.recordedBody, { ward: recordedWard.name })}
          </p>
          <a
            href="/"
            className="mt-sm inline-block text-small text-primary-700 underline underline-offset-2"
          >
            {copy.sentContinue}
          </a>
        </section>
      )}

      {/* Submitted: "None of these" queued the description (`C-011` unresolved branch). */}
      {queued ? (
        <section
          aria-labelledby="ward-sent"
          className="border border-border bg-surface px-md py-md"
        >
          <h2 id="ward-sent" className="text-h3 text-text-primary">
            {copy.sentHeading}
          </h2>
          <p className="mt-xs text-body text-text-secondary">{copy.sentBody}</p>
          <a
            href="/"
            className="mt-sm inline-block text-small text-primary-500 underline underline-offset-2"
          >
            {copy.sentContinue}
          </a>
        </section>
      ) : null}

      <WardForm
        action={confirmWardAction}
        idempotencyKey={randomUUID()}
        localGovernmentAreas={localGovernmentAreas ?? []}
        defaults={{
          description: echo?.description ?? '',
          localGovernmentArea: echo?.localGovernmentArea ?? '',
        }}
        copy={{
          areaLabel: copy.areaLabel,
          areaHint: copy.areaHint,
          areaPlaceholder: copy.areaPlaceholder,
          descriptionLabel: copy.descriptionLabel,
          descriptionHint: copy.descriptionHint,
          descriptionPlaceholder: copy.descriptionPlaceholder,
          suggesting: copy.suggesting,
          candidatesLegend: copy.candidatesLegend,
          candidateOption: copy.candidateOption,
          noCandidates: copy.noCandidates,
          candidateError: copy.candidateError,
          areaRequired: copy.areaRequired,
          confirm: copy.confirm,
          confirming: copy.confirming,
          noneOfThese: copy.noneOfThese,
          noneOfTheseHint: copy.noneOfTheseHint,
          offline: copy.offline,
          offlineSubmit: copy.offlineSubmit,
        }}
        {...(errors.description === undefined &&
        errors.localGovernmentArea === undefined &&
        errors.choice === undefined
          ? {}
          : {
              errors: {
                ...(errors.description === undefined ? {} : { description: errors.description }),
                ...(errors.localGovernmentArea === undefined
                  ? {}
                  : { localGovernmentArea: errors.localGovernmentArea }),
                ...(errors.choice === undefined ? {} : { choice: errors.choice }),
              },
            })}
        referenceUnavailable={referenceUnavailable}
      />

      {/* The unresolved note: a static statement that the resident is not blocked (`screens/05`). */}
      <aside
        aria-label={copy.unresolvedHeading}
        className="border border-border bg-surface px-md py-sm"
      >
        <p className="text-body-strong text-text-primary">{copy.unresolvedHeading}</p>
        <p className="mt-xs text-body text-text-secondary">{copy.unresolvedNote}</p>
      </aside>
    </div>
  );
}
