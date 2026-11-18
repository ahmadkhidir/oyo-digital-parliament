/**
 * Field label primitive tests (`NFR-044`): the binding is the caller's `htmlFor`, the copy is
 * the caller's.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FieldLabel } from './FieldLabel';

describe('FieldLabel', () => {
  it("binds to its control through htmlFor and renders the caller's copy", () => {
    render(
      <>
        <FieldLabel htmlFor="ward">Wádìí</FieldLabel>
        <input id="ward" />
      </>,
    );
    const label = screen.getByText('Wádìí');
    expect(label).toHaveAttribute('for', 'ward');
    expect(screen.getByLabelText('Wádìí')).toBeInTheDocument();
  });

  it("carries a required marker only as the caller's copy, never as its own", () => {
    render(<FieldLabel htmlFor="ward">Wádìí máṣẹ̀</FieldLabel>);
    expect(screen.getByText('Wádìí máṣẹ̀').textContent).toBe('Wádìí máṣẹ̀');
  });
});
