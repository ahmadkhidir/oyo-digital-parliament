#!/usr/bin/env node
/**
 * Validate or render the local development environment.
 *
 *   node scripts/dev/env.mjs check            validate `.env` and name every missing or malformed variable
 *   node scripts/dev/env.mjs check --no-file  validate the process environment only (CI)
 *   node scripts/dev/env.mjs render           write `.env.example` from the contract
 *   node scripts/dev/env.mjs render --check   fail when the committed `.env.example` is out of date
 *
 * The contract lives in `infra/local/environment.mjs`; this file is only the command line around it.
 * No value is ever printed, including a value that failed validation, because several of the
 * variables are classified as secrets (NFR-024).
 *
 * Exit codes: 0 when the environment is valid (or the file is in sync), 1 when it is not, 2 for a
 * usage error.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENV_FILE_NAME,
  EXAMPLE_FILE_NAME,
  loadEnvironment,
  renderExample,
  validateEnvironment,
} from "../../infra/local/environment.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const examplePath = resolve(repoRoot, EXAMPLE_FILE_NAME);

const USAGE = `Usage:
  node scripts/dev/env.mjs check [--env-file <path>] [--no-file]
  node scripts/dev/env.mjs render [--check]

  check    Validate the environment and name every missing or malformed variable.
           --env-file <path>  read another file instead of ${ENV_FILE_NAME}
           --no-file          validate the process environment only
  render   Write ${EXAMPLE_FILE_NAME} from infra/local/environment.mjs.
           --check            compare instead of writing; exit 1 when out of date

Exit codes: 0 ok, 1 invalid or out of date, 2 usage.`;

/**
 * Print a usage error and stop.
 *
 * @param {string} message - What went wrong.
 * @returns {number} The exit code to use.
 */
function usageError(message) {
  console.error(`env: ${message}`);
  console.error(USAGE);
  return 2;
}

/**
 * `check`: validate the environment and print a value-free summary.
 *
 * @param {string[]} argv - Arguments after `check`.
 * @returns {number} The exit code.
 */
function check(argv) {
  let envFileName = ENV_FILE_NAME;
  let useFile = true;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--no-file") {
      useFile = false;
    } else if (argument === "--env-file") {
      const path = argv[index + 1];
      if (path === undefined || path.startsWith("-")) {
        return usageError("--env-file needs a path");
      }
      envFileName = path;
      index += 1;
    } else {
      return usageError(`unknown option "${argument}"`);
    }
  }

  const result = useFile
    ? loadEnvironment({ filePath: resolve(repoRoot, envFileName) })
    : { ...validateEnvironment({ fileValues: {} }), fileMissing: false };

  if (result.fileMissing) {
    console.error(
      `env: ${envFileName} does not exist; run "node scripts/dev/services.mjs up", which copies ${EXAMPLE_FILE_NAME}, or copy it yourself`,
    );
  }
  for (const problem of result.problems) {
    console.error(`env: ${problem}`);
  }
  if (result.problems.length > 0) {
    return 1;
  }

  const source = useFile ? envFileName : "the process environment";
  console.log(`env: ok - ${Object.keys(result.values).length} variables validated from ${source}`);
  return 0;
}

/**
 * `render`: write `.env.example`, or verify the committed file matches the contract.
 *
 * @param {string[]} argv - Arguments after `render`.
 * @returns {number} The exit code.
 */
function render(argv) {
  const verifyOnly = argv.includes("--check");
  const unknown = argv.filter((argument) => argument !== "--check");
  if (unknown.length > 0) {
    return usageError(`unknown option "${unknown[0]}"`);
  }

  const rendered = renderExample();

  if (verifyOnly) {
    if (!existsSync(examplePath) || readFileSync(examplePath, "utf8") !== rendered) {
      console.error(
        `env: ${EXAMPLE_FILE_NAME} is out of date; run "node scripts/dev/env.mjs render"`,
      );
      return 1;
    }
    console.log(`env: ${EXAMPLE_FILE_NAME} matches the contract`);
    return 0;
  }

  writeFileSync(examplePath, rendered);
  console.log(`env: wrote ${EXAMPLE_FILE_NAME}`);
  return 0;
}

/**
 * Entry point.
 *
 * @param {string[]} argv - The arguments after the script name.
 * @returns {number} The exit code.
 */
function main(argv) {
  const [command, ...rest] = argv;

  switch (command) {
    case "check":
      return check(rest);
    case "render":
      return render(rest);
    case undefined:
    case "-h":
    case "--help":
    case "help":
      console.log(USAGE);
      return 0;
    default:
      return usageError(`unknown command "${command}"`);
  }
}

process.exitCode = main(process.argv.slice(2));
