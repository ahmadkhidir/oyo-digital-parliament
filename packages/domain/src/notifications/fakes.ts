/**
 * In-memory ports for the notification tests. Test-only: nothing here is exported from the module barrel.
 *
 * The fake queue keeps the rules the database adapter must keep — one row per dedupe key, a claim that a
 * second dispatcher cannot take, an attempt recorded only by the lease holder, a hold that stays queued
 * until its next instant — so a use-case test exercises the policy rather than a mock's expectations.
 * `packages/db` proves the SQL side separately with a real database and this same SMS double.
 *
 * The fake SMS answers from a script, so an outage is a scripted `held` and nothing reaches a network.
 */
import type { Locale } from '../identity/entities.ts';
import type {
  ClaimedNotification,
  NotificationAttempt,
  NotificationRecipientReference,
  OutboundNotification,
} from './entities.ts';
import {
  DEFAULT_NOTIFICATION_RETRY_POLICY,
  type NotificationRetryPolicy,
  isHeld,
} from './policies.ts';
import type {
  NotificationPorts,
  NotificationRecipient,
  OutboundQueuePort,
} from './ports.ts';
import type { SmsDeliveryPort, SmsDeliveryResult, SmsMessage } from '../ports/notifications.ts';

/** The instant every fake starts from, in `C-001` form. */
export const FAKE_NOTIFICATION_NOW = '2026-11-18T09:14:00Z';

/** One recipient the fake resolver knows. */
export interface FakeRecipient {
  readonly id: string;
  readonly locale: Locale;
  /** Absent models an account that cannot take an `sms` message. */
  readonly smsDestination?: string;
}

/** What a test may inspect or adjust on the harness. */
export interface FakeNotificationHarness {
  readonly ports: NotificationPorts;
  /** Every queued row, oldest first. */
  readonly rows: readonly OutboundNotification[];
  /** Every message the SMS double was asked to send, in order. */
  readonly sent: readonly SmsMessage[];
  /** Every body the renderer produced, in order. */
  readonly rendered: readonly string[];
  /** Move the injected clock. */
  advanceTo(instant: string): void;
  /** Make a recipient unreachable, as an anonymised account is (`FEAT-012`). */
  removeRecipient(id: string): void;
  /** Make the body renderer answer `null`, as an expired code is. */
  setBodyAvailable(available: boolean): void;
  /** Make the queue throw on every call, as an unreachable database does. */
  setQueueAvailable(available: boolean): void;
  /** Script the SMS gateway's next answers. An empty script answers a delivery. */
  queueSms(...results: readonly SmsDeliveryResult[]): void;
}

const CURSOR_PREFIX = 'cur_';
const CURSOR_PATTERN = /^cur_[0-9]{4,26}$/;

function encodeCursor(offset: number): string {
  return `${CURSOR_PREFIX}${String(offset).padStart(6, '0')}`;
}

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined || !CURSOR_PATTERN.test(cursor)) return 0;
  const offset = Number.parseInt(cursor.slice(CURSOR_PREFIX.length), 10);
  return Number.isInteger(offset) && offset >= 0 ? offset : 0;
}

/** The instant an ISO string represents, for lease and due comparisons. */
function instant(value: string): number {
  return Date.parse(value);
}

/**
 * Build the fake port bundle.
 *
 * @param options - The starting instant, the known recipients and any failure the test wants to inject.
 */
export function createNotificationFakes(options: {
  readonly now?: string;
  readonly recipients?: readonly FakeRecipient[];
  readonly retry?: NotificationRetryPolicy;
} = {}): FakeNotificationHarness {
  let now = options.now ?? FAKE_NOTIFICATION_NOW;
  const rows: OutboundNotification[] = [];
  const leases = new Map<string, { token: string; until: string }>();
  const recipients = new Map<string, FakeRecipient | null>(
    (options.recipients ?? []).map((recipient) => [recipient.id, recipient]),
  );
  const sent: SmsMessage[] = [];
  const rendered: string[] = [];
  let script: SmsDeliveryResult[] = [];
  let bodyAvailable = true;
  let queueAvailable = true;
  let identifierCounter = 0;
  let leaseCounter = 0;

  const guard = (unavailable: boolean | undefined, what: string): void => {
    if (unavailable === true) throw new Error(`${what} is unavailable`);
  };

  const leaseOf = (id: string): { token: string; until: string } | undefined => {
    const lease = leases.get(id);
    if (lease === undefined) return undefined;
    // A lapsed lease is no lease: the row is claimable again, as the conditional write allows.
    return instant(lease.until) > instant(now) ? lease : undefined;
  };

  /**
   * Give a row up without erasing it.
   *
   * A fake that removed the lease would be a fake that deletes records, which this package forbids; the
   * released lease simply points at an instant long past.
   */
  const release = (id: string): void => {
    const lease = leases.get(id);
    if (lease !== undefined) leases.set(id, { ...lease, until: '1970-01-01T00:00:00Z' });
  };

  const claim = (row: OutboundNotification): ClaimedNotification => {
    leaseCounter += 1;
    const token = `lea_${leaseCounter.toString(36).toUpperCase().padStart(4, '0')}`;
    const until = new Date(
      instant(now) + (options.retry ?? DEFAULT_NOTIFICATION_RETRY_POLICY).leaseSeconds * 1000,
    )
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
    leases.set(row.id, { token, until });
    return { record: { ...row }, leaseToken: token };
  };

  const apply = (row: OutboundNotification, attempt: NotificationAttempt): OutboundNotification => {
    const updated: OutboundNotification = {
      ...row,
      state: attempt.state,
      attempts: attempt.attempts,
      nextAttemptAt: attempt.nextAttemptAt ?? row.nextAttemptAt,
      lastAttemptAt: attempt.at,
      lastOutcome: attempt.outcome,
      messageRef: attempt.messageRef,
      ...(attempt.cause === null ? {} : { lastCause: attempt.cause }),
      ...(attempt.state === 'sent' ? { sentAt: attempt.at } : {}),
      ...(attempt.state === 'failed' ? { failedAt: attempt.at } : {}),
    };
    const index = rows.findIndex((candidate) => candidate.id === row.id);
    if (index >= 0) rows[index] = updated;
    return updated;
  };

  const queue: OutboundQueuePort = {
    async enqueue(record) {
      guard(!queueAvailable, 'the queue');
      const existing = rows.find((row) => row.dedupeKey === record.dedupeKey);
      if (existing !== undefined) return { record: { ...existing }, created: false };
      rows.push({ ...record });
      return { record: { ...record }, created: true };
    },

    async findById(notificationId) {
      guard(!queueAvailable, 'the queue');
      const row = rows.find((candidate) => candidate.id === notificationId);
      return row === undefined ? null : { ...row };
    },

    async findByDedupeKey(dedupeKey) {
      guard(!queueAvailable, 'the queue');
      const row = rows.find((candidate) => candidate.dedupeKey === dedupeKey);
      return row === undefined ? null : { ...row };
    },

    async claimById({ notificationId }) {
      guard(!queueAvailable, 'the queue');
      const row = rows.find((candidate) => candidate.id === notificationId);
      if (row === undefined || row.state !== 'queued') return null;
      if (leaseOf(notificationId) !== undefined) return null;
      return claim(row);
    },

    async claimDue({ limit }) {
      guard(!queueAvailable, 'the queue');
      const due = rows
        .filter(
          (row) =>
            row.state === 'queued' &&
            instant(row.nextAttemptAt) <= instant(now) &&
            leaseOf(row.id) === undefined,
        )
        .sort((left, right) => instant(left.nextAttemptAt) - instant(right.nextAttemptAt))
        .slice(0, limit);
      return due.map((row) => claim(row));
    },

    async recordAttempt({ notificationId, leaseToken, attempt }) {
      guard(!queueAvailable, 'the queue');
      const lease = leases.get(notificationId);
      if (lease === undefined || lease.token !== leaseToken) return null;
      const row = rows.find((candidate) => candidate.id === notificationId);
      if (row === undefined) return null;
      release(notificationId);
      return apply(row, attempt);
    },

    async listHeld({ cursor, limit }) {
      guard(!queueAvailable, 'the queue');
      const held = rows
        .filter(isHeld)
        .sort((left, right) => instant(left.nextAttemptAt) - instant(right.nextAttemptAt));
      const offset = decodeCursor(cursor);
      const page = held.slice(offset, offset + limit);
      return {
        rows: page.map((row) => ({ ...row })),
        nextCursor: offset + page.length < held.length ? encodeCursor(offset + page.length) : null,
      };
    },
  };

  const sms: SmsDeliveryPort = {
    async deliver(message) {
      sent.push(message);
      return (
        script.shift() ?? { outcome: 'delivered', messageRef: `fake-${sent.length}`, cause: null }
      );
    },
  };

  const ports: NotificationPorts = {
    queue,
    recipients: {
      async resolve(reference: NotificationRecipientReference): Promise<NotificationRecipient | null> {
        const known = recipients.get(reference.id);
        // `undefined` is an unknown reference; `null` is one that has been anonymised or discarded.
        if (known === undefined || known === null) return null;
        return {
          locale: known.locale,
          ...(known.smsDestination === undefined ? {} : { smsDestination: known.smsDestination }),
        };
      },
    },
    bodies: {
      async render({ record, recipient }) {
        if (!bodyAvailable) return null;
        const body = `${record.template}:${record.id}`;
        rendered.push(body);
        void recipient;
        return body;
      },
    },
    sms,
    clock: { now: () => new Date(Date.parse(now)) },
    identifiers: {
      next: (prefix) => {
        identifierCounter += 1;
        return `${prefix}_${identifierCounter.toString(36).toUpperCase().padStart(4, '0')}`;
      },
    },
    ...(options.retry === undefined ? {} : { retry: options.retry }),
  };

  return {
    ports,
    get rows() {
      return rows;
    },
    get sent() {
      return sent;
    },
    get rendered() {
      return rendered;
    },
    advanceTo(next) {
      now = next;
    },
    removeRecipient(id) {
      // A gone recipient keeps its place in the map with no destination: nothing is erased.
      recipients.set(id, null);
    },
    setBodyAvailable(available) {
      bodyAvailable = available;
    },
    setQueueAvailable(available) {
      queueAvailable = available;
    },
    queueSms(...results) {
      script = [...script, ...results];
    },
  };
}
