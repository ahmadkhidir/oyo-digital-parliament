/**
 * Copies the generated asset slots into the deployable's `public/` directory.
 *
 * `assets/ASSETS.md` is the ledger and the source of every brand file; Next serves from an
 * application-local `public/` directory, so the two are bridged at build and dev time instead
 * of keeping a second copy of the marks, fonts and icons in the repository. The destination is
 * git-ignored and recreated from the ledger on every run, so a stale file can never ship
 * (NFR-001: the fonts and the mark are the only weight this adds).
 *
 * Run by `predev` and `prebuild` in `apps/web/package.json`. A missing source is a hard failure
 * rather than a silent substitution (packages/ui/AGENTS.md, "Asset bindings").
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const repositoryRoot = join(appRoot, '..', '..');
const assets = join(repositoryRoot, 'assets');
const target = join(appRoot, 'public');

/** One ledger source and the path it is served under. */
const COPIES = [
  { from: join(assets, 'brand'), to: join(target, 'brand') },
  { from: join(assets, 'fonts'), to: join(target, 'fonts'), include: /\.woff2$/ },
  { from: join(assets, 'icons'), to: join(target, 'icons') },
  { from: join(assets, 'status'), to: join(target, 'status') },
];

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const copy of COPIES) {
  await cp(copy.from, copy.to, {
    recursive: true,
    force: true,
    ...(copy.include === undefined
      ? {}
      : {
          filter: (source) => {
            // Keep directories; copy only the files the running product binds.
            if (!/[/\\][^/\\]+\.[a-z0-9]+$/i.test(source)) return true;
            return copy.include.test(source);
          },
        }),
  });
}

// The licence obligations travel with the files they cover.
await cp(join(assets, 'icons', 'LICENSE'), join(target, 'icons', 'LICENSE'));
await cp(join(assets, 'fonts', 'OFL.txt'), join(target, 'fonts', 'OFL.txt'));
