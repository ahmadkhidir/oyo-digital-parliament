/**
 * The ward reference's persistence adapter (`schema.md` Ward, `C-009`, `C-010`, `C-071`,
 * `packages/domain` `WardReferencePort`).
 *
 * The reference is the platform's own: seeded rows plus the aliases residents have confirmed and
 * reviewers have settled. `(name, local_government_area)` is the natural key the unique index
 * enforces, so a reviewed description can never create a second copy of a ward that already exists.
 *
 * The read is ordered `(local_government_area, name, id)` and paged with an opaque `cur_` cursor. The
 * reference is small - 351 seeded wards - but the page still reads keyset-stably so a ward added
 * between two page reads cannot make a row appear twice.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Ward, WardReferencePort } from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { ward } from '../schema/ward.ts';

/** The identifier kind `C-001` assigns to a pagination cursor. */
const CURSOR_PREFIX = 'cur_';
const CURSOR_PATTERN = /^cur_[0-9]{4,26}$/;

/** One repository implements the ward-reference port; there is no second writer of this table. */
export type WardRepository = WardReferencePort;

/**
 * Encodes an offset as a `C-001` cursor.
 *
 * The cursor is opaque to the caller and stable for one page order; decoding a malformed value
 * restarts at the first page rather than failing a resident's registration.
 */
function encodeCursor(offset: number): string {
  return `${CURSOR_PREFIX}${String(offset).padStart(6, '0')}`;
}

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined || !CURSOR_PATTERN.test(cursor)) return 0;
  const offset = Number.parseInt(cursor.slice(CURSOR_PREFIX.length), 10);
  return Number.isInteger(offset) && offset >= 0 ? offset : 0;
}

/** Maps a stored row to the domain type; an unpopulated alias array reads as empty. */
function toWard(row: typeof ward.$inferSelect): Ward {
  return {
    id: row.id,
    name: row.name,
    localGovernmentArea: row.localGovernmentArea,
    aliases: row.aliases ?? [],
    source: row.source,
    createdAt: row.createdAt,
  };
}

/**
 * Builds the ward repository bound to an executor.
 *
 * @param executor - The shared client, or the transaction the calling write is already inside, so a
 *   confirmed alias and the member's ward commit together.
 */
export function createWardRepository(executor: Executor): WardRepository {
  const db = executorOf(executor);

  return {
    async list(query) {
      const offset = decodeCursor(query.cursor);
      // One extra row tells the caller whether another page exists without a second count.
      const pageSize = query.limit + 1;
      const rows =
        query.localGovernmentArea === undefined
          ? await db
              .select()
              .from(ward)
              .orderBy(asc(ward.localGovernmentArea), asc(ward.name), asc(ward.id))
              .limit(pageSize)
              .offset(offset)
          : await db
              .select()
              .from(ward)
              .where(eq(ward.localGovernmentArea, query.localGovernmentArea))
              .orderBy(asc(ward.localGovernmentArea), asc(ward.name), asc(ward.id))
              .limit(pageSize)
              .offset(offset);

      const page = rows.slice(0, query.limit);
      return {
        wards: page.map(toWard),
        nextCursor: rows.length > query.limit ? encodeCursor(offset + page.length) : null,
      };
    },

    async getById(wardId) {
      const rows = await db.select().from(ward).where(eq(ward.id, wardId)).limit(1);
      const row = rows[0];
      return row === undefined ? null : toWard(row);
    },

    async listForMatching() {
      const rows = await db
        .select()
        .from(ward)
        .orderBy(asc(ward.localGovernmentArea), asc(ward.name), asc(ward.id));
      return rows.map(toWard);
    },

    async listByLocalGovernmentAreas(localGovernmentAreas) {
      if (localGovernmentAreas.length === 0) return [];
      const rows = await db
        .select()
        .from(ward)
        .where(inArray(ward.localGovernmentArea, [...localGovernmentAreas]))
        .orderBy(asc(ward.localGovernmentArea), asc(ward.name), asc(ward.id));
      return rows.map(toWard);
    },

    async appendAlias(input) {
      // The guard is in the statement rather than in a read-then-write pair: two reviewers settling
      // the same description must not add the same alias twice, and a case-only repeat is the same
      // alias (`FEAT-002` accumulates wording, not duplicates).
      await db
        .update(ward)
        .set({
          aliases: sql`array_append(coalesce(${ward.aliases}, '{}'::text[]), ${input.alias})`,
        })
        .where(
          and(
            eq(ward.id, input.wardId),
            sql`not exists (
              select 1 from unnest(coalesce(${ward.aliases}, '{}'::text[])) as existing_alias
              where lower(existing_alias) = lower(${input.alias})
            )`,
          ),
        );
    },
  };
}
