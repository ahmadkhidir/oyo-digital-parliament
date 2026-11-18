/**
 * The notification copy (`C-076`, `NFR-044`).
 *
 * What is proven here: every template renders in both launch locales, a one-time code is never rendered
 * from a queue payload, a missing required value produces `null` rather than a half-written message, and
 * no body quotes a person.
 */
import { describe, expect, it } from 'vitest';
import type { OutboundNotification } from '../../../../domain/src/notifications/entities.ts';
import { createSmsNotificationBodies, renderNotificationTemplate } from './templates.ts';

const reference = 'ODP-004821';

describe('renderNotificationTemplate', () => {
  it('writes the three decision answers differently, because they mean different things', () => {
    const commit = renderNotificationTemplate({
      template: 'decision_published',
      locale: 'en-NG',
      payload: { reference, decisionType: 'commit' },
    });
    const decline = renderNotificationTemplate({
      template: 'decision_published',
      locale: 'en-NG',
      payload: { reference, decisionType: 'decline' },
    });

    expect(commit).toContain(reference);
    expect(commit).toContain('committed');
    expect(decline).toContain('declined');
    expect(decline).toContain('reason');
    expect(commit).not.toBe(decline);
  });

  it('renders every template in both launch locales', () => {
    for (const locale of ['en-NG', 'yo-NG'] as const) {
      expect(
        renderNotificationTemplate({
          template: 'appeal_decided',
          locale,
          payload: { reference },
        }),
      ).toBeTruthy();
      expect(
        renderNotificationTemplate({
          template: 'session_reminder',
          locale,
          payload: { sessionId: 'ses_01J9Z5A1B2C3D4E5F6G7H8J9K', startsAt: '2026-12-01T09:00:00Z' },
        }),
      ).toBeTruthy();
      expect(
        renderNotificationTemplate({
          template: 'data_request_outcome',
          locale,
          payload: {},
        }),
      ).toBeTruthy();
      expect(
        renderNotificationTemplate({
          template: 'decision_published',
          locale,
          payload: { reference, decisionType: 'commit' },
        }),
      ).toBeTruthy();
    }
  });

  it('states a session start in Lagos time rather than the wire instant', () => {
    const body = renderNotificationTemplate({
      template: 'session_reminder',
      locale: 'en-NG',
      payload: { sessionId: 'ses_01J9Z5A1B2C3D4E5F6G7H8J9K', startsAt: '2026-12-01T09:00:00Z' },
    });
    expect(body).toContain('2026-12-01');
    // 09:00 UTC is 10:00 in Lagos (UTC+01:00).
    expect(body).toContain('10:00');
    expect(body).not.toContain('09:00');
  });

  it('never renders a one-time code from a queued payload', () => {
    // The digits belong to the code store, which can produce them once; a queue row must not hold them.
    expect(
      renderNotificationTemplate({
        template: 'registration_code',
        locale: 'en-NG',
        payload: { targetId: 'prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9', expiresInMinutes: '10' },
      }),
    ).toBeNull();
  });

  it('answers null for a missing or malformed value instead of a half-written message', () => {
    expect(
      renderNotificationTemplate({
        template: 'decision_published',
        locale: 'en-NG',
        payload: { decisionType: 'commit' },
      }),
    ).toBeNull();
    expect(
      renderNotificationTemplate({
        template: 'session_reminder',
        locale: 'en-NG',
        payload: { startsAt: 'not-an-instant' },
      }),
    ).toBeNull();
    expect(
      renderNotificationTemplate({
        template: 'appeal_decided',
        locale: 'en-NG',
        payload: { reference: 'ODP-1' },
      }),
    ).toBeNull();
  });

  it('names the record reference and never a person', () => {
    const body = renderNotificationTemplate({
      template: 'decision_published',
      locale: 'yo-NG',
      payload: { reference, decisionType: 'commit' },
    });
    expect(body).toContain(reference);
    expect(body).not.toContain('+234');
    expect(body).not.toContain('@');
  });
});

describe('createSmsNotificationBodies', () => {
  const record: OutboundNotification = {
    id: 'ntf_01J9ZN1P3Q5R7S9T1V3W5X7YZ',
    channel: 'sms',
    template: 'registration_code',
    recipient: { kind: 'pending_registration', id: 'prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9' },
    payload: { targetId: 'prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9', expiresInMinutes: '10' },
    dedupeKey: 'registration_code:prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9',
    state: 'queued',
    attempts: 0,
    nextAttemptAt: '2026-11-18T09:14:30Z',
    createdAt: '2026-11-18T09:14:00Z',
  };

  it('takes a one-time code body from the code store and nothing else from it', async () => {
    let asked = 0;
    const bodies = createSmsNotificationBodies({
      async renderRegistrationCode() {
        asked += 1;
        return 'Your Oyo Digital Parliament code is 418302.';
      },
    });

    const body = await bodies.render({
      record,
      recipient: { locale: 'en-NG', smsDestination: '+2348031234567' },
    });

    expect(body).toContain('418302');
    expect(asked).toBe(1);
  });

  it('renders the other templates itself', async () => {
    const bodies = createSmsNotificationBodies({
      async renderRegistrationCode() {
        throw new Error('the code renderer must not be reached for a decision notice');
      },
    });

    const body = await bodies.render({
      record: {
        ...record,
        template: 'decision_published',
        payload: { reference, decisionType: 'commit' },
      },
      recipient: { locale: 'en-NG' },
    });

    expect(body).toContain(reference);
  });
});
