/**
 * The session cookie contract (`NFR-026`, `C-008`, `C-092`).
 *
 * The cases that matter are the ones a second writer could get wrong: an attribute dropped from one
 * namespace, a token that smuggles attributes, and a cleared cookie that leaves the browser holding
 * the old value.
 */
import { describe, expect, it } from 'vitest';

import {
  SESSION_COOKIE_ATTRIBUTES,
  SESSION_COOKIE_NAMES,
  clearedSessionCookie,
  presentSessionCookie,
  readSessionCookie,
} from './session.ts';

const TOKEN = '9Wq3m0Zk1yV8sR2tB6cN4fH7jL5pX0aD3eG1kM9uQ2w';

describe('session cookies', () => {
  it('names the two namespaces apart', () => {
    expect(SESSION_COOKIE_NAMES.member).toBe('odp_session');
    expect(SESSION_COOKIE_NAMES.staff).toBe('odp_staff_session');
  });

  it('writes HttpOnly, Secure, SameSite=Lax, Path=/ on a live session', () => {
    const cookie = presentSessionCookie({ namespace: 'staff', token: TOKEN, maxAgeSeconds: 1800 });

    expect(cookie.name).toBe('odp_staff_session');
    expect(cookie.value).toBe(TOKEN);
    expect(cookie.header).toContain('Path=/');
    expect(cookie.header).toContain('HttpOnly');
    expect(cookie.header).toContain('Secure');
    expect(cookie.header).toContain('SameSite=Lax');
    expect(cookie.header).toContain('Max-Age=1800');
    expect(SESSION_COOKIE_ATTRIBUTES.httpOnly).toBe(true);
  });

  it('carries the same attributes when clearing, with Max-Age=0', () => {
    const cookie = clearedSessionCookie('member');

    expect(cookie.value).toBe('');
    expect(cookie.header).toBe('odp_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  });

  it('refuses a token that could append cookie attributes', () => {
    expect(() =>
      presentSessionCookie({
        namespace: 'member',
        token: `${TOKEN}; Domain=evil.test`,
        maxAgeSeconds: 60,
      }),
    ).toThrow(TypeError);
    expect(() =>
      presentSessionCookie({ namespace: 'member', token: 'short', maxAgeSeconds: 60 }),
    ).toThrow(TypeError);
  });

  it('refuses a session cookie without a lifetime', () => {
    expect(() =>
      presentSessionCookie({ namespace: 'member', token: TOKEN, maxAgeSeconds: 0 }),
    ).toThrow(TypeError);
  });

  it('reads only the named cookie out of a crowded header', () => {
    const header = `theme=dark; odp_session=${TOKEN}; odp_staff_session=otSt4ff0000000000000000000000000000`;

    expect(readSessionCookie(header, 'member')).toBe(TOKEN);
    expect(readSessionCookie(header, 'staff')).toBe('otSt4ff0000000000000000000000000000');
  });

  it('treats an absent, empty or unrelated cookie as no session', () => {
    expect(readSessionCookie(undefined, 'member')).toBeNull();
    expect(readSessionCookie('', 'member')).toBeNull();
    expect(readSessionCookie('odp_session=', 'member')).toBeNull();
    expect(readSessionCookie('other=value', 'member')).toBeNull();
    // A staff cookie never answers a member read, even when its name is a prefix of one.
    expect(readSessionCookie(`odp_staff_session=${TOKEN}`, 'member')).toBeNull();
  });
});
