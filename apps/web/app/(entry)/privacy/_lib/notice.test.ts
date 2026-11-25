/**
 * The privacy notice's published versions (`C-037`, `screens/23-privacy-notice.md`).
 *
 * The launch notice has one version; the "Updated" state is proved against a two-version fixture
 * here and rendered by the screen test beside it. An unknown version is never invented.
 */
import { describe, expect, it } from 'vitest';
import { catalogues } from '../../../../messages';
import {
  LAUNCH_NOTICE_VERSION,
  launchNoticeHistory,
  selectNotice,
  type NoticeVersion,
} from './notice';

const copy = catalogues['en-NG'].privacy;

/** A previous version, as a later publication would leave it. */
const PREVIOUS: NoticeVersion = {
  version: '2026-09-15',
  effectiveAt: '2026-09-15T00:00:00Z',
  summary: 'The notice as it stood before the processor was named.',
  lawfulBasis: ['Account and ward.'],
  rights: ['Access.', 'Correction.'],
  retention: ['Account: life of the account.'],
  processors: [],
};

describe('launchNoticeHistory', () => {
  it('builds the C-037 notice from the catalogue', () => {
    const history = launchNoticeHistory('en-NG');
    expect(history.current).toMatchObject({
      version: LAUNCH_NOTICE_VERSION,
      effectiveAt: '2026-11-01T00:00:00Z',
      summary: copy.summary,
      lawfulBasis: copy.lawfulBasis,
      rights: copy.rights,
      retention: copy.retention,
      processors: copy.processors,
    });
    expect(history.previous).toEqual([]);
  });

  it('builds the same notice in Yoruba', () => {
    const history = launchNoticeHistory('yo-NG');
    expect(history.current.summary).toBe(catalogues['yo-NG'].privacy.summary);
    expect(history.current.summary).not.toBe(copy.summary);
  });

  it('places the contact route in the notice copy it publishes', () => {
    // The notice links to the Contact screen rather than collecting a second request by mail
    // (`screens/23-privacy-notice.md`, Edge Cases); the screen's own test asserts the address.
    expect(copy.contactLink.length).toBeGreaterThan(0);
    expect(copy.contactBody.length).toBeGreaterThan(0);
  });
});

describe('selectNotice', () => {
  it('selects the current notice and lists every earlier version', () => {
    const history = { current: launchNoticeHistory('en-NG').current, previous: [PREVIOUS] };
    const selection = selectNotice(history, null);
    expect(selection).toMatchObject({
      current: true,
      previousVersions: [PREVIOUS.version],
    });
    expect(selection?.notice.version).toBe(LAUNCH_NOTICE_VERSION);
  });

  it('selects a named previous version and names the versions older than it', () => {
    const history = { current: launchNoticeHistory('en-NG').current, previous: [PREVIOUS] };
    const selection = selectNotice(history, PREVIOUS.version);
    expect(selection).toMatchObject({ current: false, previousVersions: [] });
    expect(selection?.notice).toEqual(PREVIOUS);
  });

  it('answers null for a version that was never published', () => {
    const history = launchNoticeHistory('en-NG');
    expect(selectNotice(history, '1999-01-01')).toBeNull();
  });
});
