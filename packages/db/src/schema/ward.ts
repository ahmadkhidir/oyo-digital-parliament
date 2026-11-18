/**
 * Ward (`schema.md` Ward).
 *
 * The platform's own ward reference, not an external authoritative list: a ward exists because the
 * platform seeded it, a resident confirmed it, or review settled it (`FEAT-002`). The natural key is
 * `(name, local_government_area)`, which is what makes the seed deterministic and idempotent without
 * inventing an external dataset identifier.
 */
import { relations } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { wardSource } from './enums.ts';
import { backing } from './backing.ts';
import { commitment } from './commitment.ts';
import { member } from './member.ts';
import { submission } from './submission.ts';
import { wardDescriptionReview } from './ward-description-review.ts';
import { wardPillarSnapshot } from './ward-pillar-snapshot.ts';
import { wardReportSnapshot } from './ward-report-snapshot.ts';

export const ward = pgTable(
  'ward',
  {
    id: text('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    localGovernmentArea: varchar('local_government_area', { length: 120 }).notNull(),
    /** Other names residents have used, accumulated from confirmed descriptions. */
    aliases: text('aliases').array(),
    source: wardSource('source').notNull(),
    createdAt: utcTimestamp('created_at').notNull(),
  },
  (t) => [
    check('ward_id_format', isIdentifier(t.id)),
    // Read path: seed idempotency and the ward list (`C-009`) group by local government area.
    uniqueIndex('ward_name_lga_key').on(t.name, t.localGovernmentArea),
    index('ward_lga_idx').on(t.localGovernmentArea),
  ],
);

export const wardRelations = relations(ward, ({ many }) => ({
  members: many(member),
  submissions: many(submission),
  backings: many(backing),
  wardDescriptionReviews: many(wardDescriptionReview),
  commitments: many(commitment),
  wardReportSnapshots: many(wardReportSnapshot),
  wardPillarSnapshots: many(wardPillarSnapshot),
}));
