/**
 * The production runner for `confirmWard` (`C-011`, ADR-002, `NFR-028`).
 *
 * One submission is one database transaction: the idempotency claim, the member's ward or the queued
 * review, the alias the resident's wording becomes, and the audit record commit together. A refused
 * domain result throws a typed marker, which rolls the transaction back and releases the claim with
 * no cleanup — the same key may then be retried. A completed answer is stored on the claim, so a
 * replay of the same key returns the recorded outcome instead of writing twice.
 */
import {
  claimIdempotencyKey,
  completeIdempotencyClaim,
  fingerprintRequest,
  withTransaction,
  type TransactionScope,
} from '@odp/db';
import {
  confirmWard as confirmWardUseCase,
  wardFailure,
  type ConfirmWardInput,
  type ConfirmWardResult,
  type WardCaller,
  type WardFailure,
} from '@odp/domain';
import type { Platform } from '@odp/platform';
import { buildWardPorts, createWardAnalytics, type WardLocale } from './runtime';
import { CONFIRM_IDEMPOTENCY_SCOPE, type ConfirmWardRunner } from './confirm';

/** How long a claimed idempotency key is remembered (`C-001`: twenty-four hours). */
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/** Raised to roll the transaction back when the domain refused the write. */
class ConfirmRefusal extends Error {
  readonly result: WardFailure;

  constructor(result: WardFailure) {
    super(result.message);
    this.name = 'ConfirmRefusal';
    this.result = result;
  }
}

/** What one transactional run reported. */
/** What the action knows about the request: the platform and where the member reads the screen. */
export interface ConfirmWardRunnerContext {
  readonly platform: Platform;
  readonly locale: WardLocale;
  readonly correlationId?: string;
}

/**
 * Builds the transactional runner the action calls.
 *
 * @param context - The platform bundle, the member's locale and the request's correlation
 *   identifier, for the events the confirmation emits (`EVT-007`, `EVT-008`).
 */
export function createConfirmWardRunner(context: ConfirmWardRunnerContext): ConfirmWardRunner {
  return {
    async run(
      caller: WardCaller,
      input: ConfirmWardInput,
      options: { readonly idempotencyKey: string },
    ): Promise<ConfirmWardResult> {
      // The fingerprint names the request, so a key reused with different words is a conflict
      // rather than a silent second write (`C-001`).
      const fingerprint = fingerprintRequest({ caller, input });

      const outcome = await withTransaction(async (scope: TransactionScope) => {
        const at = toC001Instant(context.platform.clock.now());
        const claim = await claimIdempotencyKey(scope, {
          scope: CONFIRM_IDEMPOTENCY_SCOPE,
          key: options.idempotencyKey,
          fingerprint,
          now: at,
          expiresAt: addSeconds(at, IDEMPOTENCY_TTL_SECONDS),
        });

        if (claim.kind === 'replay') {
          return { kind: 'replayed', result: claim.response as ConfirmWardResult };
        }
        if (claim.kind === 'conflict') {
          // A stable cause names the reuse; the screen answers with its write-failed sentence.
          throw new ConfirmRefusal(
            wardFailure(
              'VALIDATION_FAILED',
              'IDEMPOTENCY_KEY_REUSED',
              'The submission was already recorded with this key.',
            ),
          );
        }
        if (claim.kind === 'in_progress') {
          throw new ConfirmRefusal(
            wardFailure(
              'VALIDATION_FAILED',
              'IDEMPOTENCY_IN_PROGRESS',
              'The same submission is still being recorded.',
            ),
          );
        }

        // The analytics sink writes through the same transaction: the event belongs to the write
        // and a rollback takes both. A refusal inside the dispatcher never throws (`C-089`).
        const analytics = createWardAnalytics({
          platform: context.platform,
          executor: scope,
          memberId: caller.kind === 'member' ? caller.memberId : '',
          locale: context.locale,
          ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
        });

        const result = await confirmWardUseCase(
          caller,
          buildWardPorts(scope, context.platform, analytics),
          input,
        );
        if (!result.ok) throw new ConfirmRefusal(result);

        await completeIdempotencyClaim(scope, {
          scope: CONFIRM_IDEMPOTENCY_SCOPE,
          key: options.idempotencyKey,
          fingerprint,
          response: result,
        });
        return { kind: 'completed', result };
      }).catch((error: unknown) => {
        if (error instanceof ConfirmRefusal) return { kind: 'refused', result: error.result };
        throw error;
      });

      return outcome.result;
    },
  };
}

/** A `C-001` instant: RFC 3339, UTC, second precision. */
function toC001Instant(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Adds whole seconds to a `C-001` instant.
 *
 * @param at - The instant, `C-001` form.
 * @param seconds - Positive whole seconds.
 */
function addSeconds(at: string, seconds: number): string {
  return toC001Instant(new Date(Date.parse(at) + seconds * 1000));
}
