/**
 * Durable idempotency (ADR-002).
 *
 * `fingerprint.ts` turns a payload into a stable digest; `store.ts` claims a key, replays a stored
 * response and purges expired records. The table is internal infrastructure, not a product entity.
 */
export * from './fingerprint.ts';
export * from './store.ts';
