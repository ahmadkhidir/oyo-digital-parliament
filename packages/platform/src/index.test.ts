/**
 * The composition root (`packages/platform` Structure: `src/index.ts`).
 *
 * One validated environment builds the bundle the app and the worker both use. These tests pin the
 * wiring that has no adapter of its own: an unconfigured SMS provider holds rather than delivers, the
 * flags come from the environment, the session capability is built from the same configuration, and
 * closing the bundle releases every connection it opened.
 */
import { describe, expect, it } from 'vitest';

import { createPlatform, type SessionCapability } from './index.ts';
import { loadConfig } from './config/load.ts';
import { smsEnvironment, validEnvironment } from './testing/config-fixture.ts';

describe('composition root', () => {
  it('builds every port from one validated environment', () => {
    const platform = createPlatform(loadConfig({ env: validEnvironment() }));

    expect(platform.config.storage.bucket).toBe('odp-test');
    expect(platform.featureFlags.assisted_intake).toBe(false);
    expect(platform.ids.next('sub')).toMatch(/^sub_[0-9A-Z]{26}$/);
    expect(platform.clock.now()).toBeInstanceOf(Date);
  });

  it('exposes the session capability and its per-bucket caps', async () => {
    const platform = createPlatform(loadConfig({ env: validEnvironment() }));
    const sessions: SessionCapability = platform.sessions;

    expect(typeof sessions.memberSessions.create).toBe('function');
    expect(typeof sessions.staffSessions.upgrade).toBe('function');
    expect(typeof sessions.codes.issue).toBe('function');
    expect(typeof sessions.ping).toBe('function');

    // A bucket with no configured cap is refused before the store is touched, so a call site cannot
    // ship ahead of its policy; a configured bucket reaches the cap check instead.
    await expect(
      sessions.rateLimits.consume({
        bucket: 'not_a_bucket',
        subject: { kind: 'member', value: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA' },
      }),
    ).rejects.toThrow(/no rate-limit cap/);
    await expect(
      sessions.rateLimits.consume({
        bucket: 'staff_sign_in',
        subject: { kind: 'address', value: '203.0.113.9' },
        fixedLimit: 0,
      }),
    ).rejects.toThrow(TypeError);
  });

  it('holds SMS messages when no gateway is configured', async () => {
    const platform = createPlatform(loadConfig({ env: validEnvironment() }));
    await expect(
      platform.sms.deliver({ destination: '+2348012345678', body: 'code' }),
    ).resolves.toEqual({
      outcome: 'held',
      messageRef: null,
      cause: 'PROVIDER_NOT_CONFIGURED',
    });
  });

  it('builds an HTTP gateway when one is configured', () => {
    const platform = createPlatform(loadConfig({ env: smsEnvironment() }));
    expect(platform.config.sms.provider).toBe('http');
    expect(platform.config.sms.senderId).toBe('ODP');
  });

  it('releases its connection on close', async () => {
    const platform = createPlatform(loadConfig({ env: validEnvironment() }));
    await expect(platform.close()).resolves.toBeUndefined();
  });
});
