'use client';

/**
 * The offline banner and the guarded primary control, shared by the registration form and the
 * confirmation form (`screens/03` and `screens/04` Offline states; `NFR-044`: the reason is text,
 * never a tint, and it is announced as it appears).
 *
 * The banner renders only while the browser is offline; it is a live region so the change is
 * announced. The submit control disables itself with the same reason, and its label says so, so
 * the state never depends on colour or position alone.
 */
import { Button, type ButtonVariant } from '@odp/ui';
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
    <p
      role="status"
      className="border-b border-border bg-surface-secondary px-md py-sm text-body text-text-primary"
    >
      {message}
    </p>
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
  onClick?: () => void;
}

/**
 * The primary control of a join-flow form: busy while the server action is in flight, disabled
 * while the connection is gone, and labelled for each state it can be read in.
 */
export function GuardedSubmit({
  variant,
  label,
  sendingLabel,
  offlineLabel,
  type,
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
      onClick={onClick}
    >
      {state === 'sending' ? sendingLabel : state === 'offline' ? offlineLabel : label}
    </Button>
  );
}
