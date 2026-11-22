'use client';

/**
 * The offline banner and the guarded primary control, shared by the registration form, the
 * confirmation form and the sign-in forms (`screens/03`, `screens/04`, `screens/02` Offline
 * states; `NFR-044`: the reason is text, never a tint, and it is announced as it appears).
 *
 * The banner renders only while the browser is offline; it is a live region so the change is
 * announced. The submit control disables itself with the same reason, and its label says so, so
 * the state never depends on colour or position alone.
 */
import { Button, Notice, type ButtonVariant } from '@odp/ui';
import { useFormStatus } from 'react-dom';
import { useOffline } from './use-offline';

export interface OfflineNoteProps {
  /** The banner sentence, already translated. */
  message: string;
}

export function OfflineNote({ message }: OfflineNoteProps) {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <Notice role="status" tone="warning">
      {message}
    </Notice>
  );
}

export interface GuardedSubmitProps {
  /** The control's variant at rest. */
  variant: ButtonVariant;
  /** The label at rest, already translated. */
  label: string;
  /** The label while the write is in flight. */
  sendingLabel: string;
  /** The label while the browser is offline; the control is disabled with it. */
  offlineLabel: string;
  type?: 'submit' | 'button';
  className?: string;
  onClick?: () => void;
}

/**
 * The primary control of an entry-flow form: busy while the server action is in flight, disabled
 * while the connection is gone, and labelled for each state it can be read in.
 */
export function GuardedSubmit({
  variant,
  label,
  sendingLabel,
  offlineLabel,
  type,
  className,
  onClick,
}: GuardedSubmitProps) {
  const offline = useOffline();
  const { pending } = useFormStatus();
  const state = offline ? 'offline' : pending ? 'sending' : 'rest';
  return (
    <Button
      variant={variant}
      type={type ?? 'submit'}
      isLoading={state === 'sending'}
      disabled={state === 'offline'}
      className={className}
      onClick={onClick}
    >
      {state === 'sending' ? sendingLabel : state === 'offline' ? offlineLabel : label}
    </Button>
  );
}
