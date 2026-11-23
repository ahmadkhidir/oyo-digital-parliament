/**
 * `GET /api/staff/session` — the staff session read (`C-092`, `NFR-026`).
 *
 * Public by contract: the answer reports the caller's state and a signed-out staff caller is a
 * successful `200` rather than a refusal, because the shell must render that state. The handler
 * parses nothing, decides no rule and renders nothing; it reads the staff cookie, asks the domain
 * and prints the answer, applying the renewed or cleared cookie the read returned.
 *
 * The domain's screen names are the console's; the route prints the routes this deployable serves,
 * which `C-092` as corrected by P1-00k fixes at `/staff/2fa` and `/admin`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { readStaffSession, toIsoSeconds } from '@odp/domain';
import { rateLimited } from '../../../../lib/http/rate-limit';
import { readCorrelationId } from '../../../../lib/logging/correlation';
import { getStaffAdminDependencies } from '../../../../lib/staff-session/deps';
import {
  applyStaffSessionCookie,
  presentedStaffSessionToken,
} from '../../../../lib/staff-session/cookies';

export const dynamic = 'force-dynamic';

/** Answers the caller's staff session state in the `C-092` body. */
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const correlation = readCorrelationId(request.headers);
  const correlationId = correlation.correlationId;
  if (!correlation.ok) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_FAILED',
          cause: 'CORRELATION_ID_INVALID',
          message: "The correlation identifier is not in the contract's form.",
          correlationId,
          fields: { 'X-Correlation-Id': 'PATTERN_MISMATCH' },
        },
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store', 'X-Correlation-Id': correlationId },
      },
    );
  }

  const dependencies = await getStaffAdminDependencies();
  const token = await presentedStaffSessionToken();

  const result = await readStaffSession(dependencies.identity, {
    ...(token === null ? {} : { staffSessionToken: token }),
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.code,
          cause: result.cause,
          message: result.message,
          correlationId,
        },
      },
      {
        status: result.code === 'SERVICE_DEGRADED' ? 503 : 500,
        headers: { 'Cache-Control': 'no-store', 'X-Correlation-Id': correlationId },
      },
    );
  }

  if (result.cookie !== undefined) await applyStaffSessionCookie(result.cookie);

  const nextScreen =
    result.signedIn && result.staff.secondFactorSatisfied && result.staff.secondFactorEnrolled
      ? '/admin'
      : result.signedIn
        ? '/staff/2fa'
        : '/staff/sign-in';

  return NextResponse.json(
    {
      data: result.signedIn
        ? {
            signedIn: true,
            staff: result.staff,
            session: result.session,
            nextScreen,
          }
        : { signedIn: false, staff: null, session: null, nextScreen },
      meta: {
        correlationId,
        asAt: toIsoSeconds(dependencies.platform.clock.now()),
        degraded: false,
      },
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store', 'X-Correlation-Id': correlationId },
    },
  );
}

/** Every answer carries the `C-001` rate-limit triple, signed-in or signed-out. */
export const GET: (request: NextRequest) => Promise<Response> = rateLimited(handleGet);
