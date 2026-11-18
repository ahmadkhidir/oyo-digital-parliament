/**
 * The typed configuration object and the one-load guard.
 *
 * A process parses its environment once. `getConfig` loads on first call and returns the same frozen
 * object afterwards, so a second caller cannot re-read a value that has since changed and cannot end
 * up with a second, differently configured set of adapters. Tests that need a fresh load call
 * `loadConfig` directly with an explicit environment.
 *
 * @module config
 */
import { loadConfig, type PlatformConfig } from './load.ts';

export { ConfigurationError, loadConfig } from './load.ts';
export type {
  CacheTtlConfig,
  LoadConfigOptions,
  ModelCapabilityConfig,
  ModelConfig,
  PlatformConfig,
  SmsConfig,
  StorageConfig,
} from './load.ts';

let loaded: PlatformConfig | null = null;

/**
 * The process configuration, loaded once.
 *
 * @returns The frozen configuration built from `process.env` on the first call.
 * @throws ConfigurationError before anything listens when the environment is invalid.
 */
export function getConfig(): PlatformConfig {
  loaded ??= loadConfig();
  return loaded;
}
