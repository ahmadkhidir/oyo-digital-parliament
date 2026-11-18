'use client';

/**
 * Sign-in Prompt — `docs/OyoDigitalParliament/screens.md`, Shared / Common Components.
 *
 * The one named client boundary in this slice, justified under `packages/ui/AGENTS.md`
 * ("Server-first, hydrated only for interaction"): a modal needs focus management. It uses
 * the native `<dialog>` with `showModal()`, so the focus trap, Escape handling and focus
 * return are the platform's, not a reimplementation.
 *
 * The caller owns the state: `open` opens it, `onDismiss` closes it without changing
 * anything. Continue is an anchor carrying the button presentation (`buttonClasses`), because
 * sign-in is a navigation — the caller appends the return location to `continueHref`. Every
 * word is the caller's copy.
 */
import { useEffect, useRef } from 'react';
import { Button, buttonClasses } from '../../primitives/button/Button';

export interface SignInPromptProps {
  /** Whether the prompt is open. */
  open: boolean;
  /** The action that needs a session, named by the caller's message catalogue. */
  message: string;
  /** The sign-in address; the caller appends the place to return to. */
  continueHref: string;
  continueLabel: string;
  dismissLabel: string;
  /** Closes the prompt without changing anything. */
  onDismiss: () => void;
}

export function SignInPrompt({
  open,
  message,
  continueHref,
  continueLabel,
  dismissLabel,
  onDismiss,
}: SignInPromptProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Native modal first: focus trap, Escape handling and focus return (`NFR-044`). The open
    // attribute is the fallback for environments without `showModal`/`close` (jsdom), which
    // renders the prompt inline non-modally rather than dropping it.
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={message}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      className="m-auto rounded-lg bg-surface p-lg text-start shadow-lg"
    >
      <p className="text-body text-text-primary">{message}</p>
      <div className="mt-lg flex flex-col gap-sm tablet:flex-row">
        <a href={continueHref} className={buttonClasses('primary')}>
          {continueLabel}
        </a>
        <Button variant="ghost" onClick={onDismiss}>
          {dismissLabel}
        </Button>
      </div>
    </dialog>
  );
}
