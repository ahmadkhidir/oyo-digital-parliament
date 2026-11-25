/**
 * The published privacy notice and its history (`C-037`, `NFR-040`, `NFR-045`,
 * `screens/23-privacy-notice.md`).
 *
 * The notice is static content: the screen's data source is `Static` throughout, and the launch
 * notice has one version. It lives here as a typed structure built from the message catalogue, so
 * the page and the `GET /api/privacy-notice` handler print the same words and the same dates, and
 * so the "Updated" state can be exercised against a two-version fixture without inventing a second
 * copy of the notice.
 *
 * The processors entry names the model provider and the processing region as the processing
 * agreement names them; `NFR-045` requires the notice to say both before inference is enabled, and
 * the contract's own example carries the same placeholders.
 *
 * The notice routes a privacy question to the Contact screen rather than collecting a second
 * request by mail (`screens/23-privacy-notice.md`, Edge Cases); the published mailbox that screen
 * falls back to lives in `apps/web/app/(record)/contact/_lib/channel.ts`.
 */
import type { LaunchLocale, Messages } from '../../../../messages';
import { getMessages } from '../../../../messages';

/** One published version of the notice, in the `C-037` shape. */
export interface NoticeVersion {
  readonly version: string;
  readonly effectiveAt: string;
  readonly summary: string;
  readonly lawfulBasis: readonly string[];
  readonly rights: readonly string[];
  readonly retention: readonly string[];
  readonly processors: readonly {
    readonly name: string;
    readonly purpose: string;
    readonly region: string;
  }[];
}

/** The current notice and the versions it replaced, newest first. */
export interface NoticeHistory {
  readonly current: NoticeVersion;
  readonly previous: readonly NoticeVersion[];
}

/**
 * The version the launch notice was published under (`C-037`'s example).
 *
 * Its effective instant is the start of that Lagos day, as `C-001` interprets calendar dates.
 */
export const LAUNCH_NOTICE_VERSION = '2026-11-01';
const LAUNCH_EFFECTIVE_AT = '2026-11-01T00:00:00Z';

/**
 * Builds the launch history from one locale's catalogue.
 */
export function launchNoticeHistory(locale: LaunchLocale): NoticeHistory {
  const copy: Messages['privacy'] = getMessages(locale).privacy;
  return {
    current: {
      version: LAUNCH_NOTICE_VERSION,
      effectiveAt: LAUNCH_EFFECTIVE_AT,
      summary: copy.summary,
      lawfulBasis: copy.lawfulBasis,
      rights: copy.rights,
      retention: copy.retention,
      processors: copy.processors,
    },
    previous: [],
  };
}

/** One notice selection: the version to render and the versions older than it. */
export interface NoticeSelection {
  readonly notice: NoticeVersion;
  readonly previousVersions: readonly string[];
  /** Whether the selected version is the current one. */
  readonly current: boolean;
}

/**
 * Selects the current notice, or one named version.
 *
 * @param history - The published versions.
 * @param version - A requested version, or `null` for the current one.
 * @returns The selection, or `null` when the requested version was never published.
 */
export function selectNotice(
  history: NoticeHistory,
  version: string | null,
): NoticeSelection | null {
  const all = [history.current, ...history.previous];
  if (version === null) {
    return {
      notice: history.current,
      previousVersions: history.previous.map((notice) => notice.version),
      current: true,
    };
  }
  const selected = all.find((notice) => notice.version === version);
  if (selected === undefined) return null;
  return {
    notice: selected,
    previousVersions: all
      .filter(
        (notice) =>
          notice.version !== selected.version && notice.effectiveAt < selected.effectiveAt,
      )
      .map((notice) => notice.version),
    current: selected.version === history.current.version,
  };
}

/** Renders one `C-001` instant as a calendar date in Lagos. */
export function formatNoticeDate(locale: LaunchLocale, instant: string): string {
  const parsed = Date.parse(instant);
  if (!Number.isFinite(parsed)) return instant;
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
  }).format(parsed);
}
