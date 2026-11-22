/**
 * The server-side echo of a My Record form the action refused (`C-033`, `screens/13-my-record.md`).
 *
 * A refused correction re-renders through a redirect, and a redirect may carry no personal data:
 * a display name and a full name never enter a URL, a cookie or a client bundle
 * (`apps/web/AGENTS.md` Discipline). The submitted values are therefore held briefly on the server
 * under a digest of the render's opaque key, so a failed save puts the member's words back in the
 * fields instead of making them type a name again.
 *
 * The echo holds the member's own values, never anyone else's, and expires on its own. A store that
 * cannot answer is not a second failure: the form re-renders from the record instead.
 */
import type { Locale } from '@odp/domain';

/** The cache seam the echo stores through (`packages/platform` `CacheStore`, structurally). */
export interface RecordEchoStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** How long an echo lives. The re-render happens at once; the TTL is the backstop. */
export const RECORD_ECHO_TTL_SECONDS = 600;

/** What one refused correction submission leaves behind. */
export interface RecordEcho {
  readonly displayName: string;
  readonly fullName: string;
  readonly locale: Locale;
  /** The `C-001` field reasons the use case named, keyed to the control that produced each. */
  readonly fields: Readonly<Record<string, string>>;
}

/** The key an echo is stored under, namespaced by the screen. */
export function recordEchoKey(digest: string): string {
  return `web:me-echo:${digest}`;
}

/** Stores one echo; an unreachable store re-renders from the record rather than failing twice. */
export async function saveRecordEcho(
  store: RecordEchoStore,
  key: string,
  echo: RecordEcho,
): Promise<void> {
  try {
    await store.set(key, JSON.stringify(echo), RECORD_ECHO_TTL_SECONDS);
  } catch {
    // The echo is a courtesy; a refused save is already the outcome the member is shown.
  }
}

/** Reads one echo, or `null` on a miss, an unreachable store or a malformed record. */
export async function readRecordEcho(
  store: RecordEchoStore,
  key: string,
): Promise<RecordEcho | null> {
  try {
    const raw = await store.get(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record['displayName'] !== 'string' || typeof record['fullName'] !== 'string') {
      return null;
    }
    const locale = record['locale'] === 'yo-NG' ? 'yo-NG' : 'en-NG';
    const rawFields = record['fields'];
    const fields: Record<string, string> = {};
    if (typeof rawFields === 'object' && rawFields !== null) {
      for (const [name, reason] of Object.entries(rawFields)) {
        // A reason is a `C-001` token: an upper-snake word. Anything else is not rendered.
        if (typeof reason === 'string' && /^[A-Z_]{2,40}$/.test(reason)) fields[name] = reason;
      }
    }
    return { displayName: record['displayName'], fullName: record['fullName'], locale, fields };
  } catch {
    return null;
  }
}
