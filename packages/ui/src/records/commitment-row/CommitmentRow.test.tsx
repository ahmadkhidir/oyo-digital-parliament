/**
 * Commitment Row tests (`docs/OyoDigitalParliament/screens.md`, Shared / Common Components;
 * `NFR-044`): the whole row opens the submission, the flag renders only when present, and the
 * status is a StatusLabel. The row is a list item — every fixture places it in a `<ul>`.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoViolations } from '../../test/a11y';
import { CommitmentRow } from './CommitmentRow';

function Row(props: Partial<Parameters<typeof CommitmentRow>[0]> = {}) {
  return (
    <CommitmentRow
      href="/s/ODP-0142"
      reference="ODP-0142"
      pillarLabel="Infrastructure"
      detail="State Ministry of Works, band ₦50m–₦100m, due Q2 2027"
      status={{ statusKey: 'committed', word: 'Committed' }}
      {...props}
    />
  );
}

describe('CommitmentRow', () => {
  it('opens the submission it came from, with reference and pillar as the title', () => {
    render(
      <ul>
        <Row />
      </ul>,
    );
    const row = screen.getByRole('link', { name: /ODP-0142/ });
    expect(row).toHaveAttribute('href', '/s/ODP-0142');
    expect(row).toHaveTextContent('ODP-0142');
    expect(row).toHaveTextContent('Infrastructure');
  });

  it('renders the detail and the status word', () => {
    render(
      <ul>
        <Row />
      </ul>,
    );
    expect(screen.getByText(/State Ministry of Works/)).toBeInTheDocument();
    expect(screen.getByText('Committed')).toBeInTheDocument();
  });

  it('shows the withdrawal flag only when the caller passes one', () => {
    render(
      <ul>
        <Row flag="The author withdrew this submission." />
      </ul>,
    );
    expect(screen.getByText('The author withdrew this submission.')).toBeInTheDocument();
  });

  it('renders no flag and no invented state when there is none', () => {
    render(
      <ul>
        <Row flag={null} />
      </ul>,
    );
    const row = screen.getByRole('link', { name: /ODP-0142/ });
    expect(row.textContent).not.toContain('withdrew');
  });

  it('renders Yoruba-length title and detail without truncation classes', () => {
    render(
      <ul>
        <Row
          pillarLabel="Ìmọ̀ ẹ̀rọ ìbánisọ̀rọ̀ àti ìrànlọ́wọ́ ìjọba ìbílẹ̀"
          detail="Ìjọba ìpínlẹ̀, ẹgbẹ̀rún náírà, ìkẹta ọdún 2027"
        />
      </ul>,
    );
    const row = screen.getByRole('link', { name: /ODP-0142/ });
    expect(row.textContent).toContain('Ìmọ̀ ẹ̀rọ ìbánisọ̀rọ̀ àti ìrànlọ́wọ́ ìjọba ìbílẹ̀');
    expect(row.className).not.toContain('truncate');
    expect(row.className).not.toContain('line-clamp');
  });

  it('passes axe in light and dark, in both launch locales (NFR-044)', async () => {
    for (const [lang, row] of [
      ['en', <Row />],
      [
        'yo',
        <Row
          pillarLabel="Ìmọ̀ ẹ̀rọ ìbánisọ̀rọ̀"
          detail="Ìjọba ìpínlẹ̀, ẹgbẹ̀rún náírà"
          status={{ statusKey: 'committed', word: 'Ìfọwọ́sí' }}
        />,
      ],
    ] as const) {
      for (const mode of ['light', 'dark'] as const) {
        const { container, unmount } = render(<ul>{row}</ul>);
        await expectNoViolations(container, mode, lang);
        unmount();
      }
    }
  });
});
