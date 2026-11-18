/**
 * Reverse-proxy admission tests (`C-091`: both probe paths are reachable only from the uptime
 * monitor, and a caller outside the allowlist is refused before the request reaches the app).
 *
 * The proxy itself is deployment configuration, so the test composes the policy with a minimal proxy
 * in front of the real handler: an admitted request reaches it, a refused one does not.
 */
import { describe, expect, it, vi } from 'vitest';
import { createProbeAccessPolicy } from './probe-access';

type Handler = () => Response;

/** A stand-in for the reverse-proxy rule: refuse before invoking the application handler. */
function withProbeProxy(allowlist: readonly string[], handler: Handler) {
  const policy = createProbeAccessPolicy(allowlist);
  return (peerAddress: string | null): Response => {
    if (!policy.allows(peerAddress)) {
      return new Response(null, { status: 403 });
    }
    return handler();
  };
}

describe('probe allowlist', () => {
  it('admits the monitor exact address and refuses an unknown caller', () => {
    const policy = createProbeAccessPolicy(['203.0.113.10']);
    expect(policy.allows('203.0.113.10')).toBe(true);
    expect(policy.allows('203.0.113.11')).toBe(false);
    expect(policy.allows(null)).toBe(false);
  });

  it('admits an IPv4 CIDR block without admitting its neighbours', () => {
    const policy = createProbeAccessPolicy(['198.51.100.0/24']);
    expect(policy.allows('198.51.100.1')).toBe(true);
    expect(policy.allows('198.51.100.255')).toBe(true);
    expect(policy.allows('198.51.101.1')).toBe(false);
  });

  it('normalises an IPv4-mapped IPv6 peer address', () => {
    const policy = createProbeAccessPolicy(['203.0.113.10']);
    expect(policy.allows('::ffff:203.0.113.10')).toBe(true);
  });

  it('refuses a caller outside the monitor allowlist before the probe handler runs', () => {
    const handler = vi.fn(() => new Response('{"status":"ready"}', { status: 200 }));
    const proxy = withProbeProxy(['203.0.113.10'], handler);

    const refused = proxy('192.0.2.44');
    expect(refused.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();

    const admitted = proxy('203.0.113.10');
    expect(admitted.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores a malformed allowlist entry rather than admitting everyone', () => {
    const policy = createProbeAccessPolicy(['not-an-address', '203.0.113.0/99']);
    expect(policy.allows('203.0.113.1')).toBe(false);
  });
});
