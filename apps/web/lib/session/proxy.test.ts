/**
 * The deployed member gate (`NFR-026`, `screens.md` Record Header sign-in prompt).
 *
 * `gate.test.ts` proves the pure decision; this file proves the deployable wires it in the file Next
 * 16 reads - `proxy.ts` - rather than the deprecated `middleware.ts` the build warns about. Each
 * request below goes through the exported `proxy` function with the cookie the browser would
 * present.
 */
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../proxy';

/** Runs the gate over one request and returns the response Next would send. */
function run(path: string, cookie?: string): ReturnType<typeof proxy> {
  return proxy(
    new NextRequest(`https://odp.test${path}`, {
      headers: cookie === undefined ? {} : { cookie },
    }),
  );
}

describe('the member gate in proxy.ts (NFR-026)', () => {
  it('sends a visitor with no member cookie from a member-only path to sign-in', () => {
    const response = run('/me');

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://odp.test/sign-in?returnTo=%2Fme');
  });

  it('carries the return path of a nested member-only path', () => {
    const response = run('/submit/draft/abc');

    expect(response.headers.get('location')).toBe(
      'https://odp.test/sign-in?returnTo=%2Fsubmit%2Fdraft%2Fabc',
    );
  });

  it('lets a presented member cookie through to the render that authorises', () => {
    const response = run('/me', 'odp_session=sessiontoken0123456789abcdef');

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('never touches the public record or the session read itself', () => {
    for (const path of ['/', '/s/ODP-004821', '/commitments', '/sign-in', '/api/session']) {
      const response = run(path);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('x-middleware-next')).toBe('1');
    }
  });

  it('does not treat a path that merely shares a prefix as member-only', () => {
    const response = run('/metric');

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
