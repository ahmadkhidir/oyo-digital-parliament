/**
 * The My Record screen states (`screens/13-my-record.md`, `C-032` to `C-035`).
 *
 * Each test renders the real page with the session and record a state needs, and asserts the state
 * by its readable content — never by a class name. The member ports are in memory and the real
 * `readMyRecord` runs over them, so the page's projection and the state mapping are exercised
 * together.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { dataRequestDueAt, type IdentityPorts, type MemberRecord } from '@odp/domain';
import { catalogues } from '../../../messages';
import { formatRecordDate } from './_lib/dates';

/** The browser's locale cookie; one jar per test. */
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string): never => {
    throw new Error(url);
  },
}));

/** The password-less sign-out control is not this page's subject. */
vi.mock('../../../lib/session/actions', () => ({ signOutAction: async () => {} }));
vi.mock('./actions', () => ({
  correctMyDetailsAction: async () => {},
  updateConsentAction: async () => {},
  createDataRequestAction: async () => {},
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

/** The state a test seeds. */
const holder = vi.hoisted(() => ({
  session: null as unknown,
  readFails: false,
  member: null as unknown,
  consents: [] as unknown[],
  submissions: [] as unknown[],
  backings: [] as unknown[],
  heldItems: [] as unknown[],
  requests: [] as unknown[],
  cache: new Map<string, string>(),
  wardName: null as string | null,
}));

vi.mock('./_lib/runtime', () => ({
  resolveMyRecordSession: async () => holder.session,
  readWardName: async () => holder.wardName,
  getMyRecordRuntime: async () => ({
    platform: {
      clock: { now: () => new Date(NOW) },
      identifiers: { next: (prefix: string) => `${prefix}_TEST` },
      cache: {
        get: async (key: string) => holder.cache.get(key) ?? null,
        set: async (key: string, value: string) => {
          holder.cache.set(key, value);
        },
      },
    },
    database: {},
    wards: {},
    ports: {
      members: {
        async get() {
          if (holder.readFails) throw new Error('identity store unavailable');
          return holder.member;
        },
      },
      consents: {
        async listForMember() {
          return holder.consents;
        },
      },
      memberContent: {
        async listSubmissions() {
          return { rows: holder.submissions, nextCursor: null };
        },
        async listHeldBackings() {
          return holder.backings;
        },
        async listHeldItems() {
          return holder.heldItems;
        },
        async withdrawAuthoredSubmissions() {
          return 0;
        },
      },
      dataRequests: {
        async listForMember() {
          return holder.requests;
        },
      },
      legalHolds: {
        async findOpenForMember() {
          return null;
        },
      },
      audit: {
        async append() {
          return { sequence: 1 };
        },
      },
      analytics: { async emit() {} },
      clock: { now: () => new Date(NOW) },
      identifiers: { next: (prefix: string) => `${prefix}_TEST` },
    } as unknown as IdentityPorts,
  }),
}));

vi.mock('../../../lib/session/session-cookies', () => ({
  presentedMemberSessionToken: async () => 'opaque-token',
}));

import MyRecordPage from './page';

/** The member session every populated test uses. */
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

/** Renders the page with one query. */
async function renderPage(query: Record<string, string> = {}) {
  return render(await MyRecordPage({ searchParams: Promise.resolve(query) }));
}

describe('MyRecordPage (screens/13-my-record.md)', () => {
  const copy = catalogues['en-NG'].myRecord;

  beforeEach(() => {
    jar.clear();
    holder.session = memberSession();
    holder.readFails = false;
    holder.member = MEMBER;
    holder.consents = [];
    holder.submissions = [];
    holder.backings = [];
    holder.heldItems = [];
    holder.requests = [];
    holder.cache.clear();
    holder.wardName = null;
  });

  it('renders the signed-out state as a prompt, not an empty record', async () => {
    holder.session = { kind: 'signed-out' };
    await renderPage();

    expect(screen.getByRole('heading', { name: copy.signedOutHeading })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.signedOutAction })).toHaveAttribute(
      'href',
      '/sign-in?returnTo=%2Fme',
    );
    expect(screen.queryByRole('heading', { name: copy.accountHeading })).toBeNull();
  });

  it('renders the error state with a retry and the rights controls', async () => {
    holder.session = { kind: 'degraded' };
    await renderPage();

    expect(screen.getByText(copy.errorHeading)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.retry })).toHaveAttribute('href', '/me');
    expect(screen.getByText(copy.exportAction.summary)).toBeInTheDocument();
    expect(screen.getByText(copy.deleteAction.summary)).toBeInTheDocument();
  });

  it('renders the error state when the record cannot be read', async () => {
    holder.readFails = true;
    await renderPage();

    expect(screen.getByText(copy.errorHeading)).toBeInTheDocument();
    expect(screen.getByText(copy.exportAction.summary)).toBeInTheDocument();
  });

  it('renders the empty-submissions state with a route to raise something', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { name: copy.submissions.emptyHeading }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.submissions.emptyAction })).toHaveAttribute(
      'href',
      '/submit',
    );
  });

  it('renders a submission with its status and decision', async () => {
    holder.submissions = [
      {
        reference: 'ODP-004821',
        status: 'decided',
        decision: { type: 'commit', authority: null },
      },
    ];
    await renderPage();

    expect(screen.getByRole('link', { name: 'Open submission ODP-004821' })).toHaveAttribute(
      'href',
      '/s/ODP-004821',
    );
    expect(screen.getByText(copy.submissions.statuses.decided)).toBeInTheDocument();
    expect(screen.getByText(copy.submissions.decisions.commit)).toBeInTheDocument();
  });

  it('names an unresolved ward and links to confirmation', async () => {
    await renderPage();

    expect(screen.getByText(copy.wardUnresolved)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.wardConfirm })).toHaveAttribute(
      'href',
      '/join/ward',
    );
  });

  it('names the recorded ward when it resolves', async () => {
    holder.session = {
      ...memberSession(),
      member: { ...memberSession().member, wardStatus: 'resolved', wardId: 'wrd_01' },
    };
    holder.member = { ...MEMBER, wardStatus: 'resolved', wardId: 'wrd_01' };
    holder.wardName = 'Ward IV, Agbowo';
    await renderPage();

    expect(screen.getByText('Ward IV, Agbowo')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: copy.wardConfirm })).toBeNull();
  });

  it('renders a pending request with its expected date', async () => {
    holder.requests = [
      {
        id: 'drq_01',
        type: 'export',
        status: 'in_progress',
        requestedAt: NOW,
        legalHoldNote: null,
        legalHoldReviewAt: null,
      },
    ];
    await renderPage();

    expect(screen.getByText(copy.requests.statuses.in_progress)).toBeInTheDocument();
    const due = formatRecordDate('en-NG', dataRequestDueAt('export', NOW));
    expect(screen.getByText(new RegExp(due))).toBeInTheDocument();
    expect(screen.getByText(copy.exportAction.open)).toBeInTheDocument();
  });

  it('offers the short-lived download for a completed export', async () => {
    holder.requests = [
      {
        id: 'drq_01J9ZE2G4H6J8K1L3M5N7P9QRS',
        type: 'export',
        status: 'completed',
        requestedAt: NOW,
        fileReference: 'exports/mbr_01/2026-11-20.zip',
        legalHoldNote: null,
        legalHoldReviewAt: null,
      },
    ];
    await renderPage();

    expect(screen.getByRole('link', { name: copy.requests.download })).toHaveAttribute(
      'href',
      '/api/me/data-requests/drq_01J9ZE2G4H6J8K1L3M5N7P9QRS/file',
    );
    expect(screen.getByText(copy.requests.downloadNote)).toBeInTheDocument();
  });

  it('explains a deletion deferred for a legal hold, with the review date', async () => {
    holder.requests = [
      {
        id: 'drq_02',
        type: 'deletion',
        status: 'deferred_for_legal_hold',
        requestedAt: NOW,
        legalHoldNote: 'A submission is under legal review.',
        legalHoldReviewAt: '2026-12-01T00:00:00Z',
      },
    ];
    await renderPage();

    expect(screen.getAllByText(copy.requests.legalHoldHeading).length).toBeGreaterThan(0);
    expect(screen.getByText(copy.requests.legalHoldBody)).toBeInTheDocument();
    expect(screen.getByText(/A submission is under legal review\./)).toBeInTheDocument();
    const review = formatRecordDate('en-NG', '2026-12-01T00:00:00Z');
    expect(
      screen.getByText(
        catalogues['en-NG'].myRecord.requests.legalHoldReview.replace('{date}', review),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(copy.deleteAction.openHeading)).toBeInTheDocument();
  });

  it('shows each consent purpose with its state', async () => {
    holder.consents = [
      {
        id: 'cns_01',
        purpose: 'decision_notices',
        granted: true,
        recordedAt: NOW,
        withdrawnAt: null,
      },
      {
        id: 'cns_02',
        purpose: 'record_transfer',
        granted: false,
        recordedAt: NOW,
        withdrawnAt: '2026-11-20T09:00:00Z',
      },
    ];
    await renderPage();

    expect(screen.getByText(/Granted/)).toBeInTheDocument();
    expect(screen.getByText(/Withdrawn/)).toBeInTheDocument();
    expect(screen.getByText(copy.consent.notAnswered)).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: copy.consent.toggleLabel.replace(
          '{purpose}',
          copy.consent.purposes.decision_notices.label,
        ),
      }),
    ).toBeChecked();
  });

  it('announces the outcome of a save left by the action', async () => {
    await renderPage({ st: 'details_saved' });
    expect(screen.getByText(copy.saved.details)).toBeInTheDocument();
  });

  it('explains a legal hold detected when the request was made (C-035)', async () => {
    await renderPage({ st: 'request_held', d: '2026-12-01T00:00:00Z' });
    const review = formatRecordDate('en-NG', '2026-12-01T00:00:00Z');
    expect(
      screen.getByText(copy.requests.heldImmediately.replace('{date}', review)),
    ).toBeInTheDocument();
  });

  it('renders the Yoruba screen for an account set to Yoruba', async () => {
    holder.session = memberSession('yo-NG');
    const yo = catalogues['yo-NG'].myRecord;
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: yo.heading })).toBeInTheDocument();
    expect(screen.getByText(yo.submissions.heading)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: copy.heading })).toBeNull();
  });
});
