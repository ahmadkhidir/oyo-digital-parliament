/**
 * The entry index tests (`screens.md` Navigation Map; `screens/02`, `screens/03` entry points).
 *
 * The current entry is marked for assistive technology, a reachable entry is a real link, and the
 * margin number stays decorative - the label is the entry's name, never a number alone.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EntryIndex } from './entry-index';

const ITEMS = [
  { id: 'join', label: 'Join the record', current: true },
  { id: 'confirm', label: 'Confirm your number' },
  { id: 'sign-in', label: 'Sign in', href: '/sign-in' },
] as const;

describe('EntryIndex', () => {
  it('marks the current entry without turning it into a link', () => {
    render(<EntryIndex items={ITEMS} />);

    expect(screen.queryByRole('link', { name: 'Join the record' })).toBeNull();
    expect(screen.getByText('Join the record').closest('[aria-current]')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('renders a reachable entry as a link to its own address', () => {
    render(<EntryIndex items={ITEMS} />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
  });

  it('keeps an unreachable entry as text, and the ordinal out of the accessible name', () => {
    render(<EntryIndex items={ITEMS} />);

    expect(screen.queryByRole('link', { name: 'Confirm your number' })).toBeNull();
    const confirm = screen.getByText('Confirm your number');
    expect(confirm).toBeInTheDocument();
    // The margin number is decorative: it is hidden from the accessibility tree.
    const ordinals = screen.getAllByText(/^\d{2}$/, { selector: '[aria-hidden="true"]' });
    expect(ordinals).toHaveLength(ITEMS.length);
  });
});
