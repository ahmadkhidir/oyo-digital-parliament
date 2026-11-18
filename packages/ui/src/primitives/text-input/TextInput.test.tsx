/**
 * Text input primitive tests (`branding.md`, Component Tokens → Inputs; `NFR-044`): the four
 * declared states, the caller-driven association, and the axe run in both families and locales.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoViolations } from '../../test/a11y';
import { FieldError } from '../field-error/FieldError';
import { FieldLabel } from '../field-label/FieldLabel';
import { TextInput } from './TextInput';

/** One labelled field, the way the forms layer composes the three primitives. */
function Field({ invalid = false, disabled = false }: { invalid?: boolean; disabled?: boolean }) {
  return (
    <>
      <FieldLabel htmlFor="phone">Nọ́mbà fónù</FieldLabel>
      <TextInput
        id="phone"
        invalid={invalid}
        disabled={disabled}
        aria-describedby={invalid ? 'phone-error' : undefined}
      />
      {invalid ? <FieldError id="phone-error">Nọ́mbà kò tọ́</FieldError> : null}
    </>
  );
}

describe('TextInput', () => {
  it('renders the default state as a labelled textbox', () => {
    render(<Field />);
    const input = screen.getByLabelText('Nọ́mbà fónù');
    expect(input).toHaveAttribute('type', 'text');
    expect(input.className).toContain('border-border');
    expect(input).not.toBeInvalid();
  });

  it('marks the error state with aria-invalid and the error border', () => {
    render(<Field invalid />);
    const input = screen.getByLabelText('Nọ́mbà fónù');
    expect(input).toBeInvalid();
    expect(input.className).toContain('border-error-500');
    // The caller wired the association; the control carries it.
    expect(input).toHaveAttribute('aria-describedby', 'phone-error');
  });

  it('disables into the surface-secondary state', () => {
    render(<Field disabled />);
    const input = screen.getByLabelText('Nọ́mbà fónù');
    expect(input).toBeDisabled();
    expect(input.className).toContain('bg-surface-secondary');
    expect(input.className).toContain('text-text-secondary');
  });

  it('accepts keyboard input and shows the focus treatment', async () => {
    const user = userEvent.setup();
    render(<Field />);
    await user.click(screen.getByLabelText('Nọ́mbà fónù'));
    // A text control is focus-visible on click; the ring rides the same treatment.
    const input = screen.getByLabelText('Nọ́mbà fónù');
    expect(input.className).toContain('focus-visible:ring-primary-500');
    await user.type(input, 'ọmọ');
    expect(input).toHaveValue('ọmọ');
  });

  it('passes axe in light and dark, in both launch locales (NFR-044)', async () => {
    for (const [lang, label] of [
      ['en', 'Phone number'],
      ['yo', 'Nọ́mbà fónù'],
    ] as const) {
      for (const mode of ['light', 'dark'] as const) {
        const { container, unmount } = render(
          <>
            <FieldLabel htmlFor="field">{label}</FieldLabel>
            <TextInput id="field" />
          </>,
        );
        await expectNoViolations(container, mode, lang);
        unmount();
      }
    }
  });
});
