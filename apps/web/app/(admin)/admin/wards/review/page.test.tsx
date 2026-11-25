/**
 * The Ward Review Queue's return states (`screens/19-ward-review-queue.md`, `C-055` to `C-057`).
 *
 * A refusal left by the action is read from the flow cookie and stated on the page, so a reviewer
 * who comes back knows why the last attempt changed nothing. The resolved notice carries both its
 * sentence and the moved count. The queue read and the action module are stubbed: this suite proves
 * what the screen states, not how the record is written.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { catalogues } from '../../../../../messages';

/** The session, flow and queue the page reads; swapped per test. */
const holder = vi.hoisted(() => ({
  access: {
    kind: 'ready',
    staff: { id: 'stf_01', role: 'response_staff' },
  },
  flow: null as null | {
    readonly notice?: string;
    readonly cause?: string;
    readonly moved?: number;
    readonly unchanged?: number;
  },
  queue: {
    ok: true,
    queuedCount: 1,
    nextCursor: null,
    candidateWards: [{ id: 'ward_01', name: 'Ward One', localGovernmentArea: 'Ibadan North' }],
    reviews: [
      {
        review: {
          id: 'wdr_01',
          description: 'Near the old market',
          localGovernmentArea: 'Ibadan North',
          status: 'queued',
          createdAt: '2026-11-20T09:00:00Z',
        },
        member: {
          id: 'mem_01',
          identityState: 'registered',
          wardStatus: 'unresolved',
          deleted: false,
        },
        submissionReferences: ['ODP-0001'],
      },
    ],
  },
}));

vi.mock('../../../../../lib/i18n/locale', () => ({ resolveLocale: async () => 'en-NG' }));

vi.mock('../../../../../lib/staff-session/session', () => ({
  readStaffAccess: async () => holder.access,
}));

vi.mock('../../../../../lib/staff-session/cookies', () => ({
  readStaffFlow: async () => holder.flow,
}));

vi.mock('../../../../../lib/staff-session/deps', () => ({
  getStaffAdminDependencies: async () => ({ database: {} }),
  readWardReviewPorts: () => ({}),
}));

vi.mock('@odp/domain', () => ({
  readWardReviewQueue: async () => holder.queue,
}));

vi.mock('./actions', () => ({
  resolveWardDescriptionAction: async () => {},
  recordResidenceReviewAction: async () => {},
}));

import WardReviewPage from './page';

const copy = catalogues['en-NG'].staff.wards;

/** Renders the page with no query state of its own. */
async function renderPage(): Promise<void> {
  render(await WardReviewPage({ searchParams: Promise.resolve({}) }));
}

describe('WardReviewPage (screens/19-ward-review-queue.md)', () => {
  beforeEach(() => {
    holder.flow = null;
  });

  it('states a refused residence review on the page, not only in the flow cookie', async () => {
    holder.flow = { cause: 'RESIDENCE_REVIEW_INVALID' };

    await renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(copy.residenceInvalid);
  });

  it('carries the resolved sentence and the moved count together', async () => {
    holder.flow = { notice: 'WARD_RESOLVED', moved: 2, unchanged: 1 };

    await renderPage();

    const moved = copy.moved.replace('{moved}', '2').replace('{unchanged}', '1');
    expect(screen.getByRole('status')).toHaveTextContent(`${copy.resolved} ${moved}`);
  });
});
