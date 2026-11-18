#!/usr/bin/env node
/**
 * Hand the validated local environment to every later step of a workflow job (F0-03).
 *
 * The browser jobs start the disposable service stack and then boot the built application, and the
 * two must read one environment: the same values `node scripts/dev/services.mjs up` started the
 * stack with. No `.env` is committed, Next.js only loads an environment file from the application's
 * own directory, and the worker reads none at all. So the values are written to `$GITHUB_ENV`, which
 * the runner exports to every later step, instead of to a file each tool has to be taught about.
 *
 * The values come from `infra/local/environment.mjs`, the same contract the local stack validates,
 * so CI cannot start services with one environment and boot the application with another. A missing
 * or malformed variable fails here, by name, before anything starts (`NFR-024`). The Build job passes
 * `--from .env.example` because it starts nothing and only needs the shape the application boots with.
 *
 * Nothing secret passes through: the values are the disposable Development placeholders. This script
 * therefore never prints a value, only how many it exported, so a local `.env` that does hold a real
 * credential cannot leak one into a job log.
 *
 * Usage:
 *
 *   node scripts/ci/export-env.mjs                      export the validated `.env`
 *   node scripts/ci/export-env.mjs --from .env.example  export a validated file that starts no stack
 */
import { appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENV_FILE_NAME, loadEnvironment } from '../../infra/local/environment.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The file to validate and export.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @returns {{ name: string, path: string }} The name as written, for the messages, and its absolute path.
 */
function sourceFrom(argv) {
  const index = argv.indexOf('--from');
  const name = index === -1 ? ENV_FILE_NAME : argv[index + 1];
  if (name === undefined || name.trim() === '') {
    console.error('environment: --from needs a file path');
    process.exit(1);
  }
  return { name, path: resolve(repoRoot, name) };
}

const source = sourceFrom(process.argv.slice(2));
const { values, problems, fileMissing } = loadEnvironment({ filePath: source.path });

if (fileMissing) {
  console.error(`environment: ${source.name} does not exist`);
  process.exit(1);
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`environment: ${problem}`);
  }
  console.error(`environment: ${source.name} did not validate; nothing was exported`);
  process.exit(1);
}

const names = Object.keys(values);

const githubEnv = process.env.GITHUB_ENV;
if (githubEnv === undefined || githubEnv === '') {
  // A local run has no runner to export into. Naming the variables proves the contract and keeps the
  // values out of the terminal, where they would end up in a scrollback or a pasted log.
  console.log(
    `environment: ${source.name} validates ${names.length} variable(s): ${names.join(', ')}`,
  );
  process.exit(0);
}

appendFileSync(githubEnv, `${names.map((name) => `${name}=${values[name]}`).join('\n')}\n`);
console.log(`environment: exported ${names.length} validated variable(s) from ${source.name}`);
