/**
 * The Ward Confirmation screen's state tests (`screens/05-ward-confirmation.md`, `C-009` to `C-011`).
 *
 * Each test renders the real page with the session, reference and echo a state needs, and asserts
 * the state by its readable content — never by a class name. The last tests render yo-NG and the
 * signed-out path, because the screen must work in both launch locales and the session decides
 * access.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { catalogues } from '../../../../messages';
import type { SessionMemberProjection, Ward, WardDescriptionReview } from '@odp/domain';

/** The redirect the page answers with; Next throws it out of the component. */
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

/** The browser's locale and session cookies; one jar per test. */
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  }),
}));

/** The state a test seeds: the member, the reference, the queue and the echo store. */
const holder = vi.hoisted(() => ({
  member: null as SessionMemberProjection | null,
  wards: [] as Ward[],
  queued: [] as WardDescriptionReview[],
  referenceUnavailable: false,
  cache: new Map<string, string>(),
}));

vi.mock('./_lib/runtime', () => ({
  getWardDependencies: async () => ({
    platform: {
      cache: {
        get: async (key: string) => holder.cache.get(key) ?? null,
        set: async (key: string, value: string) => {
          holder.cache.set(key, value);
        },
      },
    },
    database: {},
    identityPorts: {},
  }),
  buildWardReadPorts: () => ({
    wards: {
      async listForMatching() {
        if (holder.referenceUnavailable) throw new Error('the reference is unavailable');
        return holder.wards;
      },
      async getById(wardId: string) {
        return holder.wards.find((ward) => ward.id === wardId) ?? null;
      },
    },
    wardDescriptionReviews: {
      async listQueuedByMember() {
        return holder.queued;
      },
    },
  }),
  resolveMemberSession: async () => holder.member,
}));

vi.mock('../../../../lib/session/session-cookies', () => ({
  presentedMemberSessionToken: async () => 'opaque-token',
}));

vi.mock('./actions', () => ({ confirmWardAction: async () => {} }));

import WardPage from './page';
import { SIGN_IN_PATH } from './_lib/confirm';

/** The member every test acts for unless it signs out. */
const MEMBER: SessionMemberProjection = {
  id: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
  displayName: 'Seun A.',
  identityState: 'registered',
  wardStatus: 'unresolved',
  locale: 'en-NG',
  sharedNumber: false,
};

const WARD: Ward = {
  id: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM',
  name: 'Ward IV, Agbowo',
  localGovernmentArea: 'Ibadan North',
  aliases: ['Agbowo'],
  source: 'seeded',
  createdAt: '2026-09-01T08:00:00Z',
};

/** Renders the page with one query. The screen is a server component, so its element is awaited. */
async function renderPage(query: Record<string, string> = {}) {
  return render(await WardPage({ searchParams: Promise.resolve(query) }));
}

describe('WardPage (screens/05-ward-confirmation.md)', () => {
  beforeEach(() => {
    jar.clear();
    holder.member = MEMBER;
    holder.wards = [WARD];
    holder.queued = [];
    holder.referenceUnavailable = false;
    holder.cache.clear();
    // The client island's fetch is not part of these states; the timer is never advanced.
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { candidates: [] } }),
      })),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders the default state: area, description and the unresolved note', async () => {
    const copy = catalogues['en-NG'].ward;
    await renderPage();

    expect(screen.getByRole('heading', { name: copy.heading })).toBeInTheDocument();
    expect(screen.getByLabelText(copy.areaLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.descriptionLabel)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.noneOfThese })).toBeInTheDocument();
    // No candidate is selected yet, so confirming is not offered.
    expect(screen.getByRole('button', { name: copy.confirm })).toBeDisabled();
    expect(screen.getByText(copy.unresolvedNote)).toBeInTheDocument();
  });

  it('names the ward already on the record (Confirmed)', async () => {
    const copy = catalogues['en-NG'].ward;
    holder.member = { ...MEMBER, wardStatus: 'resolved', wardId: WARD.id };
    await renderPage();

    expect(screen.getByRole('heading', { name: copy.recordedHeading })).toBeInTheDocument();
    expect(screen.getByText(/Ward IV, Agbowo/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.sentContinue })).toHaveAttribute('href', '/');
  });

  it('shows the area-sent sheet after None of these (Unresolved)', async () => {
    const copy = catalogues['en-NG'].ward;
    holder.queued = [
      {
        id: 'wdr_01J9Z7A3B5C7D9E1F3G5H7J9KM',
        memberId: MEMBER.id,
        description: 'After the old cocoa shed',
        status: 'queued',
        createdAt: '2026-11-18T09:20:00Z',
      },
    ];
    await renderPage({ sent: 'review' });

    expect(screen.getByRole('heading', { name: copy.sentHeading })).toBeInTheDocument();
    expect(screen.getByText(copy.sentBody)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.sentContinue })).toHaveAttribute('href', '/');
  });

  it('keeps the resident’s words and names the failing field after a refusal', async () => {
    const copy = catalogues['en-NG'].ward;
    const digest = 'a'.repeat(64);
    holder.cache.set(
      `web:ward-echo:confirm:${digest}`,
      JSON.stringify({
        description: 'After the old cocoa shed, before the river',
        localGovernmentArea: 'Ibadan North',
      }),
    );
    await renderPage({ e: 'description_long', k: digest });

    expect(screen.getByText(copy.errors.descriptionLong)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.descriptionLabel)).toHaveValue(
      'After the old cocoa shed, before the river',
    );
    expect(screen.getByLabelText(copy.areaLabel)).toHaveValue('Ibadan North');
  });

  it('keeps the description usable when the reference cannot be read (Error)', async () => {
    const copy = catalogues['en-NG'].ward;
    holder.referenceUnavailable = true;
    await renderPage();

    expect(screen.getByText(copy.candidateError)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.descriptionLabel)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.noneOfThese })).toBeEnabled();
  });

  it('renders the yo-NG catalogue with no English copy', async () => {
    jar.set('odp_locale', 'yo-NG');
    const copy = catalogues['yo-NG'].ward;
    await renderPage();

    expect(screen.getByRole('heading', { name: copy.heading })).toBeInTheDocument();
    expect(screen.getByText(copy.unresolvedNote)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: catalogues['en-NG'].ward.heading })).toBeNull();
  });

  it('sends a signed-out visitor to sign in and back to this screen', async () => {
    holder.member = null;
    await expect(renderPage()).rejects.toMatchObject({ url: SIGN_IN_PATH });
  });
});
