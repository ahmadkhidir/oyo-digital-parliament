/**
 * Pinned inference configuration (`C-078`, `release.md`).
 */
import { describe, expect, it } from 'vitest';

import { defineInferenceConfig, InferenceConfigurationError } from '../index.ts';

const pins = {
  similar_submission: { version: null, timeoutMs: 1500, costCeilingMicrosPerThousand: 50000 },
  ward_candidate: {
    version: 'odp-ward-test-1',
    timeoutMs: 1500,
    costCeilingMicrosPerThousand: 50000,
  },
  moderation_routing: { version: null, timeoutMs: 1500, costCeilingMicrosPerThousand: 100000 },
  budget_line_extraction: { version: null, timeoutMs: 1500, costCeilingMicrosPerThousand: 500000 },
} as const;

describe('defineInferenceConfig', () => {
  it('leaves every capability off when no flag is supplied', () => {
    const config = defineInferenceConfig({ provider: 'none', capabilities: pins });
    for (const capability of Object.values(config.capabilities)) {
      expect(capability.flagEnabled).toBe(false);
    }
    expect(config.provider).toBe('none');
    expect(config.apiKey).toBeNull();
  });

  it('records the labelled-set pointer without a caller supplying one', () => {
    const config = defineInferenceConfig({ provider: 'none', capabilities: pins });
    expect(config.capabilities.ward_candidate.labelledSetPath).toBe(
      'eval/ward_candidate/labelled-set.json',
    );
  });

  it('requires a pinned version before an enabled capability can run', () => {
    expect(() =>
      defineInferenceConfig({
        provider: 'none',
        capabilities: {
          ...pins,
          ward_candidate: { ...pins.ward_candidate, version: null },
        },
        featureFlags: { ward_candidate_suggestions: true },
      }),
    ).toThrow(InferenceConfigurationError);
  });

  it('requires an endpoint, a credential and a region when a provider is configured', () => {
    expect(() => defineInferenceConfig({ provider: 'http', capabilities: pins })).toThrow(
      /apiUrl is required[\s\S]*apiKey is required[\s\S]*region is required/,
    );
  });

  it('refuses a timeout or ceiling outside the contract', () => {
    expect(() =>
      defineInferenceConfig({
        provider: 'none',
        capabilities: {
          ...pins,
          ward_candidate: { ...pins.ward_candidate, timeoutMs: 99 },
        },
      }),
    ).toThrow(/timeoutMs/);
    expect(() =>
      defineInferenceConfig({
        provider: 'none',
        capabilities: {
          ...pins,
          ward_candidate: { ...pins.ward_candidate, costCeilingMicrosPerThousand: 0 },
        },
      }),
    ).toThrow(/costCeiling/);
  });

  it('freezes the result so a caller cannot change a pin at runtime', () => {
    const config = defineInferenceConfig({ provider: 'none', capabilities: pins });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.capabilities)).toBe(true);
    expect(Object.isFrozen(config.capabilities.ward_candidate)).toBe(true);
  });

  it('never repeats a credential in a configuration failure', () => {
    let message = '';
    try {
      defineInferenceConfig({
        provider: 'http',
        apiUrl: '',
        apiKey: 'do-not-print-me',
        region: '',
        capabilities: pins,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('apiUrl is required');
    expect(message).not.toContain('do-not-print-me');
  });
});
