/**
 * The staff actions' request facts (`C-092`, `C-001`).
 *
 * A server action receives a form, not a request object, so the two transport values the contract
 * names are read here: the source address for the per-address limiter and an `Idempotency-Key` for
 * every state-changing call. The key is transparent to the browser (the form carries no key field),
 * minted once per submission with the UUIDv4 form `C-001` fixes.
 */
import { headers } from 'next/headers';

/**
 * The source address the limiter counts against.
 *
 * The value is passed to the limiter, which digests it, and is never logged, stored or placed in a
 * key by this module (`NFR-027`).
 */
export async function requestAddress(): Promise<string> {
  const store = await headers();
  const forwarded = store.get('x-forwarded-for');
  if (forwarded !== null) {
    const first = forwarded.split(',')[0]?.trim();
    if (first !== undefined && first !== '') return first;
  }
  const direct = store.get('x-real-ip');
  return direct === null || direct === '' ? 'unknown' : direct;
}

/** A fresh `C-001` `Idempotency-Key`. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
