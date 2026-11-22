'use server';

/**
 * The `confirmWard` server action (`C-011`, `screens/05-ward-confirmation.md`).
 *
 * One exported action for the one contract entry the screen's form posts to. The session decides the
 * member identifier and the record the action may write; the form never names either (`C-011` is the
 * session member's own record). Every path ends in a redirect, which is what keeps the form working
 * with scripting disabled: a refused submission re-renders the screen with the resident's words read
 * back from a server-side echo, and a success follows the contract's `nextScreen`.
 *
 * The resident's description never enters a URL. The redirect carries a fixed reason token and the
 * digest that names the echo; the words themselves stay on the server.
 */
import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { newCorrelationId } from '../../../../lib/logging';
import { presentedMemberSessionToken } from '../../../../lib/session/session-cookies';
import { getWardDependencies, resolveMemberSession } from './_lib/runtime';
import {
  CONFIRM_IDEMPOTENCY_SCOPE,
  SIGN_IN_PATH,
  parseConfirmWardForm,
  processConfirmWard,
  type ConfirmWardDecision,
  type ConfirmWardRawForm,
} from './_lib/confirm';
import { createConfirmWardRunner } from './_lib/confirm-transaction';
import { echoKey, saveEcho } from './_lib/form-echo';

/** The screen's own address, where every refused submission re-renders. */
const WARD_SCREEN_PATH = '/join/ward';

/** The SHA-256 of a UTF-8 string, hex-encoded, used to name the echo. */
function digestOf(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Reads the form's fields exactly as the browser sent them. */
function readForm(formData: FormData): ConfirmWardRawForm {
  return {
    description: formData.get('description'),
    localGovernmentArea: formData.get('localGovernmentArea'),
    confirmedWardId: formData.get('confirmedWardId'),
    confirmedRank: formData.get('confirmedRank'),
    noneOfThese: formData.get('noneOfThese'),
    idempotencyKey: formData.get('idempotencyKey'),
  };
}

/**
 * Records the confirmed ward, or queues the description for review (`C-011`).
 *
 * @param formData - The description, the chosen local government area, the candidate the resident
 *   selected (or "None of these"), and the render's idempotency key.
 */
export async function confirmWardAction(formData: FormData): Promise<void> {
  const token = await presentedMemberSessionToken();
  const member = await resolveMemberSession(token ?? undefined);
  if (member === null) redirect(SIGN_IN_PATH);

  const raw = readForm(formData);
  const dependencies = await getWardDependencies();
  const rawKey = typeof raw.idempotencyKey === 'string' ? raw.idempotencyKey : '';
  const formDigest = rawKey === '' ? null : digestOf(`${CONFIRM_IDEMPOTENCY_SCOPE}:${rawKey}`);

  const parsed = parseConfirmWardForm(raw);
  if ('reason' in parsed) {
    // A refused field keeps the typed words wherever the render's key is usable; the reason token
    // and digest are the only values that enter the URL.
    if (formDigest !== null) {
      await saveEcho(dependencies.platform.cache, echoKey('confirm', formDigest), {
        description: typeof raw.description === 'string' ? raw.description : '',
        localGovernmentArea:
          typeof raw.localGovernmentArea === 'string' ? raw.localGovernmentArea : '',
      });
    }
    redirect(
      `${WARD_SCREEN_PATH}?e=${parsed.reason}${formDigest === null ? '' : `&k=${formDigest}`}`,
    );
  }

  // The parser proved the key is a UUID, so a digest exists for every submission that reaches here.
  const echoDigest =
    formDigest ?? digestOf(`${CONFIRM_IDEMPOTENCY_SCOPE}:${parsed.idempotencyKey}`);

  const correlationId = newCorrelationId();
  const runner = createConfirmWardRunner({
    platform: dependencies.platform,
    locale: member.locale,
    correlationId,
  });

  let decision: ConfirmWardDecision;
  try {
    decision = await processConfirmWard(
      runner,
      { kind: 'member', memberId: member.id, correlationId },
      parsed,
      echoDigest,
    );
  } catch {
    // A store that did not answer is the screen's write-failed state; nothing was recorded.
    decision = { kind: 'invalid', reason: 'write_failed', echoKey: echoDigest };
  }

  switch (decision.kind) {
    case 'signed-out':
    case 'confirmed':
    case 'queued':
      return redirect(decision.redirectTo);
    case 'invalid': {
      // The wording survives the refusal: held server-side under the digest, so the redirected
      // render puts it back and the URL carries no free text.
      if (decision.echoKey !== undefined) {
        await saveEcho(dependencies.platform.cache, echoKey('confirm', decision.echoKey), {
          description: parsed.description,
          localGovernmentArea: parsed.localGovernmentArea,
        });
      }
      const key = decision.echoKey === undefined ? '' : `&k=${decision.echoKey}`;
      redirect(`${WARD_SCREEN_PATH}?e=${decision.reason}${key}`);
    }
  }
}
