/**
 * CLI: regenerate the token artifacts from `src/tokens/source.ts`.
 *
 * Run from `packages/ui`:
 *
 *     node src/tokens/generate.ts
 *
 * Writes exactly the files `generatedArtifacts` lists — `src/styles/theme.css`,
 * `src/styles/fonts.css` and `tailwind.preset.ts` — and nothing else. The artifacts are
 * committed; the snapshot test (`source.test.ts`) fails if they drift from the source.
 *
 * Both imports use computed specifiers because Node's type stripping requires explicit `.ts`
 * extensions while the package's tsconfig (bundler resolution) would reject them statically;
 * the local declarations pin the types in both cases.
 */
import type * as Source from './source';

type RenderModule = typeof import('./render');
type SourceModule = typeof Source;

interface WriteCapableFs {
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string, options: { recursive: boolean }): Promise<string | undefined>;
}

async function main(): Promise<void> {
  const source = (await import('./source' + '.ts')) as unknown as SourceModule;
  const render = (await import('./render' + '.ts')) as unknown as RenderModule;
  const fsModule = (await import('node:' + 'fs/promises')) as unknown as WriteCapableFs;

  for (const artifact of render.generatedArtifacts(source)) {
    await fsModule.mkdir('src/styles', { recursive: true });
    await fsModule.writeFile(artifact.path, artifact.content);
    console.log(`wrote ${artifact.path}`);
  }
}

await main();
