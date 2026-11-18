/**
 * Deletion propagation across the analytics store (`analytics.md` Analytics Data Governance,
 * `C-077` operation `analytics.replaceUserToken`).
 *
 * A deletion request replaces the member's `user_id` on every stored event with a token that cannot be
 * reversed, so the campaign keeps the counts it published while the events stop being attributable.
 * The operation is idempotent: the replacement uses the same derived token on every attempt, and the
 * count of replaced events is what the caller reports back.
 *
 * `C-090` states the completion rule: the request is not complete until the analytics store and the
 * audit log both confirm. This use case owns the analytics half only; the caller appends
 * `member_data.deleted` to the audit log after it returns.
 */
import type { PseudonymTokenPort } from './ports.ts';

/** A member id in the `C-001` form. */
const USER_ID_PATTERN = /^usr_[0-9A-HJKMNP-TV-Z]{4,26}$/;

/** What the boundaries this use case needs offer. */
export interface ReplaceUserTokenDeps {
  readonly store: {
    replaceUserToken(userId: string, token: string): Promise<{ readonly replaced: number }>;
  };
  readonly pseudonymTokens: PseudonymTokenPort;
}

/** The operation's outcome. */
export type ReplaceUserTokenResult =
  | { readonly ok: true; readonly userIdToken: string; readonly replacedEvents: number }
  | {
      readonly ok: false;
      readonly code: 'VALIDATION_FAILED' | 'SERVICE_DEGRADED';
      readonly cause: string;
      readonly message: string;
      readonly fields: Readonly<Record<string, 'REQUIRED' | 'PATTERN_MISMATCH'>>;
    };

/**
 * Replaces one member's pseudonymous id across the analytics store.
 *
 * @param deps - The analytics store and the token derivation.
 * @param input - The member id whose events must stop being attributable.
 */
export async function replaceAnalyticsUserToken(
  deps: ReplaceUserTokenDeps,
  input: { readonly userId: string },
): Promise<ReplaceUserTokenResult> {
  if (typeof input.userId !== 'string' || !USER_ID_PATTERN.test(input.userId)) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      cause: 'USER_ID_INVALID',
      message: 'A member id is required to replace an analytics identity.',
      fields: { userId: typeof input.userId === 'string' ? 'PATTERN_MISMATCH' : 'REQUIRED' },
    };
  }

  const token = await deps.pseudonymTokens.derive(input.userId);
  try {
    const { replaced } = await deps.store.replaceUserToken(input.userId, token);
    return { ok: true, userIdToken: token, replacedEvents: replaced };
  } catch {
    return {
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'ANALYTICS_STORE_UNAVAILABLE',
      message:
        'The analytics store did not confirm the replacement, so the request is not complete.',
      fields: {},
    };
  }
}
