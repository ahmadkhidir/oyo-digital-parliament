/**
 * The composition root (`packages/platform` Structure: `src/index.ts`).
 *
 * One validated environment builds the bundle the app and the worker both use. These tests pin the
 * wiring that has no adapter of its own: an unconfigured SMS provider holds rather than delivers, the
 * flags come from the environment, and closing the bundle releases the Redis connection.
 */
import { describe, expect, it } from 'vitest';

import { createPlatform } from './index.ts';
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
