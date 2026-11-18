/**
 * Boot-time configuration tests (`NFR-024`, `packages/platform/AGENTS.md` Checks "Boot failure
 * test").
 *
 * Three properties matter more than the happy path: a missing value fails before anything listens,
 * the message names the variable and never its value, and the frozen object cannot leak a secret
 * through serialisation or inspection.
 */
import { inspect } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ConfigurationError, loadConfig } from './load.ts';
import { MODEL_CAPABILITIES, parseVariable, VARIABLES } from './schema.ts';
import { smsEnvironment, validEnvironment } from '../testing/config-fixture.ts';

describe('loadConfig', () => {
  it('parses a valid environment and applies the documented defaults', () => {
    const config = loadConfig({ env: validEnvironment() });

    expect(config.databaseUrl).toBe(validEnvironment().DATABASE_URL);
    expect(config.sms.provider).toBe('none');
    expect(config.sms.apiKey).toBeNull();
    expect(config.sms.maxAttempts).toBe(3);
    expect(config.model.provider).toBe('none');
    expect(config.storage.forcePathStyle).toBe(true);
    expect(config.storage.signedUrlTtlSeconds).toBe(900);
    expect(config.cache.publicPageSeconds).toBe(60);
    for (const capability of MODEL_CAPABILITIES) {
      expect(config.model.capabilities[capability].version).toBeNull();
      expect(config.model.capabilities[capability].timeoutMs).toBe(1500);
    }
    expect(config.featureFlags.assisted_intake).toBe(false);
    expect(config.featureFlags.session_reservations).toBe(false);
  });

  it('freezes the configuration and its slices', () => {
    const config = loadConfig({ env: validEnvironment() });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.storage)).toBe(true);
    expect(Object.isFrozen(config.sms)).toBe(true);
    expect(Object.isFrozen(config.model.capabilities)).toBe(true);
    expect(Object.isFrozen(config.featureFlags)).toBe(true);
  });

  it('never prints a secret through JSON or inspection', () => {
    const config = loadConfig({ env: validEnvironment() });
    const serialised = JSON.stringify(config);
    const inspected = inspect(config);

    expect(serialised).not.toContain('test-secret-key');
    expect(serialised).not.toContain('odp_test_password');
    expect(inspected).not.toContain('test-secret-key');
    expect(inspected).not.toContain('odp_test_password');
    expect(serialised).toContain('[redacted]');
  });

  it('fails the boot when a required value is absent, naming it and nothing else', () => {
    const env = validEnvironment();
    delete env.DATABASE_URL;

    let error: unknown;
    try {
      loadConfig({ env });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ConfigurationError);
    const message = (error as ConfigurationError).message;
    expect(message).toContain('DATABASE_URL is not set');
    expect(message).not.toContain('odp_test_password');
  });

  it('fails on an unknown enum value without echoing it', () => {
    let error: unknown;
    try {
      loadConfig({ env: validEnvironment({ SMS_PROVIDER: 'carrier-pigeon' }) });
    } catch (caught) {
      error = caught;
    }

    const message = (error as ConfigurationError).message;
    expect(message).toContain('SMS_PROVIDER must be one of none, http');
    expect(message).not.toContain('carrier-pigeon');
  });

  it('fails on an out-of-range number without echoing it', () => {
    let error: unknown;
    try {
      loadConfig({ env: validEnvironment({ S3_SIGNED_URL_TTL_SECONDS: '5' }) });
    } catch (caught) {
      error = caught;
    }

    const message = (error as ConfigurationError).message;
    expect(message).toContain('S3_SIGNED_URL_TTL_SECONDS must be between 60 and 604800');
    expect(message).not.toContain('=5');
  });

  it('requires a provider credential only when that provider is selected', () => {
    const withoutKey = smsEnvironment();
    delete withoutKey.SMS_API_KEY;

    expect(() => loadConfig({ env: withoutKey })).toThrow(/SMS_API_KEY is not set/);
    expect(() => loadConfig({ env: validEnvironment() })).not.toThrow();
  });

  it('enforces cross-field rules', () => {
    expect(() =>
      loadConfig({
        env: validEnvironment({ SMS_BACKOFF_BASE_MS: '4000', SMS_BACKOFF_MAX_MS: '500' }),
      }),
    ).toThrow(/SMS_BACKOFF_BASE_MS must not exceed SMS_BACKOFF_MAX_MS/);
  });

  it('reads a dotenv file, with the process environment winning', () => {
    const directory = mkdtempSync(join(tmpdir(), 'odp-config-'));
    const file = join(directory, '.env');
    writeFileSync(file, 'S3_BUCKET=from-file\nSMS_PROVIDER=none\n', 'utf8');

    try {
      const config = loadConfig({
        envFile: file,
        env: validEnvironment({ S3_BUCKET: 'from-process' }),
      });
      expect(config.storage.bucket).toBe('from-process');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('declares only defaults that satisfy their own declaration', () => {
    for (const spec of VARIABLES) {
      if (spec.default === undefined) continue;
      expect(parseVariable(spec, spec.default).ok).toBe(true);
    }
  });
});
