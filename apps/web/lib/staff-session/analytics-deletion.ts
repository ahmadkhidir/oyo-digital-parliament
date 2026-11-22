/**
 * Deletion propagation across the analytics store (`analytics.md` Deletion propagation, `C-090`).
 *
 * A completed deletion is not complete until the stored events stop being attributable to the member.
 * The replacement token is derived from the member's opaque identifier with a fixed domain separator,
 * so every attempt derives the same token and a retry confirms the first replacement rather than
 * minting a second identity. The token is a `tok_` identifier, which is neither a person nor a member
 * identifier (`C-001`, `C-089`).
 */
import { createHash } from 'node:crypto';
import { createAnalyticsEventRepository, type Executor } from '@odp/db';
import {
  analyticsUserIdFor,
  replaceAnalyticsUserToken,
  type AnalyticsDeletionPort,
} from '@odp/domain';

/** The Crockford base32 alphabet, used for the identifier body's upper-case set. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** The domain separator, so the digest cannot be reused for another purpose. */
const TOKEN_LABEL = 'odp.analytics.deletion.v1:';

/** Derives the stable, non-reversible replacement token for one member. */
export function analyticsDeletionToken(memberId: string): string {
  const digest = createHash('sha256').update(`${TOKEN_LABEL}${memberId}`, 'utf8').digest();
  let body = '';
  for (let index = 0; index < 26; index += 1) {
    body += CROCKFORD[(digest[index] ?? 0) & 31] ?? '0';
  }
  return `tok_${body}`;
}

/** Builds the deletion-propagation adapter over the durable analytics store. */
export function createAnalyticsDeletion(executor: Executor): AnalyticsDeletionPort {
  const store = createAnalyticsEventRepository(executor);

  return {
    async replaceSubject(memberId) {
      const token = analyticsDeletionToken(memberId);
      const result = await replaceAnalyticsUserToken(
        {
          store,
          pseudonymTokens: { derive: async () => token },
        },
        { userId: analyticsUserIdFor(memberId) },
      );
      if (!result.ok) {
        throw new Error(result.message);
      }
      return { replaced: result.replacedEvents };
    },
  };
}
