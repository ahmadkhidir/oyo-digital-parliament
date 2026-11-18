/**
 * The configuration schema's invariants (`NFR-024`).
 *
 * These assertions are about the declaration itself rather than one environment: a duplicate name, a
 * secret with a default or a required variable with a fallback would make a whole class of boot
 * failures unreachable.
 */
import { describe, expect, it } from 'vitest';

import {
  crossCheck,
  FEATURE_FLAGS,
  featureFlagVariable,
  MODEL_CAPABILITIES,
  modelVariableSuffix,
  parseVariable,
  VARIABLE_NAMES,
  VARIABLES,
} from './schema.ts';

describe('configuration schema', () => {
  it('declares each variable name once', () => {
    expect(new Set(VARIABLE_NAMES).size).toBe(VARIABLE_NAMES.length);
  });

  it('never gives a secret a default', () => {
    for (const spec of VARIABLES.filter((variable) => variable.secret)) {
      expect(spec.default).toBeUndefined();
    }
  });

  it('never gives a required variable a default', () => {
    for (const spec of VARIABLES.filter((variable) => variable.required)) {
      expect(spec.default).toBeUndefined();
    }
  });

  it('declares every capability and every flag', () => {
    for (const capability of MODEL_CAPABILITIES) {
      const suffix = modelVariableSuffix(capability);
      expect(VARIABLE_NAMES).toContain(`MODEL_VERSION_${suffix}`);
      expect(VARIABLE_NAMES).toContain(`MODEL_TIMEOUT_MS_${suffix}`);
      expect(VARIABLE_NAMES).toContain(`MODEL_COST_CEILING_MICROS_PER_THOUSAND_${suffix}`);
    }
    for (const flag of FEATURE_FLAGS) {
      expect(VARIABLE_NAMES).toContain(featureFlagVariable(flag));
    }
  });

  it('refuses whitespace and control characters in text', () => {
    const spec = VARIABLES.find((variable) => variable.name === 'S3_REGION');
    expect(spec).toBeDefined();
    if (spec === undefined) return;
    expect(parseVariable(spec, '   ').ok).toBe(false);
    expect(parseVariable(spec, 'us\u0000-east-1').ok).toBe(false);
    expect(parseVariable(spec, 'us-east-1').ok).toBe(true);
  });

  it('reports a cross-field problem without quoting a value', () => {
    const problems = crossCheck({
      SMS_BACKOFF_BASE_MS: '4000',
      SMS_BACKOFF_MAX_MS: '500',
    });
    expect(problems).toEqual(['SMS_BACKOFF_BASE_MS must not exceed SMS_BACKOFF_MAX_MS']);
    expect(problems.join(' ')).not.toContain('4000');
  });
});
