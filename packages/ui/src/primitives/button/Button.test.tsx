/**
 * Button primitive tests (`branding.md`, Component Tokens → Buttons; `NFR-044`).
 *
 * Every variant, the loading and disabled states, keyboard focus with the shared ring, and
 * the axe run over all variants in both token families and both launch locales.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoViolations } from '../../test/a11y';
import { Button, buttonClasses, type ButtonVariant } from './Button';

const VARIANTS: readonly ButtonVariant[] = [
  'primary',
  'secondary',
  'outline',
  'ghost',
  'destructive',
];

describe('Button', () => {
  it('renders every variant with its accessible name', () => {
    for (const variant of VARIANTS) {
      const { unmount } = render(<Button variant={variant}>Fìxàll</Button>);
      expect(screen.getByRole('button', { name: 'Fìxàll' })).toBeInTheDocument();
      unmount();
    }
  });

  it('defaults to type="button" and honours an explicit submit', () => {
    const { unmount: unmountDefault } = render(<Button variant="primary">Fìxàll</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    unmountDefault();

    const { unmount: unmountSubmit } = render(
      <Button variant="primary" type="submit">
        Fìxàll
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
    unmountSubmit();
  });

  it('keeps the label while loading, announces the pending write, and disables the control', () => {
    render(
      <Button variant="primary" isLoading>
        Ìfìsí
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Ìfìsí' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    // The A-025 spinner rides the label, hidden from the accessibility tree.
    expect(button.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('disables on the disabled prop without inventing a state of its own', () => {
    render(
      <Button variant="outline" disabled>
        Ìfìsí
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Ìfìsí' })).toBeDisabled();
  });

  it('reaches focus with the keyboard and carries the shared focus treatment', async () => {
    const user = userEvent.setup();
    render(<Button variant="primary">Fọ̀kànsì</Button>);
    await user.tab();
    const button = screen.getByRole('button', { name: 'Fọ̀kànsì' });
    expect(button).toHaveFocus();
    // The ring contract (branding.md, Accessibility): visible 2px primary-500 ring with 2px offset.
    expect(button.className).toContain('focus-visible:ring-2');
    expect(button.className).toContain('focus-visible:ring-primary-500');
    expect(button.className).toContain('focus-visible:ring-offset-2');
  });

  it('passes axe in light and dark, in both launch locales (NFR-044)', async () => {
    for (const [lang, word] of [
      ['en', 'Continue'],
      ['yo', 'Tẹ̀síwájú'],
    ] as const) {
      for (const mode of ['light', 'dark'] as const) {
        const { container, unmount } = render(
          <div>
            {VARIANTS.map((variant) => (
              <Button key={variant} variant={variant}>
                {word}
              </Button>
            ))}
          </div>,
        );
        await expectNoViolations(container, mode, lang);
        unmount();
      }
    }
  });

  it('exposes variant classes for the rare anchor that carries a button presentation', () => {
    expect(buttonClasses('primary')).toContain('bg-primary-700');
    expect(buttonClasses('ghost')).toContain('text-text-secondary');
  });
});
