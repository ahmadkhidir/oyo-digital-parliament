/**
 * The ports the domain declares and the adapter packages implement.
 *
 * One capability per file, each narrow enough that an adapter can satisfy it without leaking a
 * vendor's shape into a use case (`packages/domain/AGENTS.md` Structure). The interfaces are
 * structural: `packages/platform` and `packages/db` implement them without this package importing
 * either, which is what keeps the dependency direction one-way.
 *
 * The audit and analytics modules still declare their own ports beside their rules; those are
 * re-exported here so a composition root has one import site, and they stay structurally identical.
 */
export type { ClockPort } from './clock.ts';
export type { IdentifierPort, IdentifierPrefix } from './identifiers.ts';
export type {
  SmsDeliveryCause,
  SmsDeliveryOutcome,
  SmsDeliveryPort,
  SmsDeliveryResult,
  SmsMessage,
} from './notifications.ts';
export type { ObjectStoragePort, ObjectWrite, StoredObject } from './object-store.ts';
export type { CacheFamily, CacheInvalidation, CacheInvalidationPort } from './cache.ts';
