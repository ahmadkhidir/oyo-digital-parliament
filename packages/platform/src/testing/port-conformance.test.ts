/**
 * Port conformance (`packages/platform` Definition of Done: every adapter implements a domain port).
 *
 * These assignments are checked by the compiler, not at run time: if a port in
 * `packages/domain/src/ports/` and the adapter that claims it drift apart, `tsc` fails here before a
 * use case discovers it. The test file itself asserts the one thing the compiler cannot: that the
 * composition root returns each of them.
 */
import { describe, expect, it } from 'vitest';

import type { ClockPort } from '../../../domain/src/ports/clock.ts';
import type { CacheInvalidationPort } from '../../../domain/src/ports/cache.ts';
import type { SmsDeliveryPort } from '../../../domain/src/ports/notifications.ts';
import type { ObjectStoragePort } from '../../../domain/src/ports/object-store.ts';
import type { IdentifierPort } from '../../../domain/src/ports/identifiers.ts';
import { createPlatform } from '../index.ts';
import { loadConfig } from '../config/load.ts';
import { validEnvironment } from './config-fixture.ts';

describe('port conformance', () => {
  it('returns a bundle whose members satisfy the domain ports', () => {
    const platform = createPlatform(loadConfig({ env: validEnvironment() }));

    const clock: ClockPort = platform.clock;
    const ids: IdentifierPort = platform.ids;
    const sms: SmsDeliveryPort = platform.sms;
    const storage: ObjectStoragePort = platform.storage;
    const invalidation: CacheInvalidationPort = platform.cacheInvalidation;

    expect(typeof clock.now).toBe('function');
    expect(typeof ids.next).toBe('function');
    expect(typeof sms.deliver).toBe('function');
    expect(typeof storage.signedReadUrl).toBe('function');
    expect(typeof invalidation.invalidate).toBe('function');
  });
});
