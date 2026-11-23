/**
 * `GET /api/privacy-notice` — the published privacy notice and its history (`C-037`, `NFR-040`,
 * `NFR-045`, `screens/23-privacy-notice.md`).
 *
 * Public by contract: the notice must be readable before registration. The handler reads the
 * published versions, selects the current one or the `version` query names, and answers in the
 * `C-001` envelope. An unknown version is `NOT_FOUND`; the notice is never invented for a version
 * that was never published.
 */
import type { NextRequest } from 'next/server';
import { identityFailure, toIsoSeconds } from '@odp/domain';
import { rateLimited } from '../../../lib/http/rate-limit';
import { readCorrelationId } from '../../../lib/logging/correlation';
import { resolveLocale } from '../../../lib/i18n/locale';
import { getMyRecordRuntime } from '../../(record)/me/_lib/runtime';
import { launchNoticeHistory, selectNotice } from '../../(entry)/privacy/_lib/notice';
import {
  failureAnswer,
  jsonAnswer,
  validationAnswer,
  type RecordAnswer,
} from '../../(record)/me/_lib/envelope';

export const dynamic = 'force-dynamic';

/** Answers the published notice, or the version named in the query. */
async function handleGet(request: NextRequest): Promise<Response> {
  const correlation = readCorrelationId(request.headers);
  const correlationId = correlation.correlationId;
  if (!correlation.ok) {
    return jsonAnswer(
      validationAnswer(
        correlationId,
        'CORRELATION_ID_INVALID',
        "The correlation identifier is not in the contract's form.",
        { 'X-Correlation-Id': 'PATTERN_MISMATCH' },
      ),
      correlationId,
    );
  }

  const rawVersion = request.nextUrl.searchParams.get('version');
  if (rawVersion !== null && rawVersion.trim() === '') {
    return jsonAnswer(
      validationAnswer(
        correlationId,
        'NOTICE_VERSION_INVALID',
        'The version is not in the contract’s form.',
        { version: 'PATTERN_MISMATCH' },
      ),
      correlationId,
    );
  }

  const locale = await resolveLocale();
  const history = launchNoticeHistory(locale);
  const selection = selectNotice(history, rawVersion);
  if (selection === null) {
    return jsonAnswer(
      failureAnswer(
        identityFailure(
          'NOT_FOUND',
          'NOTICE_VERSION_NOT_FOUND',
          'That version was never published.',
        ),
        correlationId,
      ),
      correlationId,
    );
  }

  const runtime = await getMyRecordRuntime();
  const answer: RecordAnswer = {
    status: 200,
    body: {
      data: {
        notice: {
          version: selection.notice.version,
          effectiveAt: selection.notice.effectiveAt,
          summary: selection.notice.summary,
          lawfulBasis: selection.notice.lawfulBasis,
          rights: selection.notice.rights,
          retention: selection.notice.retention,
          processors: selection.notice.processors,
        },
        previousVersions: selection.previousVersions,
      },
      meta: {
        correlationId,
        asAt: toIsoSeconds(runtime.platform.clock.now()),
        degraded: false,
      },
    },
  };

  return jsonAnswer(answer, correlationId);
}

/**
 * Every answer carries the `C-001` rate-limit triple, this public read included: it consults no
 * limiter, so it reports the read allowance with nothing consumed (`C-001`, `NFR-027`).
 */
export const GET: (request: NextRequest) => Promise<Response> = rateLimited(handleGet);
