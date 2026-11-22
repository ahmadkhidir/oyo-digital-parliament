/**
 * The durable analytics sink (`C-089`, `C-077`, `analytics.md`).
 *
 * These are runtime tests against a disposable PostgreSQL 16 database: the events `C-003` and
 * `C-002` produce (`EVT-003`, `EVT-004`, `EVT-042`) are built through the domain's own envelope and
 * written through the store port, so the payload asserted is the payload that would reach production
 * rather than a hand-written row. They also prove the two operations `analytics.md` adds to a store —
 * one row per event across a replay, and deletion propagation that survives a retry — and the
 * 26-month retention instant `nfr.md` fixes.
 */
import { describe, expect, it } from 'vitest';
import {
  buildAnalyticsEvent,
  type AnalyticsEmitRequest,
  type AnalyticsEventName,
  type AnalyticsPayloads,
} from '@odp/domain';
import {
  analyticsRetentionInstant,
  createAnalyticsEventRepository,
} from './analytics-event.repository.ts';
import { analyticsEvent } from '../schema/analytics-event.ts';
import { createTestDatabase, testId } from '../testing/index.ts';

/** A registered member's pseudonymous analytics identity (`C-089` `user_id`). */
const MEMBER_USER_ID = 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA';

/** Another member, whose events a deletion request must not touch. */
const OTHER_USER_ID = 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KB';

/** The instant every fixture occurs at. */
const OCCURRED_AT = '2026-11-25T12:00:00Z';

/**
 * Builds one envelope through the domain's builder, which is the only route an event takes.
 *
 * @throws when the fixture itself is outside the taxonomy, so a bad fixture fails loudly.
 */
function envelope<K extends AnalyticsEventName>(
  name: K,
  properties: AnalyticsPayloads[K],
  identity: { readonly userId: string | null; readonly anonymousId: string | null },
  eventId: string = testId('evt'),
): AnalyticsEmitRequest {
  const built = buildAnalyticsEvent({
    name,
    properties,
    eventId,
    occurredAt: OCCURRED_AT,
    sessionId: 'ses_01J9ZQ2S4T6V8W1X3Y5Z7AB',
    userId: identity.userId,
    anonymousId: identity.anonymousId,
    appVersion: '2026.11.3',
    locale: 'en-NG',
  });
  if (!built.ok) throw new Error(`The test fixture is not valid: ${built.cause}`);
  return built.request;
}

/** The three events this task names: `EVT-003`, `EVT-004` and `EVT-042`. */
const IDENTITY_EVENTS: readonly AnalyticsEmitRequest[] = [
  envelope(
    'number_confirmed',
    { attempts: 1, delivery_delay_band: 'under_30s' },
    { userId: MEMBER_USER_ID, anonymousId: null },
  ),
  envelope(
    'account_registered',
    {
      identity_state: 'registered',
      verification_method: 'self_code',
      ward_resolved: true,
      locale: 'en-NG',
    },
    { userId: MEMBER_USER_ID, anonymousId: null },
  ),
  envelope(
    'registration_started',
    { locale: 'en-NG' },
    { userId: null, anonymousId: 'prg_01J9Z4P8R2T6V8W1X3Y5Z7AB9' },
  ),
];

describe('analytics event repository', () => {
  it('stores EVT-003, EVT-004 and EVT-042 as schema-valid rows with their subject', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createAnalyticsEventRepository(database.db);

      const stored = await Promise.all(IDENTITY_EVENTS.map((event) => repository.emit(event)));
      for (const result of stored) {
        // `C-001` / `C-089`: a second-precision RFC 3339 instant, with the `Z` suffix.
        expect(result.storedAt).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/);
      }

      const rows = await database.pool.query<{
        event_id: string;
        event_name: string;
        occurred_at: string;
        user_id: string | null;
        anonymous_id: string | null;
        session_id: string;
        app_version: string;
        locale: string;
        properties: Record<string, string | number | boolean>;
        expires_at: string;
      }>(
        `select event_id, event_name, user_id, anonymous_id, session_id, app_version, locale,
                properties,
                to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as occurred_at,
                to_char(expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as expires_at
           from analytics_event
          order by event_id`,
      );

      expect(rows.rows).toHaveLength(3);
      expect(rows.rows.map((row) => row.event_name).sort()).toEqual([
        'account_registered',
        'number_confirmed',
        'registration_started',
      ]);

      const confirmed = rows.rows.find((row) => row.event_name === 'number_confirmed');
      expect(confirmed).toMatchObject({
        user_id: MEMBER_USER_ID,
        anonymous_id: null,
        occurred_at: OCCURRED_AT,
        session_id: 'ses_01J9ZQ2S4T6V8W1X3Y5Z7AB',
        app_version: '2026.11.3',
        locale: 'en-NG',
        properties: { attempts: 1, delivery_delay_band: 'under_30s' },
      });

      const registered = rows.rows.find((row) => row.event_name === 'account_registered');
      expect(registered?.properties).toEqual({
        identity_state: 'registered',
        verification_method: 'self_code',
        ward_resolved: true,
        locale: 'en-NG',
      });

      // `EVT-042` happens before the account exists, so the pending registration is the subject.
      const started = rows.rows.find((row) => row.event_name === 'registration_started');
      expect(started).toMatchObject({
        user_id: null,
        anonymous_id: 'prg_01J9Z4P8R2T6V8W1X3Y5Z7AB9',
      });

      // `nfr.md` Data lifecycle: raw events are kept 26 months, then aggregated.
      expect(confirmed?.expires_at).toBe('2029-01-25T12:00:00Z');
    } finally {
      await database.dispose();
    }
  });

  it('stores a replayed event once and reports the instant it was first stored', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createAnalyticsEventRepository(database.db);
      const event = IDENTITY_EVENTS[0] as AnalyticsEmitRequest;

      const first = await repository.emit(event);
      const replay = await repository.emit(event);

      expect(replay.storedAt).toBe(first.storedAt);
      const counted = await database.pool.query<{ total: string }>(
        'select count(*)::text as total from analytics_event',
      );
      expect(counted.rows[0]?.total).toBe('1');
    } finally {
      await database.dispose();
    }
  });

  it('refuses a payload carrying personal data and writes nothing', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createAnalyticsEventRepository(database.db);
      const refused = {
        ...IDENTITY_EVENTS[0],
        // A call site that bypasses the dispatcher still cannot store a name or free text.
        properties: { full_name: 'Oluwaseun Adeyemi', ward_description: 'Bodija ward three' },
      } as unknown as AnalyticsEmitRequest;

      await expect(repository.emit(refused)).rejects.toThrow(/POLICY_VIOLATION/);

      const counted = await database.pool.query<{ total: string }>(
        'select count(*)::text as total from analytics_event',
      );
      expect(counted.rows[0]?.total).toBe('0');
    } finally {
      await database.dispose();
    }
  });

  it('replaces one member’s identity with the derived token, idempotently', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createAnalyticsEventRepository(database.db);
      await repository.emit(IDENTITY_EVENTS[0] as AnalyticsEmitRequest);
      await repository.emit(
        envelope(
          'screen_viewed',
          { screen: 'home', device_class: 'mobile', signed_in: true },
          { userId: MEMBER_USER_ID, anonymousId: null },
        ),
      );
      await repository.emit(
        envelope(
          'screen_viewed',
          { screen: 'home', device_class: 'mobile', signed_in: true },
          { userId: OTHER_USER_ID, anonymousId: null },
        ),
      );

      // A synthetic replacement token: the real one is derived from a keyed hash outside this
      // package, so the fixture stays a plain identifier rather than a secret-shaped literal.
      const token = testId('tok');
      const first = await repository.replaceUserToken(MEMBER_USER_ID, token);
      expect(first.replaced).toBe(2);

      // The retry reports the same replacement rather than a second identity (`C-077`).
      const retry = await repository.replaceUserToken(MEMBER_USER_ID, token);
      expect(retry.replaced).toBe(2);

      const identities = await database.pool.query<{ user_id: string; total: string }>(
        'select user_id, count(*)::text as total from analytics_event group by user_id order by user_id',
      );
      expect(identities.rows).toEqual([
        { user_id: token, total: '2' },
        { user_id: OTHER_USER_ID, total: '1' },
      ]);
    } finally {
      await database.dispose();
    }
  });

  it('refuses a replacement that is not in the identifier form', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createAnalyticsEventRepository(database.db);
      await expect(
        repository.replaceUserToken('Oluwaseun Adeyemi', 'Oluwaseun Adeyemi'),
      ).rejects.toThrow(/C-001 form/);
    } finally {
      await database.dispose();
    }
  });

  it('serves the funnel and retention read paths through the declared indexes', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createAnalyticsEventRepository(database.db);
      await repository.emit(IDENTITY_EVENTS[0] as AnalyticsEmitRequest);

      // `analytics.md` Conversion conditions: one event name counted over a period.
      const funnel = await database.pool.query<{ total: string }>(
        `select count(*)::text as total from analytics_event
          where event_name = $1 and occurred_at >= $2 and occurred_at < $3`,
        ['number_confirmed', '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z'],
      );
      expect(funnel.rows[0]?.total).toBe('1');

      // `nfr.md` Data lifecycle: the 26-month sweep collects events whose retention has elapsed.
      const before = await database.pool.query(
        'select event_id from analytics_event where expires_at <= $1',
        ['2029-01-01T00:00:00Z'],
      );
      expect(before.rows).toHaveLength(0);

      const after = await database.pool.query(
        'select event_id from analytics_event where expires_at <= $1',
        ['2029-02-01T00:00:00Z'],
      );
      expect(after.rows).toHaveLength(1);
    } finally {
      await database.dispose();
    }
  });

  it('refuses a row carrying two identities, because C-089 allows exactly one', async () => {
    const database = await createTestDatabase();
    try {
      await expect(
        database.db.insert(analyticsEvent).values({
          eventId: testId('evt'),
          eventName: 'screen_viewed',
          occurredAt: OCCURRED_AT,
          userId: MEMBER_USER_ID,
          anonymousId: 'prg_01J9Z4P8R2T6V8W1X3Y5Z7AB9',
          sessionId: 'ses_01J9ZQ2S4T6V8W1X3Y5Z7AB',
          platform: 'web',
          appVersion: '2026.11.3',
          locale: 'en-NG',
          properties: { screen: 'home', device_class: 'mobile', signed_in: true },
          expiresAt: analyticsRetentionInstant(OCCURRED_AT),
        }),
      ).rejects.toMatchObject({ cause: { code: '23514' } });
    } finally {
      await database.dispose();
    }
  });
});

describe('analytics retention instant', () => {
  it('adds the 26 months nfr.md fixes, in UTC and to the second', () => {
    expect(analyticsRetentionInstant(OCCURRED_AT)).toBe('2029-01-25T12:00:00Z');
  });

  it('clamps to the last day of the target month', () => {
    // 31 December plus 26 months is February 2029, which has 28 days.
    expect(analyticsRetentionInstant('2026-12-31T09:00:00Z')).toBe('2029-02-28T09:00:00Z');
  });
});
