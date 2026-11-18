/**
 * Reading, validating and freezing the configuration (`NFR-024`, `NFR-025`).
 *
 * The environment is parsed exactly once, at the boundary: every value must satisfy its declaration
 * in `schema.ts`, a missing required value or an out-of-range number fails the boot before anything
 * listens, and the result is deeply frozen. `process.env` is read here and nowhere else in this
 * package.
 *
 * Failure messages name the variable and the rule, never the value — several variables are secrets,
 * and a boot log is the last place one may appear. The frozen object also carries a redacted
 * serialisation, so an accidental `console.log(config)`, `JSON.stringify(config)` or structured log
 * of the object prints variable names and `[redacted]`, not credentials.
 *
 * @module config/load
 */
import { readFileSync } from 'node:fs';
import { inspect, parseEnv } from 'node:util';

import {
  crossCheck,
  FEATURE_FLAGS,
  featureFlagVariable,
  MODEL_CAPABILITIES,
  modelVariableSuffix,
  parseVariable,
  RATE_LIMIT_BUCKETS,
  RATE_LIMIT_BUCKET_VARIABLES,
  VARIABLES,
  type FeatureFlagName,
  type ModelCapability,
  type RateLimitBucket,
  type VariableSpec,
} from './schema.ts';

/** A boot-time configuration failure. Carries the problems, never the values they describe. */
export class ConfigurationError extends Error {
  /** One message per variable, each naming the variable and the rule it broke. */
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `Invalid platform configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
    );
    this.name = 'ConfigurationError';
    this.problems = problems;
  }
}

/** The cache lifetimes, one explicit expiry per key family (`C-075`, `C-086`). */
export interface CacheTtlConfig {
  readonly publicPageSeconds: number;
  readonly wardReportSeconds: number;
  readonly commitmentRegisterSeconds: number;
  readonly publicLedgerSeconds: number;
  readonly searchSeconds: number;
}

/** The object-store settings the storage adapter needs. */
export interface StorageConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
  readonly signedUrlTtlSeconds: number;
}

/** The SMS transport settings, with provider-scoped fields absent when no provider is configured. */
export interface SmsConfig {
  readonly provider: 'none' | 'http';
  readonly apiUrl: string | null;
  readonly apiKey: string | null;
  readonly senderId: string | null;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
}

/** One capability's pinned version, timeout and ceiling (`C-078`). */
export interface ModelCapabilityConfig {
  readonly version: string | null;
  readonly timeoutMs: number;
  readonly costCeilingMicrosPerThousand: number;
}

/** The model settings the Inference Gateway reads. */
export interface ModelConfig {
  readonly provider: 'none' | 'http';
  readonly apiUrl: string | null;
  readonly apiKey: string | null;
  readonly region: string | null;
  readonly capabilities: Readonly<Record<ModelCapability, ModelCapabilityConfig>>;
}

/** The session and one-time-code timeouts the adapter enforces (`NFR-026`). */
export interface SessionConfig {
  readonly codeTtlSeconds: number;
  /** The member session's sliding idle timeout, capped by the absolute window the domain supplies. */
  readonly memberIdleSeconds: number;
  /** The staff session's sliding idle timeout, renewed by each authorised request (`C-092`). */
  readonly staffIdleSeconds: number;
}

/** The limiter's fixed window and one cap per bucket (`NFR-027`). */
export interface RateLimitConfig {
  readonly windowSeconds: number;
  readonly caps: Readonly<Record<RateLimitBucket, number>>;
}

/** The worker's probe listener and shutdown settings (`C-091`). */
export interface WorkerConfig {
  readonly host: string;
  readonly port: number;
  readonly shutdownGraceMs: number;
}

/** The validated configuration, frozen and safe to pass to a composition root. */
export interface PlatformConfig {
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly worker: WorkerConfig;
  readonly session: SessionConfig;
  readonly rateLimit: RateLimitConfig;
  readonly cache: CacheTtlConfig;
  readonly storage: StorageConfig;
  readonly sms: SmsConfig;
  readonly model: ModelConfig;
  readonly featureFlags: Readonly<Record<FeatureFlagName, boolean>>;
  /** Serialising the configuration prints names and redactions, never a credential. */
  toJSON(): Record<string, unknown>;
  /** The same redaction, for Node's `console.log`. */
  readonly [inspect.custom]: () => string;
}

/** Where a boot reads its environment from. */
export interface LoadConfigOptions {
  /** The process environment. Defaults to `process.env`; tests pass an explicit record. */
  readonly env?: NodeJS.ProcessEnv;
  /** An optional dotenv-style file. Values from `env` win, as in every dotenv loader. */
  readonly envFile?: string;
}

/** The value record after parsing, keyed by variable name. */
type ParsedValues = Readonly<Record<string, string | number | boolean>>;

/**
 * Read a dotenv file, if it exists.
 *
 * @param path - The file to read.
 * @returns Its values, or an empty record when the file is absent.
 * @throws ConfigurationError when the file exists but cannot be parsed.
 */
function readEnvFile(path: string): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new ConfigurationError([`${path} could not be read`]);
  }
  try {
    const parsed = parseEnv(text);
    const values: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === 'string') values[name] = value;
    }
    return values;
  } catch {
    throw new ConfigurationError([`${path} is not a valid environment file`]);
  }
}

/** Merge the file and the process environment, with the process winning on a non-empty value. */
function mergeSources(
  env: NodeJS.ProcessEnv,
  fileValues: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = { ...fileValues };
  for (const variable of VARIABLES) {
    const fromProcess = env[variable.name];
    if (typeof fromProcess === 'string' && fromProcess !== '') {
      merged[variable.name] = fromProcess;
    }
  }
  return merged;
}

/**
 * Apply one declaration to the merged sources.
 *
 * @returns The accepted value, or `null` when the variable is absent and not required.
 */
function resolveVariable(
  spec: VariableSpec,
  merged: Readonly<Record<string, string>>,
  problems: string[],
): string | number | boolean | null {
  const raw = merged[spec.name];
  const absent = raw === undefined || raw === '';

  if (absent) {
    if (spec.default !== undefined) {
      const parsed = parseVariable(spec, spec.default);
      return parsed.ok ? parsed.value : null;
    }
    const conditionallyRequired = spec.requiredWhen?.(merged) ?? false;
    if (spec.required || conditionallyRequired) {
      problems.push(`${spec.name} is not set`);
    }
    return null;
  }

  const parsed = parseVariable(spec, raw);
  if (!parsed.ok) {
    problems.push(`${spec.name} ${parsed.problem}`);
    return null;
  }
  return parsed.value;
}

/**
 * Read the string form of a parsed variable, refusing a missing or mistyped one.
 *
 * The schema already guarantees the type; reaching this error means the loader and the schema
 * disagree, which is a programming defect, not a configuration problem.
 */
function stringValue(values: ParsedValues, name: string): string {
  const value = values[name];
  if (typeof value !== 'string') throw new Error(`configuration field ${name} is not a string`);
  return value;
}

function numberValue(values: ParsedValues, name: string): number {
  const value = values[name];
  if (typeof value !== 'number') throw new Error(`configuration field ${name} is not a number`);
  return value;
}

function booleanValue(values: ParsedValues, name: string): boolean {
  const value = values[name];
  if (typeof value !== 'boolean') throw new Error(`configuration field ${name} is not a boolean`);
  return value;
}

function optionalString(values: ParsedValues, name: string): string | null {
  const value = values[name];
  if (value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`configuration field ${name} is not a string`);
  return value;
}

/** Build the scalar settings from the parsed values. */
function buildScalars(values: ParsedValues): {
  databaseUrl: string;
  redisUrl: string;
  worker: WorkerConfig;
  session: SessionConfig;
  rateLimit: RateLimitConfig;
  cache: CacheTtlConfig;
  storage: StorageConfig;
  sms: SmsConfig;
  model: ModelConfig;
  featureFlags: Record<FeatureFlagName, boolean>;
} {
  const caps = {} as Record<RateLimitBucket, number>;
  for (const bucket of RATE_LIMIT_BUCKETS) {
    caps[bucket] = numberValue(values, RATE_LIMIT_BUCKET_VARIABLES[bucket]);
  }

  const capabilities = {} as Record<ModelCapability, ModelCapabilityConfig>;
  for (const capability of MODEL_CAPABILITIES) {
    const suffix = modelVariableSuffix(capability);
    capabilities[capability] = Object.freeze({
      version: optionalString(values, `MODEL_VERSION_${suffix}`),
      timeoutMs: numberValue(values, `MODEL_TIMEOUT_MS_${suffix}`),
      costCeilingMicrosPerThousand: numberValue(
        values,
        `MODEL_COST_CEILING_MICROS_PER_THOUSAND_${suffix}`,
      ),
    });
  }

  const featureFlags = {} as Record<FeatureFlagName, boolean>;
  for (const flag of FEATURE_FLAGS) {
    featureFlags[flag] = booleanValue(values, featureFlagVariable(flag));
  }

  return {
    databaseUrl: stringValue(values, 'DATABASE_URL'),
    redisUrl: stringValue(values, 'REDIS_URL'),
    worker: {
      host: stringValue(values, 'WORKER_HOST'),
      port: numberValue(values, 'WORKER_PORT'),
      shutdownGraceMs: numberValue(values, 'WORKER_SHUTDOWN_GRACE_MS'),
    },
    session: {
      codeTtlSeconds: numberValue(values, 'SESSION_CODE_TTL_MINUTES') * 60,
      memberIdleSeconds: numberValue(values, 'SESSION_MEMBER_IDLE_MINUTES') * 60,
      staffIdleSeconds: numberValue(values, 'SESSION_STAFF_IDLE_MINUTES') * 60,
    },
    rateLimit: {
      windowSeconds: numberValue(values, 'RATE_LIMIT_WINDOW_MINUTES') * 60,
      caps,
    },
    cache: {
      publicPageSeconds: numberValue(values, 'CACHE_TTL_PUBLIC_PAGE_SECONDS'),
      wardReportSeconds: numberValue(values, 'CACHE_TTL_WARD_REPORT_SECONDS'),
      commitmentRegisterSeconds: numberValue(values, 'CACHE_TTL_COMMITMENT_REGISTER_SECONDS'),
      publicLedgerSeconds: numberValue(values, 'CACHE_TTL_PUBLIC_LEDGER_SECONDS'),
      searchSeconds: numberValue(values, 'CACHE_TTL_SEARCH_SECONDS'),
    },
    storage: {
      endpoint: stringValue(values, 'S3_ENDPOINT'),
      region: stringValue(values, 'S3_REGION'),
      bucket: stringValue(values, 'S3_BUCKET'),
      accessKeyId: stringValue(values, 'S3_ACCESS_KEY_ID'),
      secretAccessKey: stringValue(values, 'S3_SECRET_ACCESS_KEY'),
      forcePathStyle: booleanValue(values, 'S3_FORCE_PATH_STYLE'),
      signedUrlTtlSeconds: numberValue(values, 'S3_SIGNED_URL_TTL_SECONDS'),
    },
    sms: {
      provider: stringValue(values, 'SMS_PROVIDER') as SmsConfig['provider'],
      apiUrl: optionalString(values, 'SMS_API_URL'),
      apiKey: optionalString(values, 'SMS_API_KEY'),
      senderId: optionalString(values, 'SMS_SENDER_ID'),
      timeoutMs: numberValue(values, 'SMS_TIMEOUT_MS'),
      maxAttempts: numberValue(values, 'SMS_MAX_ATTEMPTS'),
      backoffBaseMs: numberValue(values, 'SMS_BACKOFF_BASE_MS'),
      backoffMaxMs: numberValue(values, 'SMS_BACKOFF_MAX_MS'),
    },
    model: {
      provider: stringValue(values, 'MODEL_PROVIDER') as ModelConfig['provider'],
      apiUrl: optionalString(values, 'MODEL_API_URL'),
      apiKey: optionalString(values, 'MODEL_API_KEY'),
      region: optionalString(values, 'MODEL_REGION'),
      capabilities: Object.freeze(capabilities),
    },
    featureFlags,
  };
}

/**
 * The redacted view of a configuration: names and non-secret values, `[redacted]` for a secret.
 *
 * Built from the schema rather than from a hand-written list, so a variable classified as a secret
 * cannot be forgotten here when it is added.
 */
function redactedView(values: ParsedValues): Record<string, unknown> {
  const view: Record<string, unknown> = {};
  for (const spec of VARIABLES) {
    if (!(spec.name in values)) continue;
    view[spec.name] = spec.secret ? '[redacted]' : values[spec.name];
  }
  return view;
}

/**
 * Load and validate the configuration.
 *
 * @param options - The environment sources. Production passes nothing and reads `process.env`.
 * @returns A deeply frozen configuration whose serialisation is redacted.
 * @throws ConfigurationError when a required value is absent, a value is malformed, a number is out
 *   of range, or a cross-field rule is broken. Nothing is returned partially.
 */
export function loadConfig(options: LoadConfigOptions = {}): PlatformConfig {
  const env = options.env ?? process.env;
  const fileValues = options.envFile === undefined ? {} : readEnvFile(options.envFile);
  const merged = mergeSources(env, fileValues);

  const rawValues: Record<string, string> = {};
  const problems: string[] = [];

  for (const spec of VARIABLES) {
    const resolved = resolveVariable(spec, merged, problems);
    if (resolved === null) continue;
    rawValues[spec.name] = String(resolved);
  }

  if (problems.length === 0) {
    problems.push(...crossCheck(rawValues));
  }
  if (problems.length > 0) {
    throw new ConfigurationError(problems);
  }

  const parsed: Record<string, string | number | boolean> = {};
  for (const spec of VARIABLES) {
    const raw = rawValues[spec.name];
    if (raw === undefined) continue;
    const result = parseVariable(spec, raw);
    if (result.ok) parsed[spec.name] = result.value;
  }

  const scalars = buildScalars(parsed);
  const redacted = Object.freeze(redactedView(parsed));

  const config: PlatformConfig = {
    ...scalars,
    toJSON: () => redacted,
    [inspect.custom]: () => `PlatformConfig ${JSON.stringify(redacted, null, 2)}`,
  };

  // Freeze the nested slices before the outer object so no adapter can mutate a shared setting.
  Object.freeze(config.session);
  Object.freeze(config.rateLimit.caps);
  Object.freeze(config.rateLimit);
  Object.freeze(config.cache);
  Object.freeze(config.storage);
  Object.freeze(config.sms);
  Object.freeze(config.model);
  Object.freeze(config.featureFlags);
  return Object.freeze(config);
}
