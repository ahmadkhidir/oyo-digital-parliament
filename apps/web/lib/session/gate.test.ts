/**
 * The session module's transport tests: the gate's decisions (`NFR-026`) and the cookie names the
 * contracts print (`C-007`, `C-008`).
 *
 * The gate is the pure decision the Next.js proxy file wires; these tests prove which paths it
 * guards and what it never does with the cookie beyond checking its presence. The cookie-name
 * test pins the transport spelling against the name `C-008` and `C-092` print, because the domain
 * keeps its constant off the package root and a drifted literal would sign nobody out.
 */
import { describe, expect, it } from 'vitest';
import { MEMBER_GATE_COOKIE, memberGateDecision } from './gate';
import { MEMBER_SESSION_COOKIE } from './session-cookies';

describe('memberGateDecision (NFR-026)', () => {
  it('sends a visitor with no member cookie on a member-only path to sign-in, carrying the return path', () => {
    expect(memberGateDecision('/me', false)).toEqual({
      action: 'redirect',
      to: '/sign-in',
      returnTo: '/me',
    });
    expect(memberGateDecision('/submit', false)).toEqual({
      action: 'redirect',
      to: '/sign-in',
      returnTo: '/submit',
    });
    expect(memberGateDecision('/submit/draft/abc', false)).toEqual({
      action: 'redirect',
      to: '/sign-in',
      returnTo: '/submit/draft/abc',
    });
  });

  it('lets a presented cookie through, whatever it names — the pages authorise, not the gate', () => {
    expect(memberGateDecision('/me', true)).toEqual({ action: 'next' });
    expect(memberGateDecision('/submit', true)).toEqual({ action: 'next' });
  });

  it('never touches the public record', () => {
    expect(memberGateDecision('/', false)).toEqual({ action: 'next' });
    expect(memberGateDecision('/s/ODP-004821', false)).toEqual({ action: 'next' });
    expect(memberGateDecision('/commitments', false)).toEqual({ action: 'next' });
    expect(memberGateDecision('/sign-in', false)).toEqual({ action: 'next' });
    // A path that merely begins with the same letters is not a member-only path.
    expect(memberGateDecision('/metric', false)).toEqual({ action: 'next' });
  });
});

describe('the cookie names the contracts print (C-007, C-008)', () => {
  it('spells the member session namespace exactly as the contracts print it', () => {
    // `C-008` clears `odp_session`; `C-092` names the staff namespace beside it. A drifted
    // literal here would clear a cookie no session reads, and sign nobody out.
    expect(MEMBER_SESSION_COOKIE).toBe('odp_session');
    expect(MEMBER_GATE_COOKIE).toBe('odp_session');
    expect(MEMBER_SESSION_COOKIE).toBe(MEMBER_GATE_COOKIE);
  });
});
