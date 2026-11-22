/**
 * The server-side echo of a ward form the action refused (`C-011`, `FEAT-002`).
 *
 * A validation or write failure re-renders the screen through a redirect, and a redirect may carry
 * no free text: the resident's description never enters a URL, a cookie or a client bundle
 * (`apps/web/AGENTS.md` Discipline). The submitted wording is therefore held, briefly, on the
 * server. The echo is named by a digest of the request's idempotency key, which is opaque and
 * cannot be reversed into either the key or the words, and it expires on its own.
 *
 * Without the echo a resident would retype their words after a refused submission, which is the
 * failure mode the area manual names: "a failed enhancement re-renders with the submitted values
 * still in the fields".
 */
/**
 * The cache seam the echo stores through (`packages/platform` `CacheStore`, structurally).
 *
 * The narrow shape keeps this module testable with a memory double and avoids exporting a platform
 * port from a route folder.
 */
export interface EchoStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** How long an echo lives. A re-render happens at once; the TTL is the backstop. */
export const FORM_ECHO_TTL_SECONDS = 600;

/** What one echo holds: the submitted values, and nothing about the member. */
export interface WardFormEcho {
  readonly description: string;
  readonly localGovernmentArea: string;
}

/** The key an echo is stored under, namespaced by the screen. */
export function echoKey(scope: string, digest: string): string {
  return `web:ward-echo:${scope}:${digest}`;
}

/**
 * Stores one echo.
 *
 * A store that cannot be reached is not a failure of the action: the resident re-renders with empty
 * fields rather than the submission failing twice.
 */
export async function saveEcho(store: EchoStore, key: string, value: WardFormEcho): Promise<void> {
  try {
    await store.set(key, JSON.stringify(value), FORM_ECHO_TTL_SECONDS);
  } catch {
    // The echo is a courtesy; the screen re-renders empty rather than failing again.
  }
}

/**
 * Reads one echo.
 *
 * @returns The values, or `null` on a miss, an unreachable store or a malformed record — each of
 *   which renders as an empty form rather than an error.
 */
export async function readEcho(store: EchoStore, key: string): Promise<WardFormEcho | null> {
  try {
    const raw = await store.get(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { description, localGovernmentArea } = parsed as Record<string, unknown>;
    if (typeof description !== 'string') return null;
    return {
      description,
      localGovernmentArea: typeof localGovernmentArea === 'string' ? localGovernmentArea : '',
    };
  } catch {
    return null;
  }
}
