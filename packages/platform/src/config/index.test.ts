/**
 * The one-load guard (`packages/platform/AGENTS.md` Structure: `src/config/index.ts`).
 *
 * A process must parse its environment once: a second call returns the object the adapters were
 * built from, so a value cannot change under a running process. The module is re-imported here
 * because the guard lives at module scope.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { validEnvironment } from '../testing/config-fixture.ts';

describe('getConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('loads once and returns the same frozen configuration', async () => {
    for (const [name, value] of Object.entries(validEnvironment())) vi.stubEnv(name, value);

    vi.resetModules();
    const { getConfig } = await import('./index.ts');

    const first = getConfig();
    const second = getConfig();

    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.sms.provider).toBe('none');
  });
});
