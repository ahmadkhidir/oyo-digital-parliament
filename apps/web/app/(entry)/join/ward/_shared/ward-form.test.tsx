/**
 * The Ward Confirmation form's client states (`screens/05-ward-confirmation.md`, `C-010`, `C-011`).
 *
 * The island exists for four states a server render cannot carry: the matching spinner, the
 * candidates, the no-match note and the failed suggestion, plus the offline banner. The tests drive
 * the debounced request and assert what a resident reads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { catalogues } from '../../../../../messages';
import { WardForm } from './ward-form';

const copy = catalogues['en-NG'].ward;
const KEY = '3f9c2b1a-4d5e-4f6a-8b7c-9d0e1f2a3b4c';

/** The candidate the suggestion returns. */
const AGBAWO = {
  wardId: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM',
  name: 'Ward IV, Agbowo',
  localGovernmentArea: 'Ibadan North',
  rank: 1,
  source: 'alias' as const,
};

/** Renders the island with no remembered words. */
function renderForm() {
  return render(
    <WardForm
      action={async () => {}}
      idempotencyKey={KEY}
      localGovernmentAreas={['Ibadan North']}
      defaults={{ description: '', localGovernmentArea: '' }}
      copy={copy}
      referenceUnavailable={false}
    />,
  );
}

/** Types a description and advances past the debounce, flushing the fetch. */
async function typeAndSettle(value = 'Agbowo'): Promise<void> {
  fireEvent.change(screen.getByLabelText(copy.descriptionLabel), { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

describe('WardForm (screens/05 Candidate wards)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the matching state before the answer arrives', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderForm();

    await typeAndSettle();

    expect(screen.getByText(copy.suggesting)).toBeInTheDocument();
  });

  it('offers the candidates and requires an explicit choice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: { candidates: [AGBAWO], capabilityStatus: 'fallback', confirmationRequired: true },
        }),
      })),
    );
    renderForm();

    await typeAndSettle();

    expect(screen.getByRole('group', { name: copy.candidatesLegend })).toBeInTheDocument();
    const option = screen.getByRole('radio', {
      name: `${AGBAWO.name} — ${AGBAWO.localGovernmentArea}`,
    });
    expect(option).not.toBeChecked();
    expect(screen.getByRole('button', { name: copy.confirm })).toBeDisabled();

    fireEvent.click(option);
    expect(option).toBeChecked();
    expect(screen.getByRole('button', { name: copy.confirm })).toBeEnabled();
  });

  it('states the no-match note and keeps None of these available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: { candidates: [], capabilityStatus: 'fallback', confirmationRequired: true },
        }),
      })),
    );
    renderForm();

    await typeAndSettle('After the old cocoa shed');

    expect(screen.getByText(copy.noCandidates)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.noneOfThese })).toBeEnabled();
  });

  it('states the failed suggestion and keeps the description usable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    );
    renderForm();

    await typeAndSettle();

    expect(screen.getByText(copy.candidateError)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.descriptionLabel)).toBeEnabled();
    expect(screen.getByRole('button', { name: copy.noneOfThese })).toBeEnabled();
  });

  it('asks for the local government area when two wards share the name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'VALIDATION_FAILED',
            cause: 'WARD_AREA_REQUIRED',
            fields: { localGovernmentArea: 'REQUIRED' },
          },
        }),
      })),
    );
    renderForm();

    await typeAndSettle('Agbowo');

    expect(screen.getByText(copy.areaRequired)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.areaLabel)).toBeEnabled();
  });

  it('holds the form and states the reason when the browser is offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    );
    renderForm();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getAllByText(copy.offline).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(copy.descriptionLabel)).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.offlineSubmit })).toBeDisabled();
  });
});
