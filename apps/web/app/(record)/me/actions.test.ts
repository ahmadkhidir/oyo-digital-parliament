/**
 * The My Record actions (`C-033` to `C-035`).
 *
 * The real domain use cases run over an in-memory port bundle, so each test proves the action's
 * contract mapping: the redirect token a success leaves, the echo a refusal keeps, the consent
 * conflict that is not an error, and the export duplicate that names the open request.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AuditEventRecord,
  Consent,
  DataRequest,
  IdentityAnalyticsEvent,
  IdentityPorts,
  MemberRecord,
} from '@odp/domain';

/** The redirect the action answers with; Next throws it out of the action. */
class Redirected extends Error {
  readonly url: string;

  constructor(url: string) {
    super(url);
    this.url = url;
  }
}

vi.mock('next/navigation', () => ({
  redirect: (url: string): never => {
    throw new Redirected(url);
  },
}));

/** The locale cookie jar. */
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  }),
}));

const MEMBER: MemberRecord = {
  id: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
  telephoneNumber: '+2348031234567',
  fullName: 'Oluwaseun Adeyemi',
  displayName: 'Seun A.',
  declaredAge: 24,
  wardStatus: 'unresolved',
  identityState: 'registered',
  verificationMethod: 'self_code',
  locale: 'en-NG',
  createdAt: '2026-11-18T09:16:00Z',
};

const NOW = '2026-11-21T07:00:00Z';

interface DoubleState {
  member: MemberRecord;
  consents: Consent[];
  requests: DataRequest[];
  audit: AuditEventRecord[];
  events: IdentityAnalyticsEvent[];
  cache: Map<string, string>;
  rateAllowed: boolean;
  hold: { readonly reviewDate: string } | null;
  sequence: number;
}

interface Holder {
  session: unknown;
  ports: IdentityPorts;
  state: DoubleState;
}

const holder = vi.hoisted<Holder>(() => ({
  session: null,
  ports: null as unknown as IdentityPorts,
  state: null as unknown as DoubleState,
}));

vi.mock('../../../lib/session/session-cookies', () => ({
  presentedMemberSessionToken: async () => 'opaque-token',
}));

vi.mock('./_lib/runtime', () => ({
  resolveMyRecordSession: async () => holder.session,
  getMyRecordRuntime: async () => ({
    platform: {
      cache: {
        get: async (key: string) => holder.state.cache.get(key) ?? null,
        set: async (key: string, value: string) => {
          holder.state.cache.set(key, value);
        },
      },
    },
    ports: holder.ports,
    database: {},
    wards: {},
  }),
}));

/** Builds the in-memory bundle and the state a test inspects. */
function createDouble(): { ports: IdentityPorts; state: DoubleState } {
  const state: DoubleState = {
    member: MEMBER,
    consents: [],
    requests: [],
    audit: [],
    events: [],
    cache: new Map(),
    rateAllowed: true,
    hold: null,
    sequence: 0,
  };

  const refused = (effect: string): never => {
    throw new Error(`${effect} is not wired in this test double`);
  };

  const ports = {
    members: {
      async get() {
        return state.member;
      },
      async findByTelephone() {
        return [];
      },
      async create() {},
      async updateProfile(
        _memberId: string,
        input: { displayName: string; fullName: string; locale: MemberRecord['locale'] },
      ) {
        state.member = { ...state.member, ...input };
      },
      async isDisplayNameTaken() {
        return false;
      },
      async countAuthoredContent() {
        return { submissions: 2, comments: 3 };
      },
      async anonymise() {},
    },
    consents: {
      async listForMember() {
        return state.consents;
      },
      async latestForPurpose(_memberId: string, purpose: Consent['purpose']) {
        return state.consents.find((consent) => consent.purpose === purpose) ?? null;
      },
      async create(consent: Consent) {
        state.consents = [
          ...state.consents.filter((row) => row.purpose !== consent.purpose),
          consent,
        ];
      },
      async withdraw(consentId: string, at: string) {
        state.consents = state.consents.map((row) =>
          row.id === consentId ? { ...row, granted: false, withdrawnAt: at } : row,
        );
      },
    },
    dataRequests: {
      async listForMember() {
        return state.requests;
      },
      async findOpenExport() {
        return (
          state.requests.find(
            (request) =>
              request.type === 'export' &&
              (request.status === 'received' || request.status === 'in_progress'),
          ) ?? null
        );
      },
      async findById(requestId: string) {
        return state.requests.find((request) => request.id === requestId) ?? null;
      },
      async create(request: DataRequest) {
        state.requests = [...state.requests, request];
      },
    },
    legalHolds: {
      async findOpenForMember() {
        return state.hold;
      },
    },
    audit: {
      async append(event: AuditEventRecord) {
        state.audit = [...state.audit, event];
        state.sequence += 1;
        return { sequence: state.sequence };
      },
    },
    analytics: {
      async emit(event: IdentityAnalyticsEvent) {
        state.events = [...state.events, event];
      },
    },
    rateLimits: {
      async consume() {
        return state.rateAllowed
          ? { allowed: true, limit: 5, remaining: 4, resetAt: NOW }
          : { allowed: false, retryAfterSeconds: 60, limit: 5, remaining: 0, resetAt: NOW };
      },
    },
    clock: { now: () => new Date(NOW) },
    identifiers: {
      next(prefix: string) {
        state.sequence += 1;
        return `${prefix}_TEST${state.sequence}`;
      },
    },
    queuedWrites: {
      async enqueue() {
        state.sequence += 1;
        return { queuedWriteId: `qw_TEST${state.sequence}`, acceptedAt: NOW, replayBy: NOW };
      },
    },
    pendingRegistrations: new Proxy({}, { get: () => () => refused('pending registrations') }),
    codes: new Proxy({}, { get: () => () => refused('codes') }),
    notifications: new Proxy({}, { get: () => () => refused('notifications') }),
    signInChallenges: new Proxy({}, { get: () => () => refused('sign-in challenges') }),
    memberContent: new Proxy({}, { get: () => () => refused('member content') }),
    memberSessions: new Proxy({}, { get: () => () => refused('member sessions') }),
    credentials: new Proxy({}, { get: () => () => refused('credentials') }),
    staffUsers: new Proxy({}, { get: () => () => refused('staff users') }),
    staffSessions: new Proxy({}, { get: () => () => refused('staff sessions') }),
    objectStore: new Proxy({}, { get: () => () => refused('object store') }),
    idempotency: new Proxy({}, { get: () => () => refused('idempotency') }),
  } as unknown as IdentityPorts;

  return { ports, state };
}

function memberSession(locale: 'en-NG' | 'yo-NG' = 'en-NG') {
  return {
    kind: 'member' as const,
    token: 'opaque-token',
    member: {
      id: MEMBER.id,
      displayName: MEMBER.displayName,
      identityState: MEMBER.identityState,
      wardStatus: MEMBER.wardStatus,
      locale,
    },
  };
}

/** One form post, as the browser sends it. */
function form(entries: readonly (readonly [string, string])[]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

import { correctMyDetailsAction, createDataRequestAction, updateConsentAction } from './actions';

const correctionForm = (overrides: readonly (readonly [string, string])[] = []) =>
  form([
    ['displayName', 'Seun Adeyemi'],
    ['fullName', 'Oluwaseun Adeyemi'],
    ['locale', 'yo-NG'],
    ['echoKey', 'render-key'],
    ...overrides,
  ]);

describe('My Record actions', () => {
  beforeEach(() => {
    jar.clear();
    const double = createDouble();
    holder.ports = double.ports;
    holder.state = double.state;
    holder.session = memberSession();
  });

  it('saves a correction, records it and moves the account language (C-033)', async () => {
    await expect(correctMyDetailsAction(correctionForm())).rejects.toMatchObject({
      // The display name changed, so earlier writing keeps the old attribution.
      url: '/me?st=details_saved_retained',
    });
    expect(holder.state.member.displayName).toBe('Seun Adeyemi');
    expect(holder.state.member.locale).toBe('yo-NG');
    expect(holder.state.audit[0]).toMatchObject({ action: 'member.profile_corrected' });
    expect(jar.get('odp_locale')).toBe('yo-NG');
  });

  it('keeps the submitted values in the echo when a correction is refused (C-033)', async () => {
    const data = correctionForm();
    data.set('displayName', '');
    let url = '';
    await correctMyDetailsAction(data).catch((error: Redirected) => {
      url = error.url;
    });

    expect(url).toMatch(/^\/me\?e=details_invalid&k=[0-9a-f]{64}$/);
    const digest = url.split('k=')[1] ?? '';
    const echo = holder.state.cache.get(`web:me-echo:${digest}`);
    expect(echo).toBeDefined();
    expect(JSON.parse(echo ?? '{}')).toMatchObject({
      displayName: '',
      fullName: 'Oluwaseun Adeyemi',
      fields: { displayName: 'REQUIRED' },
    });
    expect(holder.state.member.displayName).toBe('Seun A.');
  });

  it('saves only the language when the footer switch posts (C-033)', async () => {
    await expect(correctMyDetailsAction(form([['locale', 'yo-NG']]))).rejects.toMatchObject({
      url: '/me?st=language_saved',
    });
    expect(holder.state.member.fullName).toBe('Oluwaseun Adeyemi');
    expect(holder.state.member.locale).toBe('yo-NG');
  });

  it('reports a rate-limited display-name change without losing the values (C-033)', async () => {
    holder.state.rateAllowed = false;
    let url = '';
    await correctMyDetailsAction(correctionForm()).catch((error: Redirected) => {
      url = error.url;
    });
    expect(url).toMatch(/^\/me\?e=details_rate_limited&k=[0-9a-f]{64}$/);
  });

  it('grants a consent and then reports the repeated grant as unchanged (C-034)', async () => {
    const consentForm = form([
      ['purpose', 'record_transfer'],
      ['granted', 'false'],
      ['granted', 'true'],
    ]);
    await expect(updateConsentAction(consentForm)).rejects.toMatchObject({
      url: '/me?st=consent_saved',
    });
    expect(holder.state.consents).toMatchObject([{ purpose: 'record_transfer', granted: true }]);
    expect(holder.state.audit[0]).toMatchObject({ action: 'consent.changed' });

    await expect(updateConsentAction(consentForm)).rejects.toMatchObject({
      url: '/me?st=consent_unchanged',
    });
  });

  it('withdraws a consent that is in force (C-034)', async () => {
    holder.state.consents = [
      {
        id: 'cns_01J9ZE1F3G5H7J9K1L3M5N7PQR',
        memberId: MEMBER.id,
        purpose: 'decision_notices',
        granted: true,
        recordedAt: '2026-11-18T09:16:00Z',
      },
    ];
    await expect(
      updateConsentAction(
        form([
          ['purpose', 'decision_notices'],
          ['granted', 'false'],
        ]),
      ),
    ).rejects.toMatchObject({ url: '/me?st=consent_saved' });
    expect(holder.state.consents[0]).toMatchObject({
      granted: false,
      withdrawnAt: NOW,
    });
  });

  it('records an export once and names the duplicate as already open (C-035)', async () => {
    const exportForm = form([
      ['type', 'export'],
      ['idempotencyKey', 'key-export'],
    ]);
    await expect(createDataRequestAction(exportForm)).rejects.toMatchObject({
      url: '/me?st=export_requested',
    });
    expect(holder.state.requests).toHaveLength(1);
    expect(holder.state.events[0]).toMatchObject({
      name: 'data_request_created',
      properties: { request_type: 'export' },
    });

    await expect(createDataRequestAction(exportForm)).rejects.toMatchObject({
      url: '/me?st=export_open',
    });
    expect(holder.state.requests).toHaveLength(1);
  });

  it('records a deletion and reports the legal hold it detected (C-035)', async () => {
    holder.state.hold = { reviewDate: '2026-12-01T00:00:00Z' };
    await expect(
      createDataRequestAction(
        form([
          ['type', 'deletion'],
          ['idempotencyKey', 'key-deletion'],
        ]),
      ),
    ).rejects.toMatchObject({
      url: '/me?st=request_held&d=2026-12-01T00%3A00%3A00Z',
    });
    expect(holder.state.requests).toMatchObject([{ type: 'deletion', status: 'received' }]);
  });

  it('refuses a request type outside the contract without writing (C-035)', async () => {
    await expect(createDataRequestAction(form([['type', 'erase']]))).rejects.toMatchObject({
      url: '/me?e=request_failed',
    });
    expect(holder.state.requests).toEqual([]);
  });

  it('sends a write with no session to the sign-in door', async () => {
    holder.session = { kind: 'signed-out' };
    await expect(
      updateConsentAction(
        form([
          ['purpose', 'record_transfer'],
          ['granted', 'true'],
        ]),
      ),
    ).rejects.toMatchObject({ url: '/sign-in?returnTo=%2Fme' });
  });

  it('renders the degraded state rather than a verdict when the session store fails', async () => {
    holder.session = { kind: 'degraded' };
    await expect(correctMyDetailsAction(correctionForm())).rejects.toMatchObject({
      url: '/me?e=degraded',
    });
  });
});
