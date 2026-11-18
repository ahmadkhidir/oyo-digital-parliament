/**
 * Decision Reason Block tests (`docs/OyoDigitalParliament/screens.md`, Shared / Common
 * Components; `NFR-044`): the reason in full — never collapsed, never truncated — with the
 * superseded decision marked, not removed.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoViolations } from '../../test/a11y';
import { DecisionReasonBlock } from './DecisionReasonBlock';

function Block(props: Partial<Parameters<typeof DecisionReasonBlock>[0]> = {}) {
  return (
    <DecisionReasonBlock
      decision="Committed: borehole rehabilitation in Ward 12"
      signatory="Campaign response lead, 14 March 2027"
      reason="The campaign commits to the rehabilitation because the assessment confirmed the water table finding, and the cost band held within the quarterly envelope."
      {...props}
    />
  );
}

describe('DecisionReasonBlock', () => {
  it('renders the decision as a heading, the signatory beneath it, and the reason in full', () => {
    render(<Block />);
    expect(
      screen.getByRole('heading', { name: 'Committed: borehole rehabilitation in Ward 12' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Campaign response lead/)).toBeInTheDocument();
    expect(screen.getByText(/rehabilitation because the assessment/)).toBeInTheDocument();
  });

  it('never collapses or truncates the reason', () => {
    render(
      <Block
        reason={
          <>
            <p>First paragraph of the published reason.</p>
            <p>Second paragraph, still in full.</p>
          </>
        }
      />,
    );
    expect(screen.getByText('First paragraph of the published reason.')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph, still in full.')).toBeInTheDocument();
  });

  it('renders no revision note when the decision stands', () => {
    render(<Block />);
    expect(screen.queryByText('Superseded')).toBeNull();
  });

  it('marks a revision with the caller word and keeps the earlier decision', () => {
    render(
      <Block
        supersededWord="Superseded"
        supersededDecision="Earlier: referred for assessment, 2 February 2027."
      />,
    );
    expect(screen.getByText('Superseded')).toBeInTheDocument();
    expect(
      screen.getByText('Earlier: referred for assessment, 2 February 2027.'),
    ).toBeInTheDocument();
  });

  it('passes axe in light and dark, in both launch locales (NFR-044)', async () => {
    for (const [lang, block] of [
      ['en', <Block />],
      [
        'yo',
        <Block
          decision="Ìfọwọ́sí: ìtúnjú omi wádìí 12"
          signatory="Olùdarí èsì, 14 osu kẹta 2027"
          reason="Ìwàláílè nítorí ìdánwò náà fidi rọ́gbẹ̀dọ́ omi náà múlẹ̀."
        />,
      ],
    ] as const) {
      for (const mode of ['light', 'dark'] as const) {
        const { container, unmount } = render(block);
        await expectNoViolations(container, mode, lang);
        unmount();
      }
    }
  });
});
