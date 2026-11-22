/**
 * `GET /api/me/data-requests/{requestId}/file` — the export download (`C-036`, `FEAT-012`,
 * `NFR-040`).
 *
 * The handler resolves the session, asks the domain for the request's file and streams the bytes
 * the short-lived signed URL serves. The URL is minted server-side for one object, is never put in
 * a page, a cache or a log, and expires in five minutes (`C-036`, `NFR-045`).
 *
 * A request that is unknown, another member's, or not an export answers `NOT_FOUND`. A deferred
 * export answers `LEGAL_HOLD` with the request's recorded note and review date. Nothing is cached.
 */
import type { NextRequest } from 'next/server';
import { downloadExport, identityFailure } from '@odp/domain';
import { readCorrelationId } from '../../../../../../lib/logging/correlation';
import { presentedMemberSessionToken } from '../../../../../../lib/session/session-cookies';
import {
  getMyRecordRuntime,
  resolveMyRecordSession,
} from '../../../../../(record)/me/_lib/runtime';
import { failureAnswer, jsonAnswer, validationAnswer } from '../../../../../(record)/me/_lib/envelope';

export const dynamic = 'force-dynamic';

interface ExportRouteContext {
  readonly params: Promise<{ readonly requestId: string }>;
}

/** Serves the caller's own completed export. */
export async function GET(request: NextRequest, context: ExportRouteContext): Promise<Response> {
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

  const { requestId } = await context.params;

  const token = await presentedMemberSessionToken();
  const session = await resolveMyRecordSession(token);
  if (session.kind === 'degraded') {
    return jsonAnswer(
      failureAnswer(
        identityFailure(
          'SERVICE_DEGRADED',
          'OBJECT_STORAGE_UNAVAILABLE',
          'The file could not be reached. Try again in a moment.',
        ),
        correlationId,
      ),
      correlationId,
    );
  }

  const runtime = await getMyRecordRuntime();
  const result = await downloadExport(
    session.kind === 'member'
      ? {
          kind: 'member',
          memberId: session.member.id,
          sessionId: session.token,
          correlationId,
        }
      : { kind: 'public', correlationId },
    runtime.ports,
    { requestId },
  );

  if (!result.ok) {
    return jsonAnswer(failureAnswer(result, correlationId), correlationId);
  }

  // The signed URL is read once, here, and the bytes are streamed to the member. An unreachable
  // store is a degraded read, never an empty file.
  let upstream: Response;
  try {
    upstream = await fetch(result.url);
  } catch {
    return jsonAnswer(
      failureAnswer(
        identityFailure(
          'SERVICE_DEGRADED',
          'OBJECT_STORAGE_UNAVAILABLE',
          'The file could not be reached. Try again in a moment.',
        ),
        correlationId,
      ),
      correlationId,
    );
  }
  if (!upstream.ok || upstream.body === null) {
    return jsonAnswer(
      failureAnswer(
        identityFailure(
          'SERVICE_DEGRADED',
          'OBJECT_STORAGE_UNAVAILABLE',
          'The file could not be reached. Try again in a moment.',
        ),
        correlationId,
      ),
      correlationId,
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
      'X-Correlation-Id': correlationId,
    },
  });
}
