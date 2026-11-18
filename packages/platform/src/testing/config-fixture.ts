/**
 * A valid configuration fixture.
 *
 * Every value is a disposable placeholder; no real credential appears here (`NFR-024`). Only the
 * variables without a default are present, so a test proves the documented defaults as well as the
 * required values. A test that wants to break one variable passes an override.
 *
 * @module testing/config-fixture
 */
/** A complete set of required settings for `loadConfig`. */
export function validEnvironment(
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return {
    DATABASE_URL: 'postgresql://odp_test:odp_test_password@127.0.0.1:5433/odp_test',
    REDIS_URL: 'redis://127.0.0.1:6380',
    S3_ENDPOINT: 'http://127.0.0.1:9100',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'odp-test',
    S3_ACCESS_KEY_ID: 'test-access-key',
    S3_SECRET_ACCESS_KEY: 'test-secret-key',
    S3_FORCE_PATH_STYLE: 'true',
    ...overrides,
  };
}

/** An SMS-enabled environment, for a test of the gateway adapter wiring. */
export function smsEnvironment(
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return validEnvironment({
    SMS_PROVIDER: 'http',
    SMS_API_URL: 'https://sms.example.test/send',
    SMS_API_KEY: 'test-sms-key',
    SMS_SENDER_ID: 'ODP',
    ...overrides,
  });
}
