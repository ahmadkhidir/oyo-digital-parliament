/**
 * The Ward Review Queue's two work types and their return states
 * (`screens/19-ward-review-queue.md`, `C-055` to `C-057`).
 *
 * A refusal left by the action is read from the flow cookie and stated on the page, so a reviewer
 * who comes back knows why the last attempt changed nothing. The resolved notice carries both its
 * sentence and the moved count. Residences render beside Descriptions on the same route, with the
 * display name and confirmed ward rather than a real name or a number; a rejection marks its reason
 * as required and keeps whatever was typed when the decision changes. The queue read and the action
 * module are stubbed: this suite proves what the screen states, not how the record is written.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { catalogues } from '../../../../../messages';

interface DescriptionQueueStub {
  readonly ok: true;
  readonly work: 'descriptions';
  readonly queuedCount: number;
  readonly nextCursor: null;
  readonly candidateWards: readonly {
    readonly id: string;
    readonly name: string;
    readonly localGovernmentArea: string;
  }[];
  readonly reviews: readonly {
    readonly review: {
      readonly id: string;
      readonly description: string;
      readonly localGovernmentArea: string;
      readonly status: 'queued';
      readonly createdAt: string;
    };
    readonly member: {
      readonly id: string;
      readonly identityState: 'registered';
      readonly wardStatus: 'unresolved';
      readonly deleted: false;
    };
    readonly submissionReferences: readonly string[];
  }[];
}

interface ResidenceQueueStub {
  readonly ok: true;
  readonly work: 'residences';
  readonly residenceCount: number;
  readonly nextCursor: null;
  readonly residences: readonly {
    readonly memberId: string;
    readonly displayName: string;
    readonly wardId: string;
    readonly wardName: string;
    readonly registeredAt: string;
  }[];
}

type QueueStub = DescriptionQueueStub | ResidenceQueueStub;

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
    work: 'descriptions',
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
  } as QueueStub,
}));

vi.mock('../../../../../lib/i18n/locale', () => ({ resolveLocale: async () => 'en-NG' }));

vi.mock('../../../../../lib/staff-session/session', () => ({
  readStaffAccess: async () => holder.access,
}));

vi.mock('../../../../../lib/staff-session/cookies', () => ({
  readStaffFlow: async () => holder.flow,
}));

vi.mock('../../../../../lib/staff-session/deps', () => ({
  getStaffAdminDependencies: async () => ({ database: { db: {} } }),
  readWardReviewPorts: () => ({}),
}));

vi.mock('@odp/db', () => ({
  createWardResidenceReviewRepository: () => ({}),
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

/** Renders the page with the query the reviewer arrived on. */
async function renderPage(
  params: Readonly<Record<string, string | string[] | undefined>> = {},
): Promise<void> {
  render(await WardReviewPage({ searchParams: Promise.resolve(params) }));
}

/** A residence queue with one member whose ward is recorded. */
const residenceQueue: ResidenceQueueStub = {
  ok: true,
  work: 'residences',
  residenceCount: 1,
  nextCursor: null,
  residences: [
    {
      memberId: 'mem_02',
      displayName: 'Seun A.',
      wardId: 'ward_01',
      wardName: 'Ward IV, Agbowo',
      registeredAt: '2026-11-20T09:00:00Z',
    },
  ],
};

describe('WardReviewPage (screens/19-ward-review-queue.md)', () => {
  beforeEach(() => {
    holder.flow = null;
    holder.queue = {
      ok: true,
      work: 'descriptions',
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
    };
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

  it('renders both work types on one route and marks the selected one', async () => {
    await renderPage();

    expect(screen.getByRole('link', { name: copy.descriptionsTab })).toHaveAttribute(
      'href',
      '/admin/wards/review',
    );
    expect(screen.getByRole('link', { name: copy.residencesTab })).toHaveAttribute(
      'href',
      '/admin/wards/review?work=residences',
    );
    expect(screen.getByRole('link', { name: copy.descriptionsTab })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('keeps the descriptions list and its selected case unchanged', async () => {
    await renderPage();

    expect(screen.getAllByText('Near the old market').length).toBeGreaterThan(0);
    expect(screen.getByText('Ward One — Ibadan North')).toBeInTheDocument();
  });

  it('renders the Residences list with the display name, confirmed ward and date', async () => {
    holder.queue = residenceQueue;

    await renderPage({ work: 'residences' });

    expect(screen.getByRole('link', { name: copy.residencesTab })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('Seun A.')).toBeInTheDocument();
    expect(screen.getAllByText(/Ward IV, Agbowo/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(copy.confirmedWard).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(
          new Date('2026-11-20T09:00:00Z'),
        ),
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: copy.recordResidence })).toBeInTheDocument();
  });

  it('states the acceptance notice when a residence moves to Checked', async () => {
    holder.queue = { ...residenceQueue, residenceCount: 0, residences: [] };
    holder.flow = { notice: 'RESIDENCE_CHECKED' };

    await renderPage({ work: 'residences' });

    expect(screen.getByText(copy.checked)).toBeInTheDocument();
  });

  it('states the refusal notice when a residence stays Registered', async () => {
    holder.flow = { notice: 'RESIDENCE_REJECTED' };

    await renderPage({ work: 'residences' });

    expect(screen.getByText(copy.residenceRejected)).toBeInTheDocument();
  });

  it('marks the refusal reason as required on a rejection and keeps the typed reason', async () => {
    holder.queue = residenceQueue;

    await renderPage({ work: 'residences' });

    const notes = screen.getByLabelText(copy.notes);
    expect(notes).not.toBeRequired();

    fireEvent.click(screen.getByRole('radio', { name: copy.refuse }));

    const reason = screen.getByLabelText(copy.refusalReason);
    expect(reason).toBeRequired();
    expect(screen.getByText(copy.refusalReasonHint)).toBeInTheDocument();

    fireEvent.change(reason, { target: { value: 'No document shows the street address.' } });
    fireEvent.click(screen.getByRole('radio', { name: copy.accept }));

    const kept = screen.getByLabelText(copy.notes);
    expect(kept).not.toBeRequired();
    expect(kept).toHaveValue('No document shows the street address.');
    expect(screen.getByText(copy.notesHint)).toBeInTheDocument();
  });

  it('states that no residence is waiting, with the dates the list covers', async () => {
    holder.queue = { ok: true, work: 'residences', residenceCount: 0, nextCursor: null, residences: [] };

    await renderPage({ work: 'residences' });

    expect(screen.getByText(copy.residencesEmpty)).toBeInTheDocument();
    expect(screen.getByText(copy.residencesEmptyDates)).toBeInTheDocument();
  });
});
