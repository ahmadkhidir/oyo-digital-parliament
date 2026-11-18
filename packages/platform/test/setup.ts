/**
 * Integration setup.
 *
 * Loads the repository's git-ignored `.env` into the process environment when it exists, without
 * overriding a value CI has already injected. A suite whose service is not configured skips itself;
 * nothing here reaches a shared environment.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));

if (existsSync(envFile)) {
  const values = parseEnv(readFileSync(envFile, 'utf8'));
  for (const [name, value] of Object.entries(values)) {
    if (process.env[name] === undefined || process.env[name] === '') {
      process.env[name] = value;
    }
  }
}
