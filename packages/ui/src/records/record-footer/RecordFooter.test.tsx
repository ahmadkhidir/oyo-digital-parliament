/**
 * Record Footer tests (`docs/OyoDigitalParliament/screens.md`, Shared / Common Components;
 * `NFR-044`): disclosure, record links, privacy/contact/data-rights, and the language switch
 * as a working no-scripting form.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoViolations } from '../../test/a11y';
import { RecordFooter } from './RecordFooter';

function Footer(props: Partial<Parameters<typeof RecordFooter>[0]> = {}) {
  return (
    <RecordFooter
      disclosure="A campaign instrument, not a government body."
      navLabel="Record links"
      recordLinks={[
        { href: '/commitments', label: 'Commitments' },
        { href: '/declined', label: 'Declined' },
        { href: '/report-card', label: 'Report card' },
      ]}
      privacy={{ href: '/privacy', label: 'Privacy' }}
      contact={{ href: 'mailto:record@example.org', label: 'Contact' }}
      dataRights={{ href: '/me', label: 'My data' }}
      languageSwitch={{
        id: 'footer-locale',
        name: 'locale',
        legend: 'Language',
        action: '/locale',
        currentValue: 'en',
        options: [
          { value: 'en', label: 'English' },
          { value: 'yo', label: 'Yorùbá' },
        ],
        submitLabel: 'Apply',
      }}
      {...props}
    />
  );
}

describe('RecordFooter', () => {
  it('renders the campaign disclosure as text', () => {
    render(<Footer />);
    expect(screen.getByText('A campaign instrument, not a government body.')).toBeInTheDocument();
  });

  it('renders the record links, privacy, contact and data rights with their addresses', () => {
    render(<Footer />);
    for (const [label, href] of [
      ['Commitments', '/commitments'],
      ['Privacy', '/privacy'],
      ['Contact', 'mailto:record@example.org'],
      ['My data', '/me'],
    ] as const) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('renders the language switch as a labelled select with an apply button', () => {
    render(<Footer />);
    const select = screen.getByLabelText('Language');
    expect(select).toHaveAttribute('name', 'locale');
    expect(select).toHaveValue('en');
    expect(screen.getByRole('option', { name: 'Yorùbá' })).toBeInTheDocument();
    // The apply submit works without scripting.
    const form = select.closest('form');
    expect(form).toHaveAttribute('action', '/locale');
    expect(form).toHaveAttribute('method', 'post');
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveAttribute('type', 'submit');
  });

  it('takes a server action without forcing a method attribute', () => {
    render(
      <Footer
        languageSwitch={{
          id: 'footer-locale',
          name: 'locale',
          legend: 'Language',
          action: () => undefined,
          currentValue: 'en',
          options: [{ value: 'en', label: 'English' }],
          submitLabel: 'Apply',
        }}
      />,
    );
    expect(screen.getByLabelText('Language').closest('form')).not.toHaveAttribute('method');
  });

  it('passes axe in light and dark, in both launch locales (NFR-044)', async () => {
    for (const [lang, footer] of [
      ['en', <Footer />],
      [
        'yo',
        <RecordFooter
          disclosure="Ìṣẹ́ ìpolongo ni, kì í ṣe ìjọba."
          navLabel="Àwọn ojú-iṣẹ́"
          recordLinks={[{ href: '/commitments', label: 'Ìfọwọ́sí' }]}
          privacy={{ href: '/privacy', label: 'Ìfọwọ́sí ẹlẹ́yọ' }}
          contact={{ href: 'mailto:record@example.org', label: 'Kán sì wa' }}
          dataRights={{ href: '/me', label: 'Dátà mi' }}
          languageSwitch={{
            id: 'footer-locale',
            name: 'locale',
            legend: 'Èdè',
            action: '/locale',
            currentValue: 'yo',
            options: [
              { value: 'en', label: 'English' },
              { value: 'yo', label: 'Yorùbá' },
            ],
            submitLabel: 'Fi sílẹ̀',
          }}
        />,
      ],
    ] as const) {
      for (const mode of ['light', 'dark'] as const) {
        const { container, unmount } = render(footer);
        await expectNoViolations(container, mode, lang);
        unmount();
      }
    }
  });
});
