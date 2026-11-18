/**
 * Minimal filesystem access for the token generator (`src/tokens/generate.ts`) and its snapshot
 * test. The `packages/ui` tsconfig deliberately has no Node types — this package must never reach
 * for Node from a component — so the module is loaded dynamically through a computed specifier
 * and typed narrowly. Build tooling only; never import this from a component.
 */
interface FsLike {
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
}

let cached: FsLike | undefined;

/** Return a narrow `fs/promises` subset. Cached so repeated calls cost one dynamic import. */
export async function fs(): Promise<FsLike> {
  cached ??= (await import("node:" + "fs/promises")) as unknown as FsLike;
  return cached;
}
