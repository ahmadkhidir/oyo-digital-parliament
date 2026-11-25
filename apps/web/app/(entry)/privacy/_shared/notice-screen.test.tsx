/**
 * The privacy notice screen states (`screens/23-privacy-notice.md`, `C-037`, `NFR-040`,
 * `NFR-045`).
 *
 * The launch notice carries one version; the Updated state is rendered here against a two-version
 * fixture, because the screen must name the change date and keep the replaced version reachable as
 * soon as a second version exists. The error state proves the contact route rather than a blank
 * page.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { catalogues } from '../../../../messages';
import { launchNoticeHistory, type NoticeVersion } from '../_lib/notice';
import { PrivacyNoticeScreen } from './notice-screen';

const copy = catalogues['en-NG'].privacy;
const history = launchNoticeHistory('en-NG');

const PREVIOUS: NoticeVersion = {
  version: '2026-09-15',
  effectiveAt: '2026-09-15T00:00:00Z',
  summary: 'The notice as it stood before the processor was named.',
  lawfulBasis: ['Account and ward.'],
  rights: ['Access.', 'Correction.'],
  retention: ['Account: life of the account.'],
  processors: [],
};

const TWO_VERSIONS = { current: history.current, previous: [PREVIOUS] };

describe('PrivacyNoticeScreen (screens/23-privacy-notice.md)', () => {
  it('renders the default notice with every declared section', () => {
    render(
      <PrivacyNoticeScreen copy={copy} locale="en-NG" history={history} requestedVersion={null} />,
    );

    expect(screen.getByRole('heading', { level: 1, name: copy.heading })).toBeInTheDocument();
    expect(screen.getByText(copy.summary)).toBeInTheDocument();
    expect(screen.getByText(copy.lawfulHeading)).toBeInTheDocument();
    expect(screen.getByText(copy.rightsHeading)).toBeInTheDocument();
    expect(screen.getByText(copy.retentionHeading)).toBeInTheDocument();
    expect(screen.getByText(copy.processorsHeading)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: copy.contactHeading })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.contactLink })).toHaveAttribute(
      'href',
      '/contact',
    );
    expect(screen.queryByRole('navigation', { name: copy.previousHeading })).toBeNull();
  });

  it('renders the Updated state against a two-version fixture', () => {
    render(
      <PrivacyNoticeScreen
        copy={copy}
        locale="en-NG"
        history={TWO_VERSIONS}
        requestedVersion={null}
      />,
    );

    expect(screen.getByText(/This notice changed on/)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: copy.previousHeading })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Version of/ })).toHaveAttribute(
      'href',
      '/privacy?version=2026-09-15',
    );
  });

  it('renders a previous version with the way back to the current one', () => {
    render(
      <PrivacyNoticeScreen
        copy={copy}
        locale="en-NG"
        history={TWO_VERSIONS}
        requestedVersion={PREVIOUS.version}
      />,
    );

    expect(screen.getByText(/You are reading the version of/)).toBeInTheDocument();
    expect(screen.getByText(PREVIOUS.summary)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.currentLink })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('renders the error state with the contact route for an unknown version', () => {
    render(
      <PrivacyNoticeScreen
        copy={copy}
        locale="en-NG"
        history={history}
        requestedVersion="1999-01-01"
      />,
    );

    expect(screen.getByText(copy.errorHeading)).toBeInTheDocument();
    expect(screen.getByText(copy.unknownVersion)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.contactLink })).toHaveAttribute(
      'href',
      '/contact',
    );
  });

  it('renders the Yoruba notice with no English summary', () => {
    const yo = catalogues['yo-NG'].privacy;
    render(
      <PrivacyNoticeScreen
        copy={yo}
        locale="yo-NG"
        history={launchNoticeHistory('yo-NG')}
        requestedVersion={null}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: yo.heading })).toBeInTheDocument();
    expect(screen.getByText(yo.summary)).toBeInTheDocument();
    expect(screen.queryByText(copy.summary)).toBeNull();
  });
});
