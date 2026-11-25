/**
 * The seed runner: reference data the platform publishes from, written once and then left alone.
 *
 * Three data sets are seeded: the ward reference (`wards.ts`, `FEAT-002`), the published discussion
 * rules (`rules.ts`, `FEAT-006`), and the first staff accounts (`staff.ts`, `C-092`, `C-093`). All are
 * reference data, not operational data: a seed run creates what is missing and never touches a row
 * that already exists.
 *
 * That rule is what makes a second run a no-op. A resident's confirmed wording, a reviewer's decided
 * match and a retired rule are all later states of the same row, and a seed that rewrote them would
 * erase work the record depends on. The insert therefore conflicts into a no-op on every unique
 * constraint instead of updating.
 *
 * Seeds are code, not migration SQL (`packages/db/AGENTS.md` Structure), and they run through the
 * same client and transaction boundary as any other write.
 */
import type { RuleSeedRow } from './rules.ts';
import { ruleSeedRows } from './rules.ts';
import { seedStaff, type StaffSeedOptions } from './staff.ts';
import type { WardSeedRow } from './wards.ts';
import { wardSeedRows } from './wards.ts';
import { executorOf, isTransactionScope, withTransaction, type Executor } from '../client.ts';
import { rule } from '../schema/rule.ts';
import { ward } from '../schema/ward.ts';

/** What one data set did on this run. */
export interface SeedResult {
  /** Rows inserted by this run. */
  readonly inserted: number;
  /** Rows the data set expected but the database already held. */
  readonly existing: number;
}

/** What a full seed run did, per data set. */
export interface SeedReport {
  readonly wards: SeedResult;
  readonly rules: SeedResult;
}

function summarise(expected: number, inserted: number): SeedResult {
  return { inserted, existing: expected - inserted };
}

/**
 * Writes every ward the reference holds.
 *
 * A ward the database already holds is skipped, so a re-run inserts nothing and a ward that later
 * gained a resident's confirmed wording keeps it.
 *
 * @param executor - The shared client, or an open transaction handed in by the caller.
 */
export async function seedWards(executor: Executor): Promise<SeedResult> {
  const rows: WardSeedRow[] = wardSeedRows();
  const inserted = await executorOf(executor)
    .insert(ward)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: ward.id });
  return summarise(rows.length, inserted.length);
}

/**
 * Writes every published rule the seed holds.
 *
 * Retiring a rule is an operational change, not a seed concern: this function never reactivates or
 * rewrites a rule that already exists.
 */
export async function seedRules(executor: Executor): Promise<SeedResult> {
  const rows: RuleSeedRow[] = ruleSeedRows();
  const inserted = await executorOf(executor)
    .insert(rule)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: rule.id });
  return summarise(rows.length, inserted.length);
}

/**
 * Seeds the whole reference set, including the first staff accounts and both staff credentials.
 *
 * Every data set shares one transaction, so a run either leaves the reference consistent or changes
 * nothing. The transaction is opened here and the seed functions below it compose through the scope
 * they are given, which is the composition rule in `packages/db/AGENTS.md`.
 *
 * The staff seed needs the `NFR-021` hasher and one deployment secret per credential - the operator's
 * and the response-staff member's; neither is defaulted here, because a caller without a secret must
 * be the one that decides whether a clean deployment is allowed to fail (`operations.md` Staff
 * sign-in).
 *
 * @param executor - The shared client, or an open transaction handed in by the caller.
 * @param staff - The password hasher and the two one-time deployment secrets.
 */
export async function runSeeds(executor: Executor, staff: StaffSeedOptions): Promise<SeedReport> {
  // A caller that already opened a transaction keeps it: opening a second one would fail, and the
  // seed must not decide the boundary for a larger write that includes it.
  if (isTransactionScope(executor)) return runSeedsInScope(executor, staff);
  return withTransaction((scope) => runSeedsInScope(scope, staff), executorOf(executor));
}

/** Seeds every data set inside the transaction the caller already opened. */
async function runSeedsInScope(executor: Executor, staff: StaffSeedOptions): Promise<SeedReport> {
  const wards = await seedWards(executor);
  const rules = await seedRules(executor);
  // The first staff accounts and the operator credential are reference data too, but the report
  // keeps its published shape: callers that print it do not gain a field, and the accounts are still
  // created in the same unit of work.
  await seedStaff(executor, staff);
  return { wards, rules };
}
