/**
 * The one configuration schema (`NFR-024`, `NFR-045`, `C-076`, `C-078`).
 *
 * Every variable the application or the worker reads is declared here once — its group, its type,
 * whether a value is required, whether it is a secret, its permitted range or enum, and the local
 * placeholder that `infra/local/environment.mjs` renders into `.env.example`. Adding a variable
 * starts here; the loader, the local environment contract and the example file all read this list,
 * so they cannot drift apart.
 *
 * Two rules shape the declarations:
 *
 * - A secret has no default and no fallback literal. A missing secret is a failed boot, never a
 *   silently degraded provider (`packages/platform/AGENTS.md` Discipline).
 * - A provider that is not configured is named as such (`none`), not imitated. The SMS and model
 *   adapters then hold or skip work instead of fabricating a delivery or an inference result.
 *
 * Nothing in this module reads the environment. `process.env` appears only in `load.ts`, and the
 * values here are inert declarations so the local tooling can import them from plain Node.
 *
 * @module config/schema
 */

/** The headings the rendered example file uses, in order. */
export type ConfigGroup = 'postgres' | 'redis' | 'cache' | 'storage' | 'sms' | 'model' | 'flags';

/** The shape a value must have. */
export type VariableKind = 'text' | 'url' | 'integer' | 'boolean' | 'enum' | 'bucket';

/** One declared variable. */
export interface VariableSpec {
  /** The exact environment variable name. */
  readonly name: string;
  readonly group: ConfigGroup;
  /** A one-line statement of what the variable configures, rendered above it in `.env.example`. */
  readonly description: string;
  /** True when a log, an error or an inspection must never echo the value. */
  readonly secret: boolean;
  readonly kind: VariableKind;
  /** True when a missing value fails the boot. A variable with a default is never `required`. */
  readonly required: boolean;
  /** The value used when the variable is absent. Only ever set on a non-secret variable. */
  readonly default?: string;
  /** Permitted schemes for a `url` variable. */
  readonly protocols?: readonly string[];
  /** For a `url` variable: whether the path must name something (a database). */
  readonly requiresPath?: boolean;
  /** Inclusive range for an `integer` variable. */
  readonly min?: number;
  readonly max?: number;
  /** Permitted spellings for an `enum` variable. */
  readonly values?: readonly string[];
  /**
   * A requirement that depends on another variable — a provider's credentials are required only when
   * that provider is selected. Evaluated against the raw, already-parsed string values.
   */
  readonly requiredWhen?: (values: Readonly<Record<string, string>>) => boolean;
}

/** A provider selected but not configured still boots; it reports held work instead of faking it. */
const smsEnabled = (values: Readonly<Record<string, string>>): boolean =>
  values.SMS_PROVIDER === 'http';

const modelEnabled = (values: Readonly<Record<string, string>>): boolean =>
  values.MODEL_PROVIDER === 'http';

/**
 * The model-backed capabilities, spelled as `C-078` and `analytics.md` spell them.
 *
 * Each one carries its own pinned version, timeout and cost ceiling (`NFR-050` to `NFR-053`), so the
 * gateway never borrows another capability's contract.
 */
export const MODEL_CAPABILITIES = [
  'similar_submission',
  'ward_candidate',
  'moderation_routing',
  'budget_line_extraction',
] as const;

/** One model-backed capability name. */
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

/**
 * The feature flags `release.md` declares, with an environment default.
 *
 * The default is the flag's launch state: every one of the seven starts off. The operator console
 * (`C-069`) changes the live state; this variable seeds an environment so a fresh deployment does not
 * inherit a previous one's switches.
 */
export const FEATURE_FLAGS = [
  'ward_candidate_suggestions',
  'similar_submission_suggestions',
  'moderation_routing',
  'assisted_intake',
  'budget_line_extraction',
  'report_card_workbench',
  'session_reservations',
] as const;

/** One declared feature flag. */
export type FeatureFlagName = (typeof FEATURE_FLAGS)[number];

/** The environment variable that seeds one feature flag. */
export function featureFlagVariable(flag: FeatureFlagName): string {
  return `FEATURE_${flag.toUpperCase()}`;
}

/**
 * The model variable suffixes, per capability, so the four triples are declared in a loop rather
 * than copied out sixteen times.
 */
const MODEL_VARIABLE_SUFFIX = {
  similar_submission: 'SIMILAR_SUBMISSION',
  ward_candidate: 'WARD_CANDIDATE',
  moderation_routing: 'MODERATION_ROUTING',
  budget_line_extraction: 'BUDGET_LINE_EXTRACTION',
} as const satisfies Record<ModelCapability, string>;

/** The variable-name suffix for one capability, used by the schema and by the loader. */
export function modelVariableSuffix(capability: ModelCapability): string {
  return MODEL_VARIABLE_SUFFIX[capability];
}

/** The per-1,000-unit ceiling in USD micros, from `NFR-050` to `NFR-053`. */
const MODEL_COST_CEILING_DEFAULT_MICROS: Record<ModelCapability, string> = {
  // NFR-050 and NFR-051: $0.05 per 1,000 units.
  similar_submission: '50000',
  ward_candidate: '50000',
  // NFR-052: $0.10 per 1,000 classifications.
  moderation_routing: '100000',
  // NFR-053: $0.50 per 1,000 extractions.
  budget_line_extraction: '500000',
};

/** The timeout `C-078` prints for a capability call. */
const MODEL_TIMEOUT_DEFAULT_MS = '1500';

/** Declarations for the three model variables that exist once per capability. */
function modelCapabilityVariables(): VariableSpec[] {
  return MODEL_CAPABILITIES.flatMap((capability) => {
    const suffix = MODEL_VARIABLE_SUFFIX[capability];
    return [
      {
        name: `MODEL_VERSION_${suffix}`,
        group: 'model',
        description: `Pinned model version for the ${capability} capability (C-078, NFR-050 to NFR-053).`,
        secret: false,
        kind: 'text',
        required: false,
        requiredWhen: modelEnabled,
      },
      {
        name: `MODEL_TIMEOUT_MS_${suffix}`,
        group: 'model',
        description: `Per-call timeout for ${capability}, in milliseconds; C-078 rewrites the caller's value from it.`,
        secret: false,
        kind: 'integer',
        required: false,
        default: MODEL_TIMEOUT_DEFAULT_MS,
        min: 100,
        max: 30000,
      },
      {
        name: `MODEL_COST_CEILING_MICROS_PER_THOUSAND_${suffix}`,
        group: 'model',
        description: `Spend ceiling for ${capability} in USD micros per 1,000 units (NFR-050 to NFR-053).`,
        secret: false,
        kind: 'integer',
        required: false,
        default: MODEL_COST_CEILING_DEFAULT_MICROS[capability],
        min: 1,
        max: 1_000_000_000,
      },
    ];
  });
}

/** The declarations for the seven feature flags, all off by default (`release.md`). */
function featureFlagVariables(): VariableSpec[] {
  return FEATURE_FLAGS.map((flag) => ({
    name: featureFlagVariable(flag),
    group: 'flags' as const,
    description: `Launch state for the ${flag} flag; the operator console changes the live value (C-069).`,
    secret: false,
    kind: 'boolean' as const,
    required: false,
    default: 'false',
  }));
}

/**
 * Every variable, in the order `.env.example` renders them.
 *
 * The order is the dotted line an operator reads: the database, the cache, the bucket, the SMS
 * gateway, the model gateway, then the flags.
 */
export const VARIABLES: readonly VariableSpec[] = [
  {
    name: 'DATABASE_URL',
    group: 'postgres',
    description:
      'Connection string for the Primary Database; used by the app, the worker and drizzle-kit.',
    secret: true,
    kind: 'url',
    required: true,
    protocols: ['postgres:', 'postgresql:'],
    requiresPath: true,
  },
  {
    name: 'REDIS_URL',
    group: 'redis',
    description:
      'Read cache, session store and rate-limit counters. Treated as a secret because a managed URL carries a password.',
    secret: true,
    kind: 'url',
    required: true,
    protocols: ['redis:', 'rediss:'],
    requiresPath: false,
  },
  {
    name: 'CACHE_TTL_PUBLIC_PAGE_SECONDS',
    group: 'cache',
    description:
      'Lifetime of a cached public page. Short: NFR-001 measures the read path, and a publication invalidates the page explicitly.',
    secret: false,
    kind: 'integer',
    required: false,
    default: '60',
    min: 5,
    max: 900,
  },
  {
    name: 'CACHE_TTL_WARD_REPORT_SECONDS',
    group: 'cache',
    description: 'Lifetime of a cached ward report read (NFR-002).',
    secret: false,
    kind: 'integer',
    required: false,
    default: '300',
    min: 5,
    max: 3600,
  },
  {
    name: 'CACHE_TTL_COMMITMENT_REGISTER_SECONDS',
    group: 'cache',
    description: 'Lifetime of a cached commitment register read.',
    secret: false,
    kind: 'integer',
    required: false,
    default: '120',
    min: 5,
    max: 3600,
  },
  {
    name: 'CACHE_TTL_PUBLIC_LEDGER_SECONDS',
    group: 'cache',
    description: 'Lifetime of a cached public ledger page (NFR-003).',
    secret: false,
    kind: 'integer',
    required: false,
    default: '120',
    min: 5,
    max: 3600,
  },
  {
    name: 'CACHE_TTL_SEARCH_SECONDS',
    group: 'cache',
    description: 'Lifetime of a cached search result page (NFR-009).',
    secret: false,
    kind: 'integer',
    required: false,
    default: '60',
    min: 5,
    max: 900,
  },
  {
    name: 'S3_ENDPOINT',
    group: 'storage',
    description:
      'S3-compatible endpoint for the object store (exports, report cards, handover snapshot, evaluation artefacts).',
    secret: false,
    kind: 'url',
    required: true,
    protocols: ['http:', 'https:'],
    requiresPath: false,
  },
  {
    name: 'S3_REGION',
    group: 'storage',
    description: 'Region the client signs requests with.',
    secret: false,
    kind: 'text',
    required: true,
  },
  {
    name: 'S3_BUCKET',
    group: 'storage',
    description:
      'Private bucket. Nothing in it is publicly readable; reads go through a signed URL.',
    secret: false,
    kind: 'bucket',
    required: true,
  },
  {
    name: 'S3_ACCESS_KEY_ID',
    group: 'storage',
    description: 'Access key for the object store.',
    secret: true,
    kind: 'text',
    required: true,
  },
  {
    name: 'S3_SECRET_ACCESS_KEY',
    group: 'storage',
    description: 'Secret key for the object store.',
    secret: true,
    kind: 'text',
    required: true,
  },
  {
    name: 'S3_FORCE_PATH_STYLE',
    group: 'storage',
    description:
      'true when the endpoint is an address rather than a per-bucket hostname, which is the case for the local store.',
    secret: false,
    kind: 'boolean',
    required: true,
  },
  {
    name: 'S3_SIGNED_URL_TTL_SECONDS',
    group: 'storage',
    description:
      'Lifetime of a signed read URL, in seconds. Short by design: C-036 mints one URL for one object, for one reader.',
    secret: false,
    kind: 'integer',
    required: false,
    default: '900',
    min: 60,
    max: 604800,
  },
  {
    name: 'SMS_PROVIDER',
    group: 'sms',
    description:
      'SMS gateway behind the provider port. "none" holds every message with PROVIDER_NOT_CONFIGURED rather than pretending to deliver it.',
    secret: false,
    kind: 'enum',
    required: false,
    default: 'none',
    values: ['none', 'http'],
  },
  {
    name: 'SMS_API_URL',
    group: 'sms',
    description:
      'Gateway endpoint the HTTP SMS adapter posts to. Required when SMS_PROVIDER is "http".',
    secret: false,
    kind: 'url',
    required: false,
    requiredWhen: smsEnabled,
    protocols: ['http:', 'https:'],
    requiresPath: false,
  },
  {
    name: 'SMS_API_KEY',
    group: 'sms',
    description: 'Credential for the SMS gateway. Required when SMS_PROVIDER is "http".',
    secret: true,
    kind: 'text',
    required: false,
    requiredWhen: smsEnabled,
  },
  {
    name: 'SMS_SENDER_ID',
    group: 'sms',
    description:
      'Approved sender name the gateway shows the recipient. Required when SMS_PROVIDER is "http".',
    secret: false,
    kind: 'text',
    required: false,
    requiredWhen: smsEnabled,
  },
  {
    name: 'SMS_TIMEOUT_MS',
    group: 'sms',
    description: 'Per-attempt timeout for one SMS delivery, in milliseconds.',
    secret: false,
    kind: 'integer',
    required: false,
    default: '8000',
    min: 1000,
    max: 30000,
  },
  {
    name: 'SMS_MAX_ATTEMPTS',
    group: 'sms',
    description:
      'Upper bound on delivery attempts for one message, including the first. The notification boundary owns the hold decision; this bounds the transport retry.',
    secret: false,
    kind: 'integer',
    required: false,
    default: '3',
    min: 1,
    max: 5,
  },
  {
    name: 'SMS_BACKOFF_BASE_MS',
    group: 'sms',
    description: 'First retry delay in milliseconds; each further attempt doubles it.',
    secret: false,
    kind: 'integer',
    required: false,
    default: '500',
    min: 100,
    max: 5000,
  },
  {
    name: 'SMS_BACKOFF_MAX_MS',
    group: 'sms',
    description: 'Ceiling on a single retry delay, in milliseconds.',
    secret: false,
    kind: 'integer',
    required: false,
    default: '4000',
    min: 100,
    max: 30000,
  },
  {
    name: 'MODEL_PROVIDER',
    group: 'model',
    description:
      'Model provider behind the Inference Gateway. "none" switches every capability to its deterministic fallback.',
    secret: false,
    kind: 'enum',
    required: false,
    default: 'none',
    values: ['none', 'http'],
  },
  {
    name: 'MODEL_API_URL',
    group: 'model',
    description:
      'Provider endpoint the Inference Gateway calls. Required when MODEL_PROVIDER is "http".',
    secret: false,
    kind: 'url',
    required: false,
    requiredWhen: modelEnabled,
    protocols: ['http:', 'https:'],
    requiresPath: false,
  },
  {
    name: 'MODEL_API_KEY',
    group: 'model',
    description: 'Provider credential. Required when MODEL_PROVIDER is "http"; never logged.',
    secret: true,
    kind: 'text',
    required: false,
    requiredWhen: modelEnabled,
  },
  {
    name: 'MODEL_REGION',
    group: 'model',
    description:
      'Processing region named in the privacy notice (NFR-045). Required before inference is enabled, because the transfer is disclosed.',
    secret: false,
    kind: 'text',
    required: false,
    requiredWhen: modelEnabled,
  },
  ...modelCapabilityVariables(),
  ...featureFlagVariables(),
];

/** Every declared variable name, for a completeness assertion in the loader's tests. */
export const VARIABLE_NAMES: readonly string[] = VARIABLES.map((variable) => variable.name);

/** The group headings the example file renders. */
export const GROUP_HEADINGS: Readonly<Record<ConfigGroup, string>> = {
  postgres: 'Primary Database - PostgreSQL 16 (architecture.md: Data Stores)',
  redis: 'Read cache, sessions and rate-limit counters - Redis 7',
  cache: 'Cache lifetimes - one explicit expiry per key family (C-075, C-086)',
  storage: 'Object storage - S3-compatible, private bucket',
  sms: 'SMS gateway - notification boundary transport (C-076)',
  model: 'Inference Gateway - pinned capability configuration (C-078, NFR-045)',
  flags: 'Feature flags - launch state per environment (release.md, C-069)',
};

/** A value the schema accepted. */
export type ParsedValue =
  | { readonly ok: true; readonly value: string | number | boolean }
  | { readonly ok: false; readonly problem: string };

const BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

/** A control character would be invisible in a value an operator reads. */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Validate one raw string against its declaration.
 *
 * A problem message names the rule and never quotes the value, because the value may be a secret
 * (`NFR-024`). Callers prefix it with the variable's name.
 *
 * @param spec - The declaration being satisfied.
 * @param raw - The candidate value, already trimmed by the caller? No: whitespace is checked here.
 * @returns The parsed value, or the reason it was refused.
 */
export function parseVariable(spec: VariableSpec, raw: string): ParsedValue {
  if (raw === '') return { ok: false, problem: 'must not be empty' };

  switch (spec.kind) {
    case 'text': {
      if (hasControlCharacter(raw)) {
        return { ok: false, problem: 'must not contain control characters' };
      }
      if (raw.length > 2048) return { ok: false, problem: 'must be at most 2048 characters' };
      if (raw.trim() === '') return { ok: false, problem: 'must not be whitespace only' };
      return { ok: true, value: raw };
    }

    case 'enum': {
      const values = spec.values ?? [];
      if (!values.includes(raw)) {
        return { ok: false, problem: `must be one of ${values.join(', ')}` };
      }
      return { ok: true, value: raw };
    }

    case 'boolean': {
      if (raw !== 'true' && raw !== 'false')
        return { ok: false, problem: 'must be "true" or "false"' };
      return { ok: true, value: raw === 'true' };
    }

    case 'integer': {
      if (!/^[0-9]+$/.test(raw)) return { ok: false, problem: 'must be a whole number' };
      const value = Number(raw);
      const min = spec.min ?? Number.MIN_SAFE_INTEGER;
      const max = spec.max ?? Number.MAX_SAFE_INTEGER;
      if (!Number.isSafeInteger(value) || value < min || value > max) {
        return { ok: false, problem: `must be between ${min} and ${max}` };
      }
      return { ok: true, value };
    }

    case 'bucket': {
      if (!BUCKET_NAME.test(raw)) {
        return {
          ok: false,
          problem:
            'must be 3-63 lower-case letters, digits, dots or hyphens, starting and ending alphanumeric',
        };
      }
      if (raw.includes('..')) return { ok: false, problem: 'must not contain two adjacent dots' };
      return { ok: true, value: raw };
    }

    case 'url': {
      if (raw !== raw.trim() || /\s/.test(raw)) {
        return { ok: false, problem: 'must not contain whitespace' };
      }
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        return { ok: false, problem: 'is not a valid URL' };
      }
      const protocols = spec.protocols ?? [];
      if (!protocols.includes(url.protocol)) {
        return { ok: false, problem: `must use the ${protocols.join(' or ')} scheme` };
      }
      if (url.hostname === '') return { ok: false, problem: 'must name a host' };
      if (spec.requiresPath === true && url.pathname.replace(/^\//, '') === '') {
        return { ok: false, problem: 'must name a database in its path' };
      }
      return { ok: true, value: raw };
    }

    default:
      return { ok: false, problem: `declares an unknown kind` };
  }
}

/**
 * Cross-field rules that a per-variable check cannot express.
 *
 * Only called once every declared value has passed its own check, and only ever given valid values.
 *
 * @param values - The accepted values, as strings.
 * @returns Problem messages, each naming a variable and never quoting a value.
 */
export function crossCheck(values: Readonly<Record<string, string>>): string[] {
  const problems: string[] = [];

  const base = Number(values.SMS_BACKOFF_BASE_MS ?? '0');
  const max = Number(values.SMS_BACKOFF_MAX_MS ?? '0');
  if (base > max) {
    problems.push('SMS_BACKOFF_BASE_MS must not exceed SMS_BACKOFF_MAX_MS');
  }

  return problems;
}
