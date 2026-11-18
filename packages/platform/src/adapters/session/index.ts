/**
 * The session capability's adapter surface.
 *
 * The composition root imports this file rather than `./redis/...` directly, so the vendor name stays
 * inside `src/adapters/` while the root still wires the one store this deployment has. Everything the
 * application needs for sessions, one-time codes and rate limits is built here from the validated
 * configuration, so no caller reads a timeout or a cap itself.
 *
 * @module adapters/session
 */
import type { ClockPort } from '../../../../domain/src/ports/clock.ts';
import type { SmsDeliveryPort } from '../../../../domain/src/ports/notifications.ts';
import type {
  MemberSessionPort,
  StaffSessionPort,
  VerificationCodePort,
} from '../../../../domain/src/identity/ports.ts';
import type { PlatformConfig } from '../../config/load.ts';
import { createSessionRedisConnection, type SessionRedisCommands } from './redis/client.ts';
import { createVerificationCodeStore } from './redis/codes.ts';
import {
  createFixedWindowRateLimiter,
  type RateLimitAdapter,
  type RateLimitPolicy,
} from './redis/rate-limit.ts';
import { createMemberSessionStore, createStaffSessionStore } from './redis/sessions.ts';
import { createRedisSessionStore } from './redis/store.ts';

/** The identity effects the application receives. */
export interface SessionCapability {
  readonly memberSessions: MemberSessionPort;
  readonly staffSessions: StaffSessionPort;
  readonly codes: VerificationCodePort;
  readonly rateLimits: RateLimitAdapter;
  /** Whether the store answers. Readiness reports it; it never blocks a read on its own. */
  ping(): Promise<boolean>;
  /** Release the connection. Safe to call once, during shutdown. */
  close(): Promise<void>;
}

/** What the capability needs to build its ports. */
export interface SessionCapabilityOptions {
  readonly config: PlatformConfig;
  /** The Redis command seam. The composition root opens it, so there is one connection per process. */
  readonly commands: SessionRedisCommands;
  readonly sms: SmsDeliveryPort;
  readonly clock: ClockPort;
}

/** Turn the configured caps into the limiter's per-bucket policy, with one shared window. */
function bucketPolicies(config: PlatformConfig): Record<string, RateLimitPolicy> {
  const { windowSeconds, caps } = config.rateLimit;
  const policies: Record<string, RateLimitPolicy> = {};
  for (const [bucket, limit] of Object.entries(caps)) {
    policies[bucket] = Object.freeze({ limit, windowSeconds });
  }
  return Object.freeze(policies);
}

/**
 * Build the session, code and limiter ports.
 *
 * @param options - The validated configuration, the Redis commands, the SMS port and the clock.
 */
export function createSessionCapability(options: SessionCapabilityOptions): SessionCapability {
  const { config, commands, sms, clock } = options;
  const store = createRedisSessionStore(commands);

  const memberSessions = createMemberSessionStore({
    store,
    clock,
    idleSeconds: config.session.memberIdleSeconds,
  });
  const staffSessions = createStaffSessionStore({
    store,
    clock,
    idleSeconds: config.session.staffIdleSeconds,
  });
  const codes = createVerificationCodeStore({
    store,
    clock,
    sms,
    ttlSeconds: config.session.codeTtlSeconds,
  });
  const rateLimits = createFixedWindowRateLimiter({
    store,
    clock,
    policies: bucketPolicies(config),
  });

  return {
    memberSessions,
    staffSessions,
    codes,
    rateLimits,
    ping: () => store.ping(),
    close: () => commands.close(),
  };
}

/**
 * Build the capability from a Redis URL, for a composition root that has not opened a connection yet.
 *
 * @param options - Everything except the commands.
 * @param url - The validated `REDIS_URL`.
 */
export function createSessionCapabilityFromUrl(
  options: Omit<SessionCapabilityOptions, 'commands'>,
  url: string,
): SessionCapability {
  const connection = createSessionRedisConnection(url);
  return createSessionCapability({ ...options, commands: connection.commands });
}

export { createRedisSessionStore } from './redis/store.ts';
export { SessionNotFoundError } from './redis/sessions.ts';
export { CodeDeliveryError } from './redis/codes.ts';
export type { SessionRedisCommands, SessionRedisConnection } from './redis/client.ts';
export type { RateLimitAdapter, RateLimitPolicy } from './redis/rate-limit.ts';
