/**
 * The reference seeds (`FEAT-002` ward reference, `FEAT-006` published rules).
 *
 * The properties the suite has to prove are the ones the issue names: the ward reference is the
 * published 33 local government areas and 351 wards with stable identifiers, the rules are citable
 * by a unique public code, a second run changes no row, and no seed carries personal data.
 *
 * The idempotency proof is a comparison of the stored rows before and after a second run, not a
 * count alone: a count would stay the same through an update in place.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rule, ward } from '../schema/index.ts';
import { createTestDatabase, type TestDatabase } from '../testing/index.ts';
import { DISCUSSION_RULES, ruleSeedRows } from './rules.ts';
import { runSeeds } from './run.ts';
import type { StaffSeedOptions } from './staff.ts';
import { WARD_REFERENCE, wardSeedRows } from './wards.ts';

/** `C-001`'s record identifier form. */
const IDENTIFIER = /^[a-z]{3}_[0-9A-Z]{4,26}$/;

/**
 * The staff half of a seed run.
 *
 * These suites prove the ward and rule reference; the credential itself is covered in `staff.test.ts`.
 * The hasher is a plain tag so the stored value stays inspectable, and the password meets `C-092`'s
 * twelve-character floor.
 */
const STAFF_SEED: StaffSeedOptions = {
  hasher: { hash: () => Promise.resolve('test-argon2id$seed-suite') },
  operatorInitialPassword: 'seed-suite-operator-password',
};

/** A telephone number or an email address would be personal data; a seed must contain neither. */
const PERSONAL_DATA = /\+234\d{10}|\b0[789]\d{9}\b|[\w.+-]+@[\w-]+\.[a-z]{2,}/i;

interface StoredWard {
  readonly id: string;
  readonly name: string;
  readonly localGovernmentArea: string;
  readonly source: string;
  readonly createdAt: string;
}

interface StoredRule {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly text: string;
  readonly active: boolean;
  readonly createdAt: string;
}

async function readWards(database: TestDatabase): Promise<readonly StoredWard[]> {
  return database.db
    .select({
      id: ward.id,
      name: ward.name,
      localGovernmentArea: ward.localGovernmentArea,
      source: ward.source,
      createdAt: ward.createdAt,
    })
    .from(ward)
    .orderBy(ward.id);
}

async function readRules(database: TestDatabase): Promise<readonly StoredRule[]> {
  return database.db
    .select({
      id: rule.id,
      code: rule.code,
      title: rule.title,
      text: rule.text,
      active: rule.active,
      createdAt: rule.createdAt,
    })
    .from(rule)
    .orderBy(rule.code);
}

describe('ward reference seed', () => {
  it('holds the published 33 local government areas and 351 wards', () => {
    expect(WARD_REFERENCE).toHaveLength(33);
    const total = WARD_REFERENCE.reduce((count, group) => count + group.wards.length, 0);
    expect(total).toBe(351);
  });

  it('names every ward once inside its local government area', () => {
    const rows = wardSeedRows();
    const byArea = new Map<string, string[]>();
    for (const row of rows) {
      const names = byArea.get(row.localGovernmentArea) ?? [];
      names.push(row.name);
      byArea.set(row.localGovernmentArea, names);
    }

    expect(byArea.size).toBe(33);
    for (const names of byArea.values()) {
      expect(names.length).toBeGreaterThan(0);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('builds the same rows on every call and mints a stable identifier per ward', () => {
    const first = wardSeedRows();
    const second = wardSeedRows();

    expect(second).toEqual(first);
    expect(new Set(first.map((row) => row.id)).size).toBe(first.length);
    for (const row of first) {
      expect(row.id).toMatch(IDENTIFIER);
      expect(row.source).toBe('seeded');
    }
  });

  it('records one fixed instant so two runs cannot differ', () => {
    const instants = new Set(wardSeedRows().map((row) => row.createdAt));
    expect(instants.size).toBe(1);
  });

  it('carries no personal data', () => {
    const values = wardSeedRows().flatMap((row) => [row.id, row.name, row.localGovernmentArea]);
    for (const value of values) expect(value).not.toMatch(PERSONAL_DATA);
  });
});

describe('published discussion rules seed', () => {
  it('publishes rules with unique public codes', () => {
    const codes = DISCUSSION_RULES.map((published) => published.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBeGreaterThan(0);
  });

  it('permits criticism explicitly', () => {
    const criticism = DISCUSSION_RULES.find((published) => published.code === 'R-1');
    expect(criticism?.text).toMatch(/criticis/i);
    expect(criticism?.text).toMatch(/never removed for being critical/i);
  });

  it('holds a named allegation for legal review', () => {
    const allegation = DISCUSSION_RULES.find((published) => published.code === 'R-4');
    expect(allegation?.text).toMatch(/legal review/i);
  });

  it('builds citable, active rows with stable identifiers', () => {
    const rows = ruleSeedRows();
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    for (const row of rows) {
      expect(row.id).toMatch(/^rul_[0-9A-Z]{4,26}$/);
      expect(row.active).toBe(true);
      expect(row.title.length).toBeGreaterThan(0);
      expect(row.text.length).toBeGreaterThan(0);
    }
  });

  it('carries no personal data', () => {
    for (const row of ruleSeedRows()) {
      expect(row.title).not.toMatch(PERSONAL_DATA);
      expect(row.text).not.toMatch(PERSONAL_DATA);
    }
  });
});

describe('seed run', () => {
  let database: TestDatabase;
  let firstRun: Awaited<ReturnType<typeof runSeeds>>;

  beforeAll(async () => {
    database = await createTestDatabase();
    firstRun = await runSeeds(database.db, STAFF_SEED);
  });

  afterAll(async () => {
    await database.dispose();
  });

  it('writes the whole reference on the first run', async () => {
    expect(firstRun.wards).toEqual({ inserted: 351, existing: 0 });
    expect(firstRun.rules).toEqual({ inserted: DISCUSSION_RULES.length, existing: 0 });

    const wards = await readWards(database);
    const rules = await readRules(database);
    expect(wards).toHaveLength(351);
    expect(new Set(wards.map((row) => row.localGovernmentArea)).size).toBe(33);
    expect(rules.map((row) => row.code)).toEqual(ruleSeedRows().map((row) => row.code));
  });

  it('changes no row on a second run', async () => {
    const wardsBefore = await readWards(database);
    const rulesBefore = await readRules(database);

    const secondRun = await runSeeds(database.db, STAFF_SEED);

    expect(secondRun).toEqual({
      wards: { inserted: 0, existing: 351 },
      rules: { inserted: 0, existing: DISCUSSION_RULES.length },
    });
    expect(await readWards(database)).toEqual(wardsBefore);
    expect(await readRules(database)).toEqual(rulesBefore);
  });

  it('leaves a ward that already holds the natural key untouched', async () => {
    const displaced = (await readWards(database)).at(-1);
    expect(displaced).toBeDefined();
    if (displaced === undefined) return;

    await database.db.delete(ward).where(eq(ward.id, displaced.id));
    await database.db.insert(ward).values({
      id: 'wrd_CONFIRMED0001',
      name: displaced.name,
      localGovernmentArea: displaced.localGovernmentArea,
      source: 'confirmed',
      createdAt: '2026-11-01T00:00:00Z',
    });

    const rerun = await runSeeds(database.db, STAFF_SEED);
    expect(rerun.wards.inserted).toBe(0);

    const stored = await readWards(database);
    const confirmed = stored.find((row) => row.name === displaced.name);
    expect(confirmed?.id).toBe('wrd_CONFIRMED0001');
    expect(confirmed?.source).toBe('confirmed');
    expect(stored).toHaveLength(351);
  });
});
