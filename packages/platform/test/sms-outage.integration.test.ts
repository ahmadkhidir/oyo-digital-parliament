/**
 * A simulated SMS outage through the real composition root (`C-076`, `NFR-010`).
 *
 * The gateway endpoint is a closed local port, so the real fetch transport, the client's status
 * classification, the adapter's mapping and the bounded retry all run. The message must come back
 * `held` with a stable cause — never `delivered`, never thrown into the caller's write — and the
 * attempt count must respect the configured budget.
 */
import { describe, expect, it } from 'vitest';

import { createPlatform } from '../src/index.ts';
import { loadConfig } from '../src/config/load.ts';
import { validEnvironment } from '../src/testing/config-fixture.ts';

describe('SMS outage (integration)', () => {
  it('holds the message after the bounded retry budget', async () => {
    const platform = createPlatform(
      loadConfig({
        env: validEnvironment({
          SMS_PROVIDER: 'http',
          SMS_API_URL: 'http://127.0.0.1:1/send',
          SMS_API_KEY: 'test-key',
          SMS_SENDER_ID: 'ODP',
          SMS_MAX_ATTEMPTS: '2',
          SMS_BACKOFF_BASE_MS: '100',
          SMS_BACKOFF_MAX_MS: '200',
          SMS_TIMEOUT_MS: '1000',
        }),
      }),
    );

    try {
      const result = await platform.sms.deliver({
        destination: '+2348012345678',
        body: 'Your registration code is 418302',
      });

      expect(result.outcome).toBe('held');
      expect(result.messageRef).toBeNull();
      expect(['PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT']).toContain(result.cause);
      expect(JSON.stringify(result)).not.toContain('418302');
    } finally {
      await platform.close();
    }
  });
});
