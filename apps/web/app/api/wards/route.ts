/**
 * `GET /api/wards` — the ward list read (`C-009`, `FEAT-002`, `NFR-002`).
 *
 * Public by contract. The handler parses the query, calls the domain's read and answers in the
 * `C-001` envelope; it decides no rule of its own. When the reference cannot be read the domain
 * answers `SERVICE_DEGRADED` with `WARD_REFERENCE_UNAVAILABLE`, and the screen then offers the
 * free-text field alone, which `FEAT-002` makes sufficient.
 */
import type { NextRequest } from 'next/server';
import { listWards, toIsoSeconds } from '@odp/domain';
import { buildWardReadPorts, getWardDependencies } from '../../(entry)/join/ward/_lib/runtime';
import {
  failureEnvelope,
  jsonResponse,
  readCorrelationId,
  readEnvelope,
  validationEnvelope,
} from '../../(entry)/join/ward/_lib/envelope';
import { parseWardListQuery, wardListData } from '../../(entry)/join/ward/_lib/ward-list';

export const dynamic = 'force-dynamic';

/** Answers one page of the platform's ward reference. */
export async function GET(request: NextRequest): Promise<Response> {
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

  const reading = parseWardListQuery(request.nextUrl.searchParams);
  if (!reading.ok) {
    const failure = failureEnvelope(reading.failure, context);
    return jsonResponse(failure.status, failure.body, context);
  }

  const dependencies = await getWardDependencies();
  const { wards } = buildWardReadPorts(dependencies.database);
  const result = await listWards(
    { kind: 'public', correlationId: context.correlationId },
    { wards },
    reading.input,
  );

  if (!result.ok) {
    const failure = failureEnvelope(result, context);
    return jsonResponse(failure.status, failure.body, context);
  }

  const envelope = readEnvelope(wardListData(result.wards), context, {
    asAt: toIsoSeconds(dependencies.platform.clock.now()),
    nextCursor: result.nextCursor,
    hasMore: result.nextCursor !== null,
  });
  return jsonResponse(envelope.status, envelope.body, context);
}
