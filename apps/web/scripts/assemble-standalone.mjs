#!/usr/bin/env node
/**
 * Completes the standalone server bundle before the server listens.
 *
 * `output: "standalone"` (next.config.ts) emits the server and its traced dependencies under
 * `.next/standalone/apps/web`, but it does not emit `.next/static` or `public/`. Started as-is, the
 * server answers HTML whose stylesheet, script chunks and brand files are all 404, so the record
 * renders unstyled and any client island never runs. `ADR-005` states the bundle must carry both
 * directories; the container task copies them into the image, and this script is the same step for
 * the local start command and for any host that starts the bundle from the workspace.
 *
 * Run by `prestart` in `apps/web/package.json`, which is what the root manual's `pnpm start` reaches
 * through `turbo run start`. It runs before `server.js` is spawned, so the server can never answer a
 * page before its assets are in place.
 *
 * The generated `public/` directory is rebuilt from the asset ledger first (`sync-assets.mjs`), so a
 * stale mark or font cannot be copied into the bundle. Existing destinations are removed before the
 * copy: `.next/static` holds content-hashed chunks, and a leftover file from a previous build would
 * otherwise be served beside the current ones.
 *
 * Exits 2 when the bundle is missing, naming the command that produces it; the copy itself fails
 * loudly on any filesystem error rather than starting a server without assets.
 */
import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const bundleRoot = join(appRoot, '.next', 'standalone', 'apps', 'web');
const server = join(bundleRoot, 'server.js');

if (!existsSync(server)) {
  console.error(
    'assemble-standalone: the standalone bundle is missing; run "pnpm build" before "pnpm start"',
  );
  process.exit(2);
}

// The ledger is the only source of the mark, fonts, icons and status files (ADR-005).
await import('./sync-assets.mjs');

/**
 * Replace one directory in the bundle with the built copy.
 *
 * @param {string} name - The directory name, for the failure message.
 * @param {string} from - The built directory to copy.
 * @param {string} to - Its destination inside the bundle.
 * @returns {Promise<void>}
 */
async function replace(name, from, to) {
  if (!existsSync(from)) {
    console.error(`assemble-standalone: ${name} is missing; run "pnpm build" before "pnpm start"`);
    process.exit(2);
  }
  await rm(to, { recursive: true, force: true });
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, { recursive: true, force: true });
}

// The client chunks Next's server reads from `.next/static`, then the public files it serves at the
// URL root (the brand mark and fonts among them).
await replace(
  '.next/static',
  join(appRoot, '.next', 'static'),
  join(bundleRoot, '.next', 'static'),
);
await replace('public/', join(appRoot, 'public'), join(bundleRoot, 'public'));

console.log('assemble-standalone: bundle completed with .next/static and public/');
