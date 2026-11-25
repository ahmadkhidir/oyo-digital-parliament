/**
 * The published contact channel (`screens/27-contact.md`, `operations.md` Resident).
 *
 * The channel is a deployment value, not a vendor link in a component: a configured address is
 * rendered as given, and anything else — unset, empty, or not a web address — is "no channel", so
 * the screen states the fallback instead of rendering a dead link.
 */
import { describe, expect, it } from 'vitest';
import { PRIVACY_MAILBOX, privacyMailboxHref, readContactChannel } from './channel';

describe('readContactChannel (screens/27-contact.md)', () => {
  it('accepts a published form over https or http', () => {
    expect(readContactChannel('https://forms.example.org/odp-contact')).toEqual({
      kind: 'configured',
      formUrl: 'https://forms.example.org/odp-contact',
    });
    expect(readContactChannel('http://127.0.0.1:4100/contact')).toEqual({
      kind: 'configured',
      formUrl: 'http://127.0.0.1:4100/contact',
    });
  });

  it('trims the surrounding whitespace an environment file may carry', () => {
    expect(readContactChannel('  https://forms.example.org/contact\n')).toEqual({
      kind: 'configured',
      formUrl: 'https://forms.example.org/contact',
    });
  });

  it('treats an unset or empty deployment value as no channel', () => {
    // Every value here is handed in, including `undefined`: a supplied value states "no channel"
    // and is never replaced by the deployment value. Only an omitted argument reads the
    // environment, so the outcome does not change when `CONTACT_FORM_URL` is set (as CI sets it).
    for (const raw of [undefined, null, '', '   ', 42, true]) {
      expect(readContactChannel(raw)).toEqual({ kind: 'unavailable' });
    }
  });

  it('refuses a value that is not a web address', () => {
    for (const raw of [
      'not a url',
      'mailto:privacy@example.org',
      'javascript:alert(1)',
      'ftp://forms.example.org/contact',
      '//forms.example.org/contact',
    ]) {
      expect(readContactChannel(raw)).toEqual({ kind: 'unavailable' });
    }
  });

  it('reads the deployment variable when no value is handed in', () => {
    const previous = process.env.CONTACT_FORM_URL;
    process.env.CONTACT_FORM_URL = 'https://forms.example.org/deployment';
    try {
      expect(readContactChannel()).toEqual({
        kind: 'configured',
        formUrl: 'https://forms.example.org/deployment',
      });
    } finally {
      if (previous === undefined) delete process.env.CONTACT_FORM_URL;
      else process.env.CONTACT_FORM_URL = previous;
    }
  });

  it('opens the published privacy mailbox as its mailto address', () => {
    expect(PRIVACY_MAILBOX).toContain('@');
    expect(privacyMailboxHref()).toBe(`mailto:${PRIVACY_MAILBOX}`);
  });
});
