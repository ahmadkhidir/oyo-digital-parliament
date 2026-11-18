/**
 * The sign-in slice's dependency bundle (`C-005` to `C-008`).
 *
 * The identity bundle in `../identity/ports` is the composition root for the entry screens, and it
 * wires the sign-in challenge port as "not wired yet" — the sign-in task is the one that composes
 * it. This module takes that bundle and substitutes the real challenge store (over the platform's
 * Redis cache seam), leaving every other port exactly as the identity composition built it.
 *
 * The bundle is built once per process; both Redis connections (sessions' and cache's) are opened
 * by `createPlatform` inside the identity bundle and are shared, not duplicated here.
 */
import type { IdentityPorts } from '@odp/domain';
import { getIdentityDependencies } from '../identity/ports';
import { createSignInChallengeStore } from './sign-in-challenges';

/** A cached promise of the merged bundle; the identity bundle underneath is cached too. */
let cached: Promise<IdentityPorts> | null = null;

/**
 * The ports the sign-in actions run against: the identity bundle with the challenge store live.
 *
 * The caller that also needs the platform or the database handle gets them from
 * `getIdentityDependencies` — they are the same objects this bundle is built from.
 */
export function getSignInDependencies(): Promise<IdentityPorts> {
  cached ??= (async () => {
    const identity = await getIdentityDependencies();
    const ports: IdentityPorts = {
      ...identity.ports,
      signInChallenges: createSignInChallengeStore(identity.platform.cache),
    };
    return ports;
  })();
  return cached;
}
