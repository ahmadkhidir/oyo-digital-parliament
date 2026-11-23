/**
 * `POST /api/wards/candidates` — the ward candidate suggestion (`C-010`, `FEAT-002`, `NFR-014`).
 *
 * Member session. The answer suggests up to three candidates and never assigns a ward, never writes
 * to the reference and never blocks the resident. When the model capability is off or silent the
 * answer carries `capabilityStatus:"fallback"` with candidates from alias and exact matching only,
 * and the screen shows no notice for it.
 *
 * The body is the `C-001` JSON transport. `C-010` is a read-shaped suggestion, so it carries no
 * idempotency key; the browser write's origin is still checked, because a cross-origin caller must
 * not spend a member's session to read their area suggestions.
 */
import type { NextRequest } from 'next/server';
import { createWardRepository } from '@odp/db';
import { toIsoSeconds } from '@odp/domain';
import { rateLimited } from '../../../../lib/http/rate-limit';
import { readCorrelationId } from '../../../../lib/logging';
import {
  createWardAnalytics,
  getWardDependencies,
  resolveMemberSession,
} from '../../../(entry)/join/ward/_lib/runtime';
import {
  createCandidatesRunner,
  parseCandidatesRequest,
  processCandidates,
} from '../../../(entry)/join/ward/_lib/candidates';
import {
  failureEnvelope,
  jsonResponse,
  readEnvelope,
  validationEnvelope,
} from '../../../(entry)/join/ward/_lib/envelope';
import { presentedMemberSessionToken } from '../../../../lib/session/session-cookies';

export const dynamic = 'force-dynamic';

/** Reads one JSON body, or answers `null` when the request carried none. */
async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Answers the candidate suggestion. */
async function handlePost(request: NextRequest): Promise<Response> {
  const correlation = readCorrelationId(request.headers);
  const context = { correlationId: correlation.correlationId };
  if (!correlation.ok) {
    const refusal = validationEnvelope(
      'CORRELATION_ID_INVALID',
      'The correlation identifier is not in the contract’s form.',
      { 'X-Correlation-Id': 'PATTERN_MISMATCH' },
      context,
    );
    return jsonResponse(refusal.status, refusal.body, context);
  }

  // A browser write names its origin; a cross-origin one is refused (`C-001`). The header is absent
  // for a non-browser caller, which the contract permits.
  const origin = request.headers.get('origin');
  if (origin !== null) {
    const host = request.headers.get('host');
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = '';
    }
    if (host === null || originHost !== host) {
      const refusal = validationEnvelope(
        'ORIGIN_REFUSED',
        'The request did not come from this application’s origin.',
        { Origin: 'PATTERN_MISMATCH' },
        context,
      );
      return jsonResponse(refusal.status, refusal.body, context);
    }
  }

  const parsed = parseCandidatesRequest(await readJson(request));
  if (!parsed.ok) {
    const failure = failureEnvelope(parsed.failure, context);
    return jsonResponse(failure.status, failure.body, context);
  }

  const token = await presentedMemberSessionToken();
  const member = await resolveMemberSession(token ?? undefined);
  if (member === null) {
    const failure = failureEnvelope(
      {
        ok: false,
        code: 'UNAUTHENTICATED',
        cause: 'MEMBER_SESSION_REQUIRED',
        message: 'Ward candidates are offered inside a member session.',
        fields: {},
      },
      context,
    );
    return jsonResponse(failure.status, failure.body, context);
  }

  const dependencies = await getWardDependencies();
  const runner = createCandidatesRunner({
    wards: createWardRepository(dependencies.database.db),
    analytics: createWardAnalytics({
      platform: dependencies.platform,
      executor: dependencies.database.db,
      memberId: member.id,
      locale: member.locale,
      correlationId: context.correlationId,
    }),
  });

  const outcome = await processCandidates(
    runner,
    { kind: 'member', memberId: member.id, correlationId: context.correlationId },
    parsed.request,
  );

  if (!outcome.ok) {
    const failure = failureEnvelope(outcome.failure, context);
    return jsonResponse(failure.status, failure.body, context);
  }

  const envelope = readEnvelope(outcome.answer, context, {
    asAt: toIsoSeconds(dependencies.platform.clock.now()),
  });
  return jsonResponse(envelope.status, envelope.body, context);
}

/** Every answer carries the `C-001` rate-limit triple, the suggestion included. */
export const POST: (request: NextRequest) => Promise<Response> = rateLimited(handlePost);
