/**
 * The composition root.
 *
 * Builds the configured adapters from the validated configuration and returns the port bundle an
 * application or a worker hands to `@odp/domain`. This is the only production entry point: nothing
 * else in the package is exported from its root, so a caller cannot reach a vendor client, a Redis
 * connection or a credential except through the bundle (`packages/platform/AGENTS.md` Structure).
 *
 * Nothing here logs. A construction failure is a thrown error naming the provider or the missing
 * setting, never a value.
 *
 * @module index
 */
import type { ClockPort } from '../../domain/src/ports/clock.ts';
import type { CacheInvalidationPort } from '../../domain/src/ports/cache.ts';
import type { SmsDeliveryPort } from '../../domain/src/ports/notifications.ts';
import type { ObjectStoragePort } from '../../domain/src/ports/object-store.ts';
import {
  createCacheInvalidator,
  createRedisCacheStore,
  createRedisConnection,
} from './adapters/cache/index.ts';
import { createFetchHttpClient } from './adapters/http/fetch-client.ts';
import { withBoundedBackoff, waitWithTimer } from './adapters/sms/bounded-retry.ts';
import { createSmsDeliveryAdapter } from './adapters/sms/http/adapter.ts';
import { createHttpSmsProvider } from './adapters/sms/http/client.ts';
import { createUnconfiguredSmsDelivery } from './adapters/sms/none/adapter.ts';
import { createS3Client } from './adapters/storage/s3/client.ts';
import { createObjectStorage } from './adapters/storage/s3/adapter.ts';
import { createSignedReadUrl } from './adapters/storage/s3/urls.ts';
import {
  createSessionCapabilityFromUrl,
  type SessionCapability,
} from './adapters/session/index.ts';
import { createSystemClock } from './clock/clock.ts';
import { loadConfig, type LoadConfigOptions, type PlatformConfig } from './config/load.ts';
import type { CacheStore } from './ports/cache-store.ts';
import { createIdFactory, type IdFactory } from './ids/ids.ts';
export { createCredentialAdapters, type CredentialAdapters } from './adapters/password/index.ts';

export type { PlatformConfig } from './config/load.ts';
export { loadConfig } from './config/index.ts';
export type { WorkerConfig } from './config/load.ts';
export type { IdFactory } from './ids/ids.ts';
export type { SessionCapability } from './adapters/session/index.ts';

/** The effects an application or worker receives. */
export interface Platform {
  readonly config: PlatformConfig;
  readonly clock: ClockPort;
  readonly ids: IdFactory;
  /** The SMS delivery port, with the transport retry applied when a gateway is configured. */
  readonly sms: SmsDeliveryPort;
  readonly storage: ObjectStoragePort;
  readonly cache: CacheStore;
  readonly cacheInvalidation: CacheInvalidationPort;
  readonly featureFlags: PlatformConfig['featureFlags'];
  /**
   * Session material, one-time codes and rate-limit counters (`C-003` to `C-008`, `C-092`, `NFR-026`,
   * `NFR-027`). The domain's identity use cases take these as their ports; the web layer reads the
   * rate-limit headers off the same bundle.
   */
  readonly sessions: SessionCapability;
  /** Release the clients this bundle opened. Safe to call once, during shutdown. */
  close(): Promise<void>;
}

/**
 * Build the SMS port from configuration.
 *
 * `none` holds messages instead of pretending to deliver them; `http` wires the gateway client, the
 * single-attempt adapter and the bounded transport retry. The hold, queue and deduplication
 * decisions remain the notification boundary's (`C-076`).
 */
function buildSms(config: PlatformConfig, http = createFetchHttpClient()): SmsDeliveryPort {
  if (config.sms.provider === 'none') return createUnconfiguredSmsDelivery();

  const { apiUrl, apiKey, senderId } = config.sms;
  if (apiUrl === null || apiKey === null || senderId === null) {
    // The schema requires these when the provider is `http`; reaching here means the two disagree.
    throw new Error(
      'SMS_PROVIDER is "http" but the gateway endpoint, credential or sender is missing',
    );
  }

  const adapter = createSmsDeliveryAdapter(
    createHttpSmsProvider({ endpoint: apiUrl, apiKey, http, timeoutMs: config.sms.timeoutMs }),
    senderId,
  );

  return withBoundedBackoff(adapter, {
    maxAttempts: config.sms.maxAttempts,
    baseDelayMs: config.sms.backoffBaseMs,
    maxDelayMs: config.sms.backoffMaxMs,
    sleep: waitWithTimer,
  });
}

/**
 * Build the platform bundle.
 *
 * @param config - A validated configuration. Defaults to loading `process.env` once.
 */
export function createPlatform(config: PlatformConfig = loadConfig()): Platform {
  const clock = createSystemClock();
  const http = createFetchHttpClient();
  const redis = createRedisConnection(config.redisUrl);
  const cache = createRedisCacheStore(redis.commands);
  const sms = buildSms(config, http);

  // Sessions get a connection of their own, as the adapter requires: an eviction storm on cached pages
  // must not take sign-in with it (`NFR-026`).
  const sessions = createSessionCapabilityFromUrl({ config, sms, clock }, config.redisUrl);

  const storageClient = createS3Client({
    endpoint: config.storage.endpoint,
    region: config.storage.region,
    bucket: config.storage.bucket,
    accessKeyId: config.storage.accessKeyId,
    secretAccessKey: config.storage.secretAccessKey,
    forcePathStyle: config.storage.forcePathStyle,
    http,
    clock,
  });

  const storage = createObjectStorage(
    storageClient,
    createSignedReadUrl({
      client: storageClient,
      maxTtlSeconds: config.storage.signedUrlTtlSeconds,
    }),
  );

  return {
    config,
    clock,
    ids: createIdFactory({ clock }),
    sms,
    storage,
    cache,
    cacheInvalidation: createCacheInvalidator(cache),
    featureFlags: config.featureFlags,
    sessions,
    // Sessions close before the cache: a session read during shutdown must report degraded rather than
    // wait on a Redis the bundle has already released.
    close: async () => {
      await sessions.close();
      await redis.close();
    },
  };
}

/**
 * Load the environment and build the bundle.
 *
 * The web application and the worker both call this, which is what makes them boot from one
 * validated environment rather than two hand-maintained lists.
 *
 * @param options - Optional environment sources, used by a boot check or a test.
 */
export function createPlatformFromEnvironment(options: LoadConfigOptions = {}): Platform {
  return createPlatform(loadConfig(options));
}
