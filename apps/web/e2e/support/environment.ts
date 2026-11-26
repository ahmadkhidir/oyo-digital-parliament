/**
 * The environment the browser flows boot the deployable with (`apps/web/AGENTS.md` Checks,
 * `NFR-024`).
 *
 * The flows run against the built application, so the server they start must read the same
 * validated values a developer's stack was started with. Those values arrive from `process.env`
 * (CI exports them with `scripts/ci/export-env.mjs`) or, on a developer machine, from the
 * git-ignored root `.env`; the process wins, exactly as `packages/platform`'s loader resolves it.
 *
 * Three overrides are the flows' own and exist for one reason each:
 *
 * - `SMS_PROVIDER=http` points the SMS transport at the capture gateway in `sms-gateway.ts`, because
 *   the one-time code exists only in the delivered message (`C-076`). Without a capture gateway the
 *   registration and sign-in flows could not be driven end to end, and a test that peeled the code
 *   out of Redis would be testing a store that deliberately holds only a digest.
 * - The two `STAFF_*_INITIAL_PASSWORD` secrets are the disposable passwords the fixture reset gives
 *   the seeded staff credentials (`packages/db/src/seeds/staff.ts`). They are local placeholders,
 *   never a real credential, and they live in this file for the same reason a test fixture does.
 * - `NODE_ENV=production` is what `next start` requires of the build it serves.
 */
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

/** The repository root, from this file's location (`apps/web/e2e/support`). */
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** The deployable's directory. */
export const webRoot = resolve(repoRoot, 'apps/web');

/** The port the built application serves on. */
export const APP_PORT = 3000;

/**
 * The origin the flows browse.
 *
 * `localhost` rather than `127.0.0.1`: the session cookie is `Secure` (`NFR-026`), and a browser
 * treats `localhost` as a trustworthy origin while a bare loopback address is not always granted
 * the same treatment.
 */
export const APP_ORIGIN = `http://localhost:${APP_PORT}`;

/** The loopback port the SMS capture gateway listens on; never published anywhere else. */
export const SMS_GATEWAY_PORT = 4319;

/** The gateway's origin, reached from the flows' Node context rather than from a page. */
export const SMS_GATEWAY_ORIGIN = `http://127.0.0.1:${SMS_GATEWAY_PORT}`;

/** The disposable staff passwords the fixture reset seeds. Local placeholders only, per `NFR-024`. */
export const STAFF_PASSWORDS = {
  operator: 'odp-e2e-operator-password',
  response: 'odp-e2e-response-password',
} as const;

/**
 * Read the git-ignored root `.env`, if it exists.
 *
 * `parseEnv` is Node's own dotenv parser, so the file is read exactly as the platform's loader
 * reads it and a quoted or continued value cannot be misread here.
 *
 * @returns The file's non-empty string values, keyed by variable name.
 */
function readEnvFile(): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(resolve(repoRoot, '.env'), 'utf8');
  } catch {
    return {};
  }
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(parseEnv(text))) {
    if (typeof value === 'string' && value !== '') values[name] = value;
  }
  return values;
}

/**
 * The validated stack environment: the `.env` file with the process environment layered over it.
 *
 * @returns Every variable the stack and the deployable share.
 * @throws Error when `DATABASE_URL` is absent, because the fixture reset and the application both
 *   need it and a silent default would point at a database nobody meant.
 */
export function stackEnvironment(): Record<string, string> {
  const values: Record<string, string> = { ...readEnvFile() };
  for (const [name, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && value !== '') values[name] = value;
  }
  if (values['DATABASE_URL'] === undefined) {
    throw new Error(
      'e2e: DATABASE_URL is not set. Start the disposable stack with "node scripts/dev/services.mjs up", or export the environment as CI does.',
    );
  }
  return values;
}

/**
 * The environment the built application boots with.
 *
 * @returns The stack environment plus the flows' own overrides.
 */
export function appEnvironment(): Record<string, string> {
  return {
    ...stackEnvironment(),
    NODE_ENV: 'production',
    SMS_PROVIDER: 'http',
    SMS_API_URL: `${SMS_GATEWAY_ORIGIN}/send`,
    SMS_API_KEY: 'test',
    SMS_SENDER_ID: 'ODP',
    SMS_TIMEOUT_MS: '3000',
    SMS_MAX_ATTEMPTS: '1',
    STAFF_OPERATOR_INITIAL_PASSWORD: STAFF_PASSWORDS.operator,
    STAFF_RESPONSE_STAFF_INITIAL_PASSWORD: STAFF_PASSWORDS.response,
  };
}

/**
 * A unique source address for this run.
 *
 * The registration boundary caps attempts per source address (`NFR-027`, `C-002`), and every
 * browser in one run shares an address unless the flows present one. A fresh address per run keeps
 * a re-run honest without reaching into Redis to clear a counter keyed by a digest.
 *
 * @returns A private-range address a real deployment would never route.
 */
export function runAddress(): string {
  return `10.${randomInt(1, 254)}.${randomInt(1, 254)}.${randomInt(1, 254)}`;
}

/**
 * A Nigerian mobile number no earlier run has registered (`FEAT-001`: a number belongs to at most
 * one account).
 *
 * @returns The number in the local form a resident would type.
 */
export function uniqueTelephone(): string {
  return `080${randomInt(0, 100_000_000).toString().padStart(8, '0')}`;
}

/**
 * The normalised form of a telephone number, as the domain stores it (`TELEPHONE_PATTERN`).
 *
 * @param local - The local form, for example `08031234567`.
 * @returns The `+234` form the pending registration and the SMS message carry.
 */
export function normalizedTelephone(local: string): string {
  return `+234${local.replace(/^0/, '')}`;
}
