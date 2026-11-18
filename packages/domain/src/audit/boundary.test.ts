/**
 * The `C-077` boundary: four operations, no fifth, and the two failure rules that differ between the
 * audit half (a failed append fails the write) and the analytics half (a failed emit is the caller's
 * to buffer).
 */
import { describe, expect, it } from 'vitest';

import type { AnalyticsEmitRequest } from '../analytics/envelope.ts';
import { handleAuditAnalyticsBoundary, type AuditAnalyticsBoundaryDeps } from './boundary.ts';
import type { AuditAccessLogEntry } from './entities.ts';
import type { AuditEventRecord } from './entities.ts';

const ACCESS_ENTRY: AuditAccessLogEntry = {
  auditEventId: 'aud_01J9ZN2Q4R6S8T1V3W5X7Y9ZA',
  actorId: 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NP',
  actorRole: 'operator',
  action: 'member_data.read',
  occurredAt: '2026-11-25T12:00:00Z',
};

/** A valid `EVT-001` envelope, as the web client sends it. */
function screenViewed(): Record<string, unknown> {
  return {
    event_name: 'screen_viewed',
    event_id: 'evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AB',
    occurred_at: '2026-11-25T12:00:00Z',
    user_id: 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
    anonymous_id: null,
    session_id: 'ses_01J9ZQ2S4T6V8W1X3Y5Z7AB',
    platform: 'web',
    app_version: '2026.11.3',
    locale: 'en-NG',
    properties: { screen: 'home', device_class: 'mobile', signed_in: false },
  };
}

/** The whole boundary, with every effect recorded rather than performed. */
function deps(options: { auditThrows?: boolean; analyticsThrows?: boolean } = {}) {
  const auditRecords: AuditEventRecord[] = [];
  const emitted: AnalyticsEmitRequest[] = [];
  const replaced: Array<{ userId: string; token: string }> = [];

  const value: AuditAnalyticsBoundaryDeps = {
    audit: {
      store: {
        async append(event) {
          if (options.auditThrows === true) throw new Error('log unavailable');
          auditRecords.push(event);
          return { sequence: 184223 };
        },
      },
      accessLog: {
        async read() {
          return { entries: [ACCESS_ENTRY], nextCursor: null };
        },
      },
      identifiers: {
        next(prefix: string) {
          return `${prefix}_01J9ZN2Q4R6S8T1V3W5X7Y9ZA`;
        },
      },
    },
    analytics: {
      store: {
        async emit(request) {
          if (options.analyticsThrows === true) throw new Error('platform unavailable');
          emitted.push(request);
          return { storedAt: '2026-11-25T12:00:01Z' };
        },
        async replaceUserToken(userId, token) {
          replaced.push({ userId, token });
          return { replaced: 12 };
        },
      },
      pseudonymTokens: {
        async derive(userId: string) {
          return `ano_${userId.slice(4)}`;
        },
      },
    },
    permittedAnalyticsComponents: ['web', 'worker'],
  };
  return { deps: value, auditRecords, emitted, replaced };
}

const CALLER = { component: 'web' } as const;

describe('audit and analytics boundary', () => {
  it('appends an audit record and answers with its position', async () => {
    const { deps: d, auditRecords } = deps();
    const response = await handleAuditAnalyticsBoundary(
      d,
      { component: 'system' },
      {
        operation: 'audit.append',
        args: {
          actorId: 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NP',
          actorRole: 'response_staff',
          action: 'decision.published',
          entityType: 'Decision',
          entityId: 'dec_01J9ZB1C3D5E7F9G1H3J5K7LMP',
          reason: 'Commit published against ODP-004821.',
          occurredAt: '2026-11-25T12:00:00Z',
          correlationId: 'req_01J9Z6M2V4',
        },
      },
    );
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.status).toBe(201);
    expect(response.operation).toBe('audit.append');
    expect(response.result).toMatchObject({ appended: true, sequence: 184223 });
    expect(auditRecords).toHaveLength(1);
  });

  it('refuses an audit reason that copies personal data, and writes nothing', async () => {
    const { deps: d, auditRecords } = deps();
    const response = await handleAuditAnalyticsBoundary(
      d,
      { component: 'system' },
      {
        operation: 'audit.append',
        args: {
          actorId: 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NP',
          actorRole: 'moderator',
          action: 'comment.removed',
          entityType: 'Comment',
          entityId: 'cmt_01J9ZB1C3D5E7F9G1H3J5K7LMP',
          reason: 'Author reachable on 0803 123 4567',
          occurredAt: '2026-11-25T12:00:00Z',
        },
      },
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.status).toBe(422);
      expect(response.error.code).toBe('POLICY_VIOLATION');
      expect(response.error.cause).toBe('PERSONAL_DATA_IN_AUDIT_REASON');
    }
    expect(auditRecords).toHaveLength(0);
  });

  it('reports a failed audit append as degraded, so the caller abandons its write', async () => {
    const { deps: d } = deps({ auditThrows: true });
    const response = await handleAuditAnalyticsBoundary(
      d,
      { component: 'system' },
      {
        operation: 'audit.append',
        args: {
          actorId: 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NP',
          actorRole: 'operator',
          action: 'member_data.export',
          entityType: 'Member',
          entityId: 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
          occurredAt: '2026-11-25T12:00:00Z',
        },
      },
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.status).toBe(503);
      expect(response.error.code).toBe('SERVICE_DEGRADED');
      expect(response.error.cause).toBe('AUDIT_APPEND_FAILED');
    }
  });

  it('accepts an analytics event from a permitted component', async () => {
    const { deps: d, emitted } = deps();
    const response = await handleAuditAnalyticsBoundary(d, CALLER, {
      operation: 'analytics.emit',
      args: screenViewed(),
    });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.status).toBe(201);
    expect(response.result).toMatchObject({
      accepted: true,
      event_id: 'evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AB',
      storedAt: '2026-11-25T12:00:01Z',
    });
    expect(emitted).toHaveLength(1);
  });

  it('refuses an emitter that is not on the permitted list', async () => {
    const { deps: d, emitted } = deps();
    const response = await handleAuditAnalyticsBoundary(
      d,
      { component: 'admin_script' },
      {
        operation: 'analytics.emit',
        args: screenViewed(),
      },
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.status).toBe(403);
      expect(response.error.code).toBe('FORBIDDEN_ROLE');
      expect(response.error.cause).toBe('COMPONENT_NOT_PERMITTED');
    }
    expect(emitted).toHaveLength(0);
  });

  it('refuses an event that carries a person, and stores nothing', async () => {
    const { deps: d, emitted } = deps();
    const response = await handleAuditAnalyticsBoundary(d, CALLER, {
      operation: 'analytics.emit',
      args: {
        ...screenViewed(),
        properties: { screen: 'home', ward_description: 'Bodija ward three near the market' },
      },
    });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.status).toBe(422);
      expect(response.error.code).toBe('POLICY_VIOLATION');
      expect(response.error.cause).toBe('PERSONAL_DATA_IN_EVENT');
    }
    expect(emitted).toHaveLength(0);
  });

  it('reports an unreachable analytics store without failing anything else', async () => {
    const { deps: d } = deps({ analyticsThrows: true });
    const response = await handleAuditAnalyticsBoundary(d, CALLER, {
      operation: 'analytics.emit',
      args: screenViewed(),
    });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.status).toBe(503);
      expect(response.error.cause).toBe('ANALYTICS_STORE_UNAVAILABLE');
    }
  });

  it('serves the access log', async () => {
    const { deps: d } = deps();
    const response = await handleAuditAnalyticsBoundary(
      d,
      { component: 'external_reviewer_surface' },
      { operation: 'audit.readAccessLog', args: { limit: 10 } },
    );
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.status).toBe(200);
      expect(response.result).toEqual({ ok: true, entries: [ACCESS_ENTRY], nextCursor: null });
    }
  });

  it('replaces an analytics identity', async () => {
    const { deps: d, replaced } = deps();
    const response = await handleAuditAnalyticsBoundary(
      d,
      { component: 'system' },
      {
        operation: 'analytics.replaceUserToken',
        args: { userId: 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA' },
      },
    );
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.result).toMatchObject({ ok: true, replacedEvents: 12 });
    }
    expect(replaced).toHaveLength(1);
  });

  it('has no update or delete operation, and no fifth operation', async () => {
    const { deps: d } = deps();
    for (const operation of [
      'audit.update',
      'audit.delete',
      'analytics.delete',
      'audit.appendMany',
      '',
    ]) {
      const response = await handleAuditAnalyticsBoundary(d, CALLER, { operation, args: {} });
      expect(response.ok, operation).toBe(false);
      if (!response.ok) {
        expect(response.status).toBe(400);
        expect(response.error.cause).toBe('OPERATION_UNKNOWN');
      }
    }
  });

  it('refuses a call with no argument object', async () => {
    const { deps: d } = deps();
    const response = await handleAuditAnalyticsBoundary(d, CALLER, {
      operation: 'audit.append',
      args: [] as unknown as Record<string, unknown>,
    });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('VALIDATION_FAILED');
      expect(response.error.cause).toBe('ARGS_MALFORMED');
    }
  });
});
