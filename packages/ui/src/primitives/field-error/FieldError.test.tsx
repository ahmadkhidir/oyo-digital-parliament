/**
 * Field error primitive tests (`NFR-044`, WCAG 3.3.1): the message is the caller's, announced
 * through `role="alert"`, and bound by id into the control's `aria-describedby`.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FieldError } from './FieldError';

describe('FieldError', () => {
  it('renders the caller sentence with the alert role and the error token', () => {
    render(<FieldError id="reference-error">Ẹ̀yà kò bájẹ́</FieldError>);
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Ẹ̀yà kò bájẹ́');
    expect(error).toHaveAttribute('id', 'reference-error');
    expect(error.className).toContain('text-error-500');
  });

  it("renders no copy of its own — the sentence is always the caller's", () => {
    const { container } = render(<FieldError id="reference-error">Ẹ̀yà kò bájẹ́</FieldError>);
    expect(container.textContent).toBe('Ẹ̀yà kò bájẹ́');
  });
});
