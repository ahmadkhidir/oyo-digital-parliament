/**
 * Notice tests (`screens.md` alert and inline-message components; `NFR-044`).
 *
 * Each tone renders, the announcement role is the caller's, and the action keeps its own
 * accessible name. axe runs in both token families and both launch locales, because the notice
 * appears on the first screen a resident meets.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoViolations } from '../../test/a11y';
import { Notice, type NoticeTone } from './Notice';

const TONES: readonly NoticeTone[] = ['neutral', 'accent', 'info', 'warning', 'error', 'success'];

describe('Notice', () => {
  it('renders the translated reason and title', () => {
    render(
      <Notice role="alert" tone="warning" title="The code could not be sent">
        Your registration is held for 24 hours.
      </Notice>,
    );
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('The code could not be sent');
    expect(notice).toHaveTextContent('Your registration is held for 24 hours.');
  });

  it('announces an outcome as a status, and a notice present on arrival with no role', () => {
    const { rerender } = render(<Notice role="status">A new code is on its way.</Notice>);
    expect(screen.getByRole('status')).toHaveTextContent('A new code is on its way.');

    rerender(<Notice>What becomes public</Notice>);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the recovery action with its own accessible name', () => {
    render(
      <Notice
        role="alert"
        action={
          <a href="/join/confirm" className="underline">
            Continue to confirm your number
          </a>
        }
      >
        The code could not be sent.
      </Notice>,
    );
    expect(screen.getByRole('link', { name: 'Continue to confirm your number' })).toHaveAttribute(
      'href',
      '/join/confirm',
    );
  });

  it('renders every tone, and passes axe in light and dark in both launch locales', async () => {
    for (const tone of TONES) {
      for (const [mode, lang] of [
        ['light', 'en'],
        ['light', 'yo'],
        ['dark', 'en'],
        ['dark', 'yo'],
      ] as const) {
        const { container, unmount } = render(
          <Notice tone={tone} role="status" title="Ìwé ìforúkọsílẹ̀">
            Ìforúkọsílẹ̀ rẹ̀ wà ní ìpamọ́.
          </Notice>,
        );
        await expectNoViolations(container, mode, lang);
        unmount();
      }
    }
  });
});
