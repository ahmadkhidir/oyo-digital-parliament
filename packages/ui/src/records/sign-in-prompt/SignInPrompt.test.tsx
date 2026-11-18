/**
 * Sign-in Prompt tests (`docs/OyoDigitalParliament/screens.md`, Shared / Common Components;
 * `NFR-044`). jsdom does not implement `showModal`, so the fixture exercises the declared
 * non-modal fallback; the modal path is the browser's native `<dialog>`.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoViolations } from '../../test/a11y';
import { SignInPrompt } from './SignInPrompt';

function Harness({ onDismiss }: { onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Attempt
      </button>
      <SignInPrompt
        open={open}
        message="Sign in to submit a proposal."
        continueHref="/sign-in?return=/submit"
        continueLabel="Continue"
        dismissLabel="Dismiss"
        onDismiss={() => {
          setOpen(false);
          onDismiss();
        }}
      />
    </>
  );
}

async function openPrompt(onDismiss: () => void) {
  const user = userEvent.setup();
  render(<Harness onDismiss={onDismiss} />);
  await user.click(screen.getByRole('button', { name: 'Attempt' }));
  return user;
}

describe('SignInPrompt', () => {
  it('opens with the caller message, names the action, and offers continue and dismiss', async () => {
    await openPrompt(vi.fn());
    const dialog = screen.getByRole('dialog', { name: 'Sign in to submit a proposal.' });
    expect(dialog).toBeInTheDocument();
    const continueLink = screen.getByRole('link', { name: 'Continue' });
    // Continue opens sign-in and returns to the same place; the caller owns the return.
    expect(continueLink).toHaveAttribute('href', '/sign-in?return=/submit');
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('dismisses without changing anything', async () => {
    const onDismiss = vi.fn();
    const user = await openPrompt(onDismiss);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reaches continue and dismiss with the keyboard', async () => {
    const user = await openPrompt(vi.fn());
    await user.tab();
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveFocus();
  });

  it('passes axe in light and dark, in both launch locales (NFR-044)', async () => {
    for (const [lang, props] of [
      [
        'en',
        {
          message: 'Sign in to submit a proposal.',
          continueLabel: 'Continue',
          dismissLabel: 'Dismiss',
        },
      ],
      [
        'yo',
        {
          message: 'Forúkọ rọ́ kí o lè fi iṣẹ́ ránṣẹ́.',
          continueLabel: 'Tẹ̀síwájú',
          dismissLabel: 'Fìdí múlẹ̀',
        },
      ],
    ] as const) {
      for (const mode of ['light', 'dark'] as const) {
        const { container, unmount } = render(
          <SignInPrompt open {...props} continueHref="/sign-in" onDismiss={() => undefined} />,
        );
        await expectNoViolations(container, mode, lang);
        unmount();
      }
    }
  });
});
