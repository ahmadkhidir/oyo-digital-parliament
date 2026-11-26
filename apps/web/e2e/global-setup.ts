/**
 * The browser flows' fixture setup: the disposable stack, a deterministic staff fixture and the
 * SMS capture gateway (`C-055` to `C-057`, `C-066`, `C-067`, `C-092`, `C-076`).
 *
 * Four steps run once before any flow:
 *
 * 1. **The capture gateway** starts on loopback. The application is configured to post one-time
 *    codes to it, which is how a flow learns the code a resident would receive (`C-002`, `C-005`).
 * 2. **The migrations** are applied. They are idempotent, so a developer's stack that is already
 *    current costs one cheap run and a clean CI database gets its schema.
 * 3. **The staff fixture** is reset and reseeded. The seeded operator and response-staff credentials
 *    (`packages/db/src/seeds/staff.ts`) are the only staff accounts that exist, and a `C-092`
 *    second factor cannot be recomputed after enrolment. So the two credentials and their factor
 *    state are cleared and `db:seed` writes fresh ones with the passwords this suite knows.
 * 4. **The suite's own residents** from earlier runs are removed, with their reviews, consents and
 *    requests. Every resident these flows create carries the fixture's synthetic full name, and the
 *    Residences work type lists every member whose ward is resolved and whose residence is not
 *    accepted — oldest registration first, twenty to a page. Without this step a re-run would push
 *    its own member past the first page and the residence flow could not see its case. The append-only
 *    audit log keeps its rows; nothing a person created is named here.
 *
 * The standalone bundle's missing `.next/static` and `public/` are completed by the start command
 * itself (`support/start-app.mjs`), so the server cannot answer before its assets exist.
 *
 * The two destructive steps touch only the seeded staff accounts and the suite's own synthetic
 * residents, and they run against the disposable local stack the repository documents as resettable
 * (`architecture.md` Environments).
 *
 * Every failure here stops the run before a flow executes, so a broken fixture is never reported as
 * a product defect.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
  repoRoot,
  SMS_GATEWAY_PORT,
  STAFF_PASSWORDS,
  stackEnvironment,
} from './support/environment';
import { setSmsGateway } from './support/gateway-state';
import { startSmsGateway } from './support/sms-gateway';

/** The seeded identifiers `packages/db/src/seeds/staff.ts` owns; nothing else is touched. */
const SEEDED_STAFF_IDS = [
  'stf_01J9Z0000000000000000OPER',
  'stf_01J9Z0000000000000000RESP',
] as const;

/**
 * Run one command and fail the setup when it exits non-zero.
 *
 * @param command - The executable. On Windows `pnpm` is a `.cmd` shim, so only that command runs
 *   through the shell; the Node binary's path contains a space and must be spawned directly.
 * @param args - Its arguments.
 * @param cwd - Where it runs; resolution of a workspace binary depends on it.
 * @param env - The complete environment the command sees.
 */
function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env: Record<string, string>,
): void {
  const result = spawnSync(command, [...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: process.platform === 'win32' && command === 'pnpm',
    windowsHide: true,
  });
  if (result.error !== undefined) {
    throw new Error(`e2e setup: could not run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`e2e setup: ${command} ${args.join(' ')} exited with ${String(result.status)}`);
  }
}

/**
 * Clear the two seeded staff credentials and their enrolled-factor flag, and remove the suite's own
 * residents from earlier runs together with the rows that reference them.
 *
 * The staff reset is what makes `C-092`'s one-time enrolment repeatable. The resident cleanup keeps
 * the Residences work type short enough for a flow to see its own case: that list holds every member
 * whose ward is resolved and whose residence is not accepted, oldest first, and a re-run would
 * otherwise push its member past the first page. The suite's residents are identified by the
 * synthetic full names its helper writes; the append-only audit log keeps its rows.
 *
 * The children are deleted before the member because every foreign key into `member` is
 * `NO ACTION`. Run through the data area's own `pg` dependency rather than a new one in this area:
 * the script executes with `packages/db` as its working directory, where that driver resolves.
 *
 * @param env - The validated stack environment, which carries `DATABASE_URL`.
 */
function resetStaffFixture(env: Record<string, string>): void {
  const ids = SEEDED_STAFF_IDS.map((id) => `'${id}'`).join(', ');
  const residents =
    "select id from member where full_name in ('E2E Adebayo Ogunlana', 'Adebayo Ogunlana')";
  const script = `
const pg = await import('pg');
const client = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("delete from staff_credential where staff_user_id in (${ids})");
  await client.query(
    "update staff_user set second_factor_enrolled = false where id in (${ids})",
  );
  await client.query("delete from residence_review where member_id in (${residents})");
  await client.query("delete from consent where member_id in (${residents})");
  await client.query("delete from data_request where member_id in (${residents})");
  await client.query("delete from ward_description_review where member_id in (${residents})");
  await client.query("delete from backing where member_id in (${residents})");
  await client.query("delete from comment where author_id in (${residents})");
  await client.query("delete from submission where author_id in (${residents})");
  await client.query(
    "delete from ward_description_review where description like 'zzodp%' or description like 'qzxv%'",
  );
  await client.query("delete from member where id in (${residents})");
} finally {
  await client.end();
}
`;
  run(
    process.execPath,
    ['--input-type=module', '--eval', script],
    resolve(repoRoot, 'packages/db'),
    env,
  );
}

/** Apply the migrations, reset the staff fixture and seed the deterministic reference data. */
export default async function globalSetup(): Promise<void> {
  const gateway = await startSmsGateway(SMS_GATEWAY_PORT);
  setSmsGateway(gateway);

  const env = {
    ...stackEnvironment(),
    STAFF_OPERATOR_INITIAL_PASSWORD: STAFF_PASSWORDS.operator,
    STAFF_RESPONSE_STAFF_INITIAL_PASSWORD: STAFF_PASSWORDS.response,
  };

  run('pnpm', ['--filter', '@odp/db', 'run', 'db:migrate'], repoRoot, env);
  resetStaffFixture(env);
  run('pnpm', ['--filter', '@odp/db', 'run', 'db:seed'], repoRoot, env);
}
