/**
 * `GET /api/me` — the member's own record read (`C-032`, `FEAT-012`, `NFR-040`,
 * `screens/13-my-record.md`).
 *
 * The handler parses the submission page, resolves the session cookie and calls the domain's
 * `readMyRecord`; it decides no rule of its own and renders nothing. This is the only response in
 * the system permitted to carry `fullName`, `telephoneNumber` and `declaredAge`, and only for the
 * session's own member. A staff session has no view of it.
 *
 * The answer is never cached: a shared cache holding one member's record body would serve it to
 * the next caller.
 */
import type { NextRequest } from 'next/server';
import { identityFailure, readMyRecord, readSession, toIsoSeconds } from '@odp/domain';
import { readCorrelationId } from '../../../lib/logging/correlation';
import { presentedSessionTokens } from '../../../lib/session/session-cookies';
import { getMyRecordRuntime, resolveMyRecordSession } from '../../(record)/me/_lib/runtime';
import {
  failureAnswer,
  jsonAnswer,
  myRecordAnswer,
  validationAnswer,
} from '../../(record)/me/_lib/envelope';

export const dynamic = 'force-dynamic';

/** Answers one page of the caller's own record. */
export async function GET(request: NextRequest): Promise<Response> {
  const correlation = readCorrelationId(request.headers);
  const correlationId = correlation.correlationId;
  if (!correlation.ok) {
    return jsonAnswer(
      validationAnswer(
        correlationId,
        'CORRELATION_ID_INVALID',
        'The correlation identifier is not in the contract\'s form.',
        { 'X-Correlation-Id': 'PATTERN_MISMATCH' },
      ),
      correlationId,
    );
  }

  const params = request.nextUrl.searchParams;

  const rawLimit = params.get('submissionLimit');
  let submissionLimit: number | undefined;
  if (rawLimit !== null) {
    if (!/^[0-9]{1,2}$/.test(rawLimit)) {
      return jsonAnswer(
        validationAnswer(
          correlationId,
          'MY_RECORD_QUERY_INVALID',
          'The page size is not in the contract’s form.',
          { submissionLimit: 'OUT_OF_BAND' },
        ),
        correlationId,
      );
    }
    submissionLimit = Number(rawLimit);
  }

  const rawCursor = params.get('submissionCursor');
  const submissionCursor = rawCursor === null ? undefined : rawCursor;

  const tokens = await presentedSessionTokens();
  const session = await resolveMyRecordSession(tokens.memberSessionToken ?? null);
  if (session.kind === 'degraded') {
    return jsonAnswer(
      failureAnswer(
        identityFailure(
          'SERVICE_DEGRADED',
          'IDENTITY_STORE_UNAVAILABLE',
          'Your record could not be read. Try again in a moment.',
        ),
        correlationId,
      ),
      correlationId,
    );
  }

  const runtime = await getMyRecordRuntime();

  // `C-032`: a staff session has no view of this response, and is refused by role rather than
  // answered as a signed-out visitor.
  if (session.kind === 'signed-out') {
    const staffOnly = await readSession(runtime.ports, {
      ...(tokens.staffSessionToken === undefined
        ? {}
        : { staffSessionToken: tokens.staffSessionToken }),
    }).catch(() => null);
    if (staffOnly !== null && staffOnly.ok && staffOnly.staff !== null) {
      return jsonAnswer(
        failureAnswer(
          identityFailure(
            'FORBIDDEN_ROLE',
            'MEMBER_SESSION_REQUIRED',
            'There is no staff view of a member’s personal record.',
          ),
          correlationId,
        ),
        correlationId,
      );
    }
  }

  const result = await readMyRecord(
    session.kind === 'member'
      ? {
          kind: 'member',
          memberId: session.member.id,
          sessionId: session.token,
          correlationId,
        }
      : { kind: 'public', correlationId },
    runtime.ports,
    {
      ...(submissionCursor === undefined ? {} : { submissionCursor }),
      ...(submissionLimit === undefined ? {} : { submissionLimit }),
    },
  );

  const answer = myRecordAnswer(result, {
    correlationId,
    asAt: toIsoSeconds(runtime.platform.clock.now()),
  });
  return jsonAnswer(answer, correlationId);
}
