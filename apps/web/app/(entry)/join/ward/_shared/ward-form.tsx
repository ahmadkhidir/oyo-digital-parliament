'use client';

/**
 * The Ward Confirmation screen's one client boundary (`screens/05-ward-confirmation.md`, `C-010`,
 * `C-011`).
 *
 * It exists for the states a server render cannot carry: the candidate list as the resident types
 * (with the `Matching` spinner), the explicit choice, the confirming state with the button disabled,
 * and the offline banner. Everything else — the recorded ward, the queued-review sheet, the field
 * errors a refused submission leaves behind — is decided on the server and arrives as props.
 *
 * With scripting disabled the same markup still posts: the description and the local government
 * area are ordinary form fields, and "None of these" sends the resident's words to the review queue
 * (`C-011`). Candidate assistance is an enhancement over that base; a failed suggestion never blocks
 * the description, which `FEAT-002` makes sufficient.
 *
 * The description never leaves this component except in the form post and in the `C-010` request to
 * the same origin. It is never put in a URL, a storage key or an event.
 */
import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { WardCandidate } from '@odp/domain';
import { Button, focusRingClasses } from '@odp/ui';
import { interpolate } from '../../../../../lib/i18n/format';
import { useOffline } from '../../_shared/use-offline';

/** The field and button copy the page hands over, already translated. */
export interface WardFormCopy {
  areaLabel: string;
  areaHint: string;
  areaPlaceholder: string;
  descriptionLabel: string;
  descriptionHint: string;
  descriptionPlaceholder: string;
  suggesting: string;
  candidatesLegend: string;
  candidateOption: string;
  noCandidates: string;
  candidateError: string;
  areaRequired: string;
  confirm: string;
  confirming: string;
  noneOfThese: string;
  noneOfTheseHint: string;
  offline: string;
  offlineSubmit: string;
}

export interface WardFormProps {
  /** The `C-011` server action, shared by the enhanced and the no-scripting paths. */
  action: (formData: FormData) => void | Promise<void>;
  /** The `C-001` idempotency key this render's form posts. */
  idempotencyKey: string;
  /** The local government areas known to the reference, or empty when it could not be read. */
  localGovernmentAreas: readonly string[];
  /** The resident's words and area, kept across a refused attempt. */
  defaults: { readonly description: string; readonly localGovernmentArea: string };
  copy: WardFormCopy;
  /** Field sentences chosen by the page from the refusal's field reasons. */
  errors?: {
    readonly description?: string;
    readonly localGovernmentArea?: string;
    readonly choice?: string;
  };
  /** True when the reference could not be read on the server, so the note is shown from first paint. */
  referenceUnavailable: boolean;
}

/** The state of the candidate area. */
type CandidatePhase = 'idle' | 'matching' | 'found' | 'none' | 'error' | 'area';

/** How long the resident pauses before the reference is asked, so a word is not a request. */
const TYPING_PAUSE_MS = 350;

function WardFormBody({
  idempotencyKey,
  localGovernmentAreas,
  defaults,
  copy,
  errors,
  referenceUnavailable,
}: Omit<WardFormProps, 'action'>) {
  const offline = useOffline();
  const { pending } = useFormStatus();
  const [description, setDescription] = useState(defaults.description);
  const [area, setArea] = useState(defaults.localGovernmentArea);
  const [candidates, setCandidates] = useState<readonly WardCandidate[]>([]);
  const [selected, setSelected] = useState<WardCandidate | null>(null);
  const [phase, setPhase] = useState<CandidatePhase>(referenceUnavailable ? 'error' : 'idle');
  const request = useRef(0);

  // One debounced suggestion per pause. The request counter makes a slow earlier answer unable to
  // overwrite a newer one, and the abort releases the connection when the resident keeps typing.
  useEffect(() => {
    const trimmed = description.trim();
    if (trimmed === '' || offline) {
      setCandidates([]);
      setSelected(null);
      setPhase(referenceUnavailable ? 'error' : 'idle');
      return undefined;
    }

    const sequence = request.current + 1;
    request.current = sequence;
    setPhase('matching');
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/wards/candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: trimmed,
            ...(area === '' ? {} : { localGovernmentArea: area }),
          }),
          signal: controller.signal,
        });
        if (request.current !== sequence) return;
        if (response.status === 401) {
          window.location.assign('/sign-in?returnTo=%2Fjoin%2Fward');
          return;
        }
        if (!response.ok) {
          const failure = (await response.json().catch(() => ({}))) as {
            error?: { cause?: string; fields?: Readonly<Record<string, string>> };
          };
          setCandidates([]);
          setSelected(null);
          // Two wards sharing a name need the local government area before a candidate is offered
          // (`FEAT-002` edge case); that is a choice to make, not a failed reference.
          const needsArea =
            failure.error?.cause === 'WARD_AREA_REQUIRED' ||
            failure.error?.fields?.['localGovernmentArea'] !== undefined;
          setPhase(needsArea ? 'area' : 'error');
          return;
        }
        const body = (await response.json()) as {
          data?: { candidates?: readonly WardCandidate[] };
        };
        if (request.current !== sequence) return;
        const found = body.data?.candidates ?? [];
        setCandidates(found);
        setSelected((current) =>
          current !== null && found.some((candidate) => candidate.wardId === current.wardId)
            ? current
            : null,
        );
        setPhase(found.length === 0 ? 'none' : 'found');
      } catch {
        // A request the effect itself cancelled is not a failed suggestion.
        if (controller.signal.aborted || request.current !== sequence) return;
        setCandidates([]);
        setSelected(null);
        setPhase('error');
      }
    }, TYPING_PAUSE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [description, area, offline, referenceUnavailable]);

  const locked = pending || offline;
  const descriptionId = 'ward-description';
  const areaId = 'ward-lga';

  return (
    <>
      {offline ? (
        <div role="status" className="border border-border bg-surface px-md py-sm text-body">
          {copy.offline}
        </div>
      ) : null}

      <div className="flex flex-col gap-xs">
        <label htmlFor={areaId} className="text-body-strong text-text-primary">
          {copy.areaLabel}
        </label>
        <p id={`${areaId}-hint`} className="text-small text-text-secondary">
          {copy.areaHint}
        </p>
        <select
          id={areaId}
          name="localGovernmentArea"
          value={area}
          disabled={locked}
          aria-invalid={errors?.localGovernmentArea === undefined ? undefined : true}
          aria-describedby={
            errors?.localGovernmentArea === undefined ? `${areaId}-hint` : `${areaId}-error`
          }
          onChange={(event) => setArea(event.currentTarget.value)}
          className={`min-h-11 border border-border bg-surface px-sm text-body text-text-primary ${focusRingClasses}`}
        >
          <option value="">{copy.areaPlaceholder}</option>
          {localGovernmentAreas.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {errors?.localGovernmentArea === undefined ? null : (
          <p id={`${areaId}-error`} role="alert" className="text-small text-text-primary">
            {errors.localGovernmentArea}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-xs">
        <label htmlFor={descriptionId} className="text-body-strong text-text-primary">
          {copy.descriptionLabel}
        </label>
        <p id={`${descriptionId}-hint`} className="text-small text-text-secondary">
          {copy.descriptionHint}
        </p>
        <textarea
          id={descriptionId}
          name="description"
          required
          maxLength={500}
          rows={4}
          value={description}
          disabled={locked}
          placeholder={copy.descriptionPlaceholder}
          aria-invalid={errors?.description === undefined ? undefined : true}
          aria-describedby={
            errors?.description === undefined ? `${descriptionId}-hint` : `${descriptionId}-error`
          }
          onChange={(event) => setDescription(event.currentTarget.value)}
          className={`border border-border bg-surface px-sm py-sm text-body text-text-primary ${focusRingClasses}`}
        />
        {errors?.description === undefined ? null : (
          <p id={`${descriptionId}-error`} role="alert" className="text-small text-text-primary">
            {errors.description}
          </p>
        )}
      </div>

      {/* The candidate area is a live region: the spinner and its replacement are announced once. */}
      <div aria-live="polite" className="flex flex-col gap-sm">
        {phase === 'matching' ? (
          <p role="status" className="text-body text-text-secondary">
            {copy.suggesting}
          </p>
        ) : null}

        {phase === 'found' ? (
          <fieldset className="flex flex-col gap-xs border border-border px-md py-sm">
            <legend className="px-xs text-body-strong text-text-primary">
              {copy.candidatesLegend}
            </legend>
            {candidates.map((candidate) => (
              <label
                key={candidate.wardId}
                className="flex min-h-11 items-center gap-sm text-body text-text-primary"
              >
                <input
                  type="radio"
                  name="confirmedWardId"
                  value={candidate.wardId}
                  checked={selected?.wardId === candidate.wardId}
                  disabled={locked}
                  onChange={() => setSelected(candidate)}
                  required
                />
                <span>
                  {interpolate(copy.candidateOption, {
                    name: candidate.name,
                    area: candidate.localGovernmentArea,
                  })}
                </span>
              </label>
            ))}
            {errors?.choice === undefined ? null : (
              <p role="alert" className="text-small text-text-primary">
                {errors.choice}
              </p>
            )}
          </fieldset>
        ) : null}

        {phase === 'none' ? (
          <p role="status" className="border border-border bg-surface px-md py-sm text-body">
            {copy.noCandidates}
          </p>
        ) : null}

        {phase === 'area' ? (
          <p role="status" className="border border-border bg-surface px-md py-sm text-body">
            {copy.areaRequired}
          </p>
        ) : null}

        {phase === 'error' ? (
          <p role="alert" className="border border-border bg-surface px-md py-sm text-body">
            {copy.candidateError}
          </p>
        ) : null}
      </div>

      {/* The explicit choice travels with the post; it is the candidate the resident selected. */}
      {selected === null ? null : (
        <input type="hidden" name="confirmedRank" value={String(selected.rank)} />
      )}

      <div className="flex flex-col gap-sm sm:flex-row">
        <Button
          type="submit"
          variant="primary"
          disabled={locked || selected === null}
          isLoading={pending}
        >
          {pending ? copy.confirming : copy.confirm}
        </Button>
        <Button
          type="submit"
          variant="secondary"
          name="noneOfThese"
          value="1"
          formNoValidate
          disabled={locked}
        >
          {offline ? copy.offlineSubmit : copy.noneOfThese}
        </Button>
      </div>
      <p className="text-small text-text-secondary">{copy.noneOfTheseHint}</p>

      {locked ? (
        <p role="status" className="text-small text-text-secondary">
          {pending ? copy.confirming : copy.offline}
        </p>
      ) : null}

      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    </>
  );
}

export function WardForm({ action, ...props }: WardFormProps) {
  return (
    <form action={action} className="flex flex-col gap-lg">
      <WardFormBody {...props} />
    </form>
  );
}
