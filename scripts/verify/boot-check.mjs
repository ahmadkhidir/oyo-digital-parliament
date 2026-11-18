#!/usr/bin/env node
/**
 * Phase 0 boot check (F0-14 gate, `C-091`, `NFR-010`).
 *
 * A green unit suite is not proof the deployable starts. This check builds nothing: it starts the
 * already-built web application (`apps/web/.next`) and the worker entry point against the same
 * disposable PostgreSQL and Redis stack the suites use, then proves both processes serve the
 * contract's probes before it stops them. It is the gate's "boots the app and worker" evidence.
 *
 *   node scripts/verify/boot-check.mjs
 *
 * Prerequisites, in the order a clean clone meets them:
 *
 *   1. `node scripts/dev/services.mjs up`   disposable PostgreSQL, Redis and object storage
 *   2. `pnpm build`                         the deployable the check starts
 *   3. this script                          app and worker, both started and probed
 *
 * The run is read-only: no migration, no seed and no write reaches the record. The probe bodies are
 * asserted byte for byte because `C-091` fixes them; a passing HTTP status with a different body is a
 * contract failure, not a boot success.
 *
 * Exit codes: 0 when both processes answer every probe, 1 on the first failed check, 2 when the
 * environment or a prerequisite is missing. Nothing sensitive is printed: the check never echoes an
 * environment value, a connection string or a child's full environment.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENV_FILE_NAME, loadEnvironment } from '../../infra/local/environment.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = resolve(repoRoot, 'apps/web');
const workerRoot = resolve(repoRoot, 'services/worker');

/** The exact probe bodies `C-091` freezes. Do not format them. */
const PROBE_BODIES = {
  alive: '{"status":"alive"}',
  ready: '{"status":"ready"}',
};

/** How long a process may take to answer its first probe. Build output is ready before this runs. */
const BOOT_TIMEOUT_MS = 120_000;

/** Grace period between `SIGTERM` and a forced process-tree kill. */
const SHUTDOWN_GRACE_MS = 10_000;

/** A check failure that should end the run. */
class CheckFailure extends Error {}

/**
 * Reserve a free TCP port on loopback and release it for the child to bind.
 *
 * @returns {Promise<number>} The port number.
 */
async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('could not reserve a loopback port'));
        return;
      }
      const { port } = address;
      server.close(() => resolvePort(port));
    });
  });
}

/**
 * Read the validated environment the application boots with.
 *
 * `loadEnvironment` merges `process.env` over the git-ignored `.env` exactly as the application does,
 * so this check cannot start a process with values the schema would reject. Problems are named, never
 * values.
 *
 * @returns {Record<string, string>} The validated values.
 */
function loadVerifiedEnvironment() {
  const result = loadEnvironment({ filePath: resolve(repoRoot, ENV_FILE_NAME) });
  if (result.problems.length > 0) {
    for (const problem of result.problems) console.error(`boot-check: ${problem}`);
    console.error(
      `boot-check: run "node scripts/dev/env.mjs check" and fix the environment before booting`,
    );
    process.exitCode = 2;
    throw new CheckFailure('environment invalid');
  }
  return result.values;
}

/**
 * Prove a disposable dependency answers on the host and port its URL names.
 *
 * Redis is not on the boot path — `/readyz` checks the datastore only — so a TCP `PING` is what makes
 * "boots against the disposable stack" more than an assumption. PostgreSQL is proven by the worker's
 * readiness probe, which performs a real query through the same URL the repositories use.
 *
 * @param {string} name - The dependency for the failure message.
 * @param {string} url - The connection string from the validated environment.
 * @returns {Promise<void>}
 */
async function assertTcpReachable(name, url) {
  const parsed = new URL(url);
  const port = Number(
    parsed.port === '' ? (parsed.protocol === 'redis:' ? 6379 : 5432) : parsed.port,
  );
  await new Promise((resolveConnect, reject) => {
    const socket = connect({ host: parsed.hostname, port });
    const fail = (reason) => {
      socket.destroy();
      reject(
        new CheckFailure(`${name} is not reachable on ${parsed.hostname}:${port} (${reason})`),
      );
    };
    socket.setTimeout(5_000, () => fail('timed out'));
    socket.once('error', (error) => fail(error.code ?? 'connection failed'));
    socket.once('connect', () => {
      if (parsed.protocol !== 'redis:') {
        socket.end();
        resolveConnect();
        return;
      }
      let reply = '';
      socket.once('data', (chunk) => {
        reply += chunk.toString('utf8');
        socket.end();
        if (reply.startsWith('+PONG')) resolveConnect();
        else reject(new CheckFailure(`${name} did not answer PING`));
      });
      socket.write('PING\r\n');
    });
  });
}

/**
 * Start a child process with a captured log ring.
 *
 * @param {string} command - The executable.
 * @param {string[]} args - Its arguments.
 * @param {{ cwd: string, env: Record<string, string | undefined>, label: string }} options - Where
 *   it runs, what it sees and how failures name it.
 * @returns {{ child: import('node:child_process').ChildProcess, log: () => string }}
 */
function startProcess(command, args, { cwd, env, label }) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const lines = [];
  const record = (chunk) => {
    lines.push(chunk.toString('utf8'));
    if (lines.length > 80) lines.shift();
  };
  child.stdout.on('data', record);
  child.stderr.on('data', record);
  child.once('error', (error) => record(`${label} spawn error: ${error.message}\n`));

  return { child, log: () => lines.join('') };
}

/**
 * Poll one URL until it answers, or the boot window closes.
 *
 * @param {string} url - The URL to poll.
 * @param {import('node:child_process').ChildProcess} child - The process that must stay alive.
 * @param {string} label - How a failure names the process.
 * @param {() => string} log - The captured output, printed on failure only.
 * @returns {Promise<Response>}
 */
async function waitForAnswer(url, child, label, log) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new CheckFailure(
        `${label} exited with code ${child.exitCode} before answering ${url}\n${log()}`,
      );
    }
    // A refused connection fails immediately; the timer only bounds a listener that accepts and does
    // not answer. Clearing it keeps a stray abort from firing after the answer arrived.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      return response;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new CheckFailure(`${label} did not answer ${url} within ${BOOT_TIMEOUT_MS}ms\n${log()}`);
}

/**
 * Stop a child and its tree, with a bounded grace period.
 *
 * The Next.js server does not fork a second process, but a supervisor or a wrapper may; the fallback
 * kills the tree so a failed check cannot leave a listener behind for the next run.
 *
 * @param {import('node:child_process').ChildProcess} child - The process to stop.
 * @returns {Promise<void>}
 */
async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolveExit) => child.once('exit', () => resolveExit(true))),
    new Promise((resolveWait) => setTimeout(() => resolveWait(false), SHUTDOWN_GRACE_MS)),
  ]);
  if (exited) return;

  if (process.platform === 'win32' && child.pid !== undefined) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    child.kill('SIGKILL');
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
}

/**
 * Assert one probe response against `C-091`.
 *
 * @param {Response} response - The response the process returned.
 * @param {string} label - The process and path, for the failure message.
 * @param {{ status: number, body: string }} expected - The contract's answer.
 * @returns {Promise<void>}
 */
async function assertProbe(response, label, expected) {
  const body = await response.text();
  if (response.status !== expected.status) {
    throw new CheckFailure(`${label} answered ${response.status}, expected ${expected.status}`);
  }
  if (body !== expected.body) {
    throw new CheckFailure(`${label} answered ${JSON.stringify(body)}, expected ${expected.body}`);
  }
  if (response.headers.get('content-type') !== 'application/json') {
    throw new CheckFailure(`${label} did not answer with application/json`);
  }
  if (response.headers.get('cache-control') !== 'no-store') {
    throw new CheckFailure(`${label} did not answer with Cache-Control: no-store`);
  }
}

/**
 * Run the boot check.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const values = loadVerifiedEnvironment();

  if (!existsSync(resolve(webRoot, '.next'))) {
    console.error('boot-check: apps/web/.next is missing; run "pnpm build" before the boot check');
    process.exitCode = 2;
    return;
  }

  await assertTcpReachable('PostgreSQL', values.DATABASE_URL);
  await assertTcpReachable('Redis', values.REDIS_URL);

  const childEnvironment = { ...process.env, ...values };
  const webPort = await freePort();
  const workerPort = await freePort();

  const web = startProcess(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(webPort)],
    {
      cwd: webRoot,
      env: childEnvironment,
      label: 'web',
    },
  );
  const worker = startProcess(process.execPath, ['src/main.ts'], {
    cwd: workerRoot,
    env: { ...childEnvironment, WORKER_HOST: '127.0.0.1', WORKER_PORT: String(workerPort) },
    label: 'worker',
  });

  try {
    const webBase = `http://127.0.0.1:${webPort}`;
    const workerBase = `http://127.0.0.1:${workerPort}`;

    await assertProbe(
      await waitForAnswer(`${webBase}/healthz`, web.child, 'web', web.log),
      'web GET /healthz',
      { status: 200, body: PROBE_BODIES.alive },
    );
    await assertProbe(
      await waitForAnswer(`${webBase}/readyz`, web.child, 'web', web.log),
      'web GET /readyz',
      { status: 200, body: PROBE_BODIES.ready },
    );

    const webRefusal = await fetch(`${webBase}/healthz`, { method: 'POST', body: 'anything' });
    if (webRefusal.status !== 405 || webRefusal.headers.get('allow') !== 'GET') {
      throw new CheckFailure(
        `web POST /healthz answered ${webRefusal.status}, expected 405 with Allow: GET`,
      );
    }

    await assertProbe(
      await waitForAnswer(`${workerBase}/healthz`, worker.child, 'worker', worker.log),
      'worker GET /healthz',
      { status: 200, body: PROBE_BODIES.alive },
    );
    await assertProbe(
      await waitForAnswer(`${workerBase}/readyz`, worker.child, 'worker', worker.log),
      'worker GET /readyz',
      { status: 200, body: PROBE_BODIES.ready },
    );

    console.log('boot-check: PostgreSQL and Redis reachable from the validated environment');
    console.log(`boot-check: web answered /healthz and /readyz (port ${webPort})`);
    console.log(`boot-check: worker answered /healthz and /readyz (port ${workerPort})`);
    console.log('boot-check: PASS');
  } finally {
    await Promise.all([stopProcess(web.child), stopProcess(worker.child)]);
  }
}

try {
  await main();
} catch (error) {
  if (!(error instanceof CheckFailure)) throw error;
  console.error(`boot-check: FAIL - ${error.message}`);
  // A missing prerequisite already asked for exit code 2; a failed check is exit code 1.
  if (process.exitCode === undefined) process.exitCode = 1;
}
