/**
 * The one-egress boundary (`packages/inference/AGENTS.md` Discipline).
 *
 * A grep-level test on purpose: the real guarantee is that no module outside `src/adapters/` can
 * import a provider SDK, and that the package surface exposes no adapter factory a caller could use
 * to build a second route to a provider.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE = join(import.meta.dirname, '..', 'src');
const PROVIDER_MODULES = [
  'openai',
  '@anthropic-ai/',
  '@google/',
  '@mistralai/',
  'cohere-ai',
  'groq-sdk',
  'ollama',
  'axios',
  'node-fetch',
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('one egress', () => {
  it('imports a provider SDK only inside src/adapters', () => {
    const offenders = sourceFiles(SOURCE)
      .filter((path) => !path.includes('adapters'))
      .filter((path) => {
        const text = readFileSync(path, 'utf8');
        return PROVIDER_MODULES.some(
          (module) => text.includes(`from '${module}`) || text.includes(`from "${module}`),
        );
      });
    expect(offenders).toEqual([]);
  });

  it('exposes no adapter factory from the package surface', () => {
    const surface = readFileSync(join(SOURCE, 'index.ts'), 'utf8');
    expect(surface).not.toContain('createHttpModelAdapter');
    expect(surface).not.toContain('noneModelAdapter');
  });
});
