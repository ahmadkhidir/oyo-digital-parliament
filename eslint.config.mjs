/**
 * Repository-wide ESLint configuration (ADR-003, `AGENTS.md` Stack: ESLint 9 flat config).
 *
 * One config, at the repository root, so every area is held to the same rules. Four families of rule
 * live here and each one enforces something a type check cannot express:
 *
 * 1. **TypeScript and JavaScript correctness** — the `@eslint/js` and `typescript-eslint` recommended
 *    sets, over `.ts`, `.tsx` and the `.mjs` tooling scripts.
 * 2. **Import boundaries** — `import-x/no-restricted-paths` holds the dependency direction the area
 *    manuals declare: presentation never reaches into the domain, the domain never reaches into
 *    persistence, and no package imports the application. `no-restricted-imports` keeps vendor SDKs
 *    inside the adapter directory that owns them and keeps a database driver out of `apps/web`.
 * 3. **Repository rules** — the area checks written as scans in the manuals, expressed as rules: no
 *    ambient clock, randomness, identifier or environment reads in `packages/domain`/`packages/platform`;
 *    no locale formatting or interface copy in `packages/ui`; interface strings only from the message
 *    catalogue in a component (`odp/no-raw-copy`); and a suppression comment must state its reason
 *    (`eslint-comments/require-description`).
 * 4. **JSX accessibility** — `eslint-plugin-jsx-a11y` over every `.tsx` file, the floor under the WCAG
 *    2.2 AA obligation in `NFR-044`.
 *
 * Paths in the boundary zones are resolved from this file rather than the working directory, because
 * `pnpm --filter` runs an area's lint from inside that area.
 *
 * `eslint-config-prettier` is applied last: formatting is Prettier's (`ADR-003`), never a lint rule.
 */
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const repoRoot = dirname(fileURLToPath(import.meta.url));

/** Resolve a path from the repository root, so a rule does not depend on the working directory. */
const repoPath = (...segments) => resolve(repoRoot, ...segments);

/** Every file ESLint parses with TypeScript. */
const TYPED_FILES = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];

/** Node tooling scripts (the config itself, `scripts/`, `infra/`). */
const SCRIPT_FILES = ['**/*.js', '**/*.mjs', '**/*.cjs'];

/** Everything this configuration lints. */
const SOURCE_FILES = [...TYPED_FILES, ...SCRIPT_FILES];

/**
 * Attributes whose value a reader sees or a screen reader announces. A literal here is interface copy
 * that bypassed the message catalogue, exactly like a literal text node.
 */
const COPY_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'placeholder',
  'title',
]);

/** Any letter, in any script: Yoruba text is as much a violation as English when it is hardcoded. */
const LETTER = /\p{L}/u;

/**
 * The repository's own rules. Kept in this file because they encode this product's discipline and are
 * not general-purpose enough to publish (`ADR-003` names the rule, the area manual states why).
 *
 * @type {import('eslint').ESLint.Plugin}
 */
const odpPlugin = {
  meta: { name: '@odp/eslint-plugin', version: '0.0.0' },
  rules: {
    /**
     * Fails a raw interface string rendered in a component.
     *
     * `apps/web/AGENTS.md` and `packages/ui/AGENTS.md` require every visible string to resolve from the
     * message catalogue for both launch locales, and require the UI package to receive copy as a prop.
     * A literal JSX text node, or a literal copy-bearing attribute, is a string that no translator will
     * ever see, so it fails here rather than in review. Expressions — a prop, a formatted value — are
     * allowed: the rule flags only literals in the markup.
     */
    'no-raw-copy': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Interface copy resolves from the message catalogue, never from a literal in a component',
        },
        schema: [],
        messages: {
          text: 'Raw interface string in JSX: interface copy must resolve from the message catalogue (`apps/web/messages/`), not a literal (ADR-003, NFR-044).',
          attribute:
            'Raw interface string in the "{{attribute}}" attribute: pass translated copy from the message catalogue instead (ADR-003, NFR-044).',
        },
      },
      create(context) {
        return {
          JSXText(node) {
            const text = node.value.trim();
            if (text === '' || !LETTER.test(text)) return;
            context.report({ node, messageId: 'text' });
          },
          JSXAttribute(node) {
            if (node.name.type !== 'JSXIdentifier') return;
            const attribute = node.name.name;
            if (!COPY_ATTRIBUTES.has(attribute)) return;
            const value = node.value;
            if (value === null || value.type !== 'Literal' || typeof value.value !== 'string')
              return;
            if (!LETTER.test(value.value)) return;
            context.report({ node: value, messageId: 'attribute', data: { attribute } });
          },
        };
      },
    },
  },
};

/**
 * The dependency direction each area manual declares, as import-boundary zones. A zone fails an import
 * in `target` that resolves inside `from`; the reverse direction stays open, which is what the port
 * pattern needs (persistence imports the domain, never the other way round).
 */
const boundaryZones = [
  {
    target: repoPath('packages/ui'),
    from: repoPath('packages/domain'),
    message:
      'packages/ui is presentation only and never imports the domain (packages/ui/AGENTS.md Discipline).',
  },
  {
    target: repoPath('packages/ui'),
    from: repoPath('packages/db'),
    message:
      'packages/ui is presentation only and never imports persistence (packages/ui/AGENTS.md Discipline).',
  },
  {
    target: repoPath('packages/ui'),
    from: repoPath('packages/inference'),
    message:
      'packages/ui is presentation only and never imports the inference gateway (packages/ui/AGENTS.md Discipline).',
  },
  {
    target: repoPath('packages/domain'),
    from: repoPath('packages/db'),
    message:
      'packages/domain declares the ports that packages/db implements; it never imports persistence (packages/domain/AGENTS.md).',
  },
  {
    target: repoPath('packages/domain'),
    from: repoPath('packages/platform'),
    message:
      'packages/domain receives adapters through ports and never imports the adapter package (packages/domain/AGENTS.md).',
  },
  {
    target: repoPath('packages/domain'),
    from: repoPath('packages/inference'),
    message:
      'packages/domain never imports the inference gateway; a model call reaches it through a port (packages/domain/AGENTS.md).',
  },
  {
    target: repoPath('packages/inference'),
    from: repoPath('packages/db'),
    message:
      'packages/inference returns a result to its caller and never reads persistence (packages/inference/AGENTS.md).',
  },
  {
    target: repoPath('packages/inference'),
    from: repoPath('packages/ui'),
    message: 'packages/inference has no presentation layer (packages/inference/AGENTS.md Scope).',
  },
  {
    target: repoPath('packages/platform'),
    from: repoPath('packages/db'),
    message:
      'packages/platform adapts external systems and never reads the database directly (packages/platform/AGENTS.md Scope).',
  },
  {
    target: repoPath('packages/platform'),
    from: repoPath('packages/inference'),
    message:
      "packages/platform never reaches a model provider; that is packages/inference's only egress (packages/platform/AGENTS.md Scope).",
  },
  {
    target: repoPath('packages/platform'),
    from: repoPath('packages/ui'),
    message: 'packages/platform has no presentation layer (packages/platform/AGENTS.md Scope).',
  },
  {
    target: repoPath('packages/db'),
    from: repoPath('packages/ui'),
    message: 'packages/db has no presentation layer (packages/db/AGENTS.md Scope).',
  },
  {
    target: repoPath('packages/db'),
    from: repoPath('packages/inference'),
    message:
      'packages/db never reaches a model provider (packages/db/AGENTS.md Scope: it owns PostgreSQL only).',
  },
  {
    target: repoPath('services/worker'),
    from: repoPath('packages/ui'),
    message:
      'services/worker renders nothing and never imports the design system (services/worker/AGENTS.md Scope).',
  },
  {
    target: repoPath('packages/domain'),
    from: repoPath('apps'),
    message:
      'packages/domain is framework-agnostic and never imports the application (packages/domain/AGENTS.md Scope).',
  },
  {
    target: repoPath('packages/db'),
    from: repoPath('apps'),
    message:
      'packages/db is consumed by the application, never the reverse (packages/db/AGENTS.md Scope).',
  },
  {
    target: repoPath('packages/ui'),
    from: repoPath('apps'),
    message:
      'packages/ui is consumed by the application, never the reverse (packages/ui/AGENTS.md Scope).',
  },
  {
    target: repoPath('packages/platform'),
    from: repoPath('apps'),
    message:
      'packages/platform is consumed by the application, never the reverse (packages/platform/AGENTS.md Scope).',
  },
  {
    target: repoPath('packages/inference'),
    from: repoPath('apps'),
    message:
      'packages/inference is consumed by the application, never the reverse (packages/inference/AGENTS.md Scope).',
  },
];

/**
 * The ambient reads a pure package may not perform: every effect arrives through a port and every
 * instant through the injected clock (`packages/domain/AGENTS.md` Discipline, Check "ambient-dependency
 * scan").
 */
const ambientDependencyRules = {
  'no-restricted-syntax': [
    'error',
    {
      selector: "MemberExpression[object.name='process'][property.name='env']",
      message:
        'Configuration arrives through the validated configuration object, never from process.env (packages/platform/AGENTS.md Discipline).',
    },
    {
      selector: "MemberExpression[object.name='Date'][property.name='now']",
      message:
        'Time arrives through the injected clock, never from Date.now() (packages/domain/AGENTS.md).',
    },
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      message:
        'Time arrives through the injected clock, never from new Date() (packages/domain/AGENTS.md).',
    },
    {
      selector: "MemberExpression[object.name='Math'][property.name='random']",
      message:
        'Randomness arrives through an injected source, never Math.random() (packages/domain/AGENTS.md).',
    },
    {
      selector: "CallExpression[callee.name='randomUUID']",
      message:
        'Identifiers come from the identifier port, never randomUUID() (packages/domain/AGENTS.md, packages/platform/AGENTS.md).',
    },
  ],
};

export default tseslint.config(
  {
    // Build output, caches, generated reports and the specification submodule. The specification is
    // never linted from this repository and never edited by a code task (AGENTS.md Boundaries).
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/blob-report/**',
      '**/*.tsbuildinfo',
      'docs/**',
    ],
  },
  {
    files: SOURCE_FILES,
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      'eslint-comments': eslintComments,
      'import-x': importX,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    linterOptions: {
      // A suppression that no longer suppresses anything is dead weight, and dead weight hides drift.
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // A suppression comment must say why it exists (ADR-003; apps/web/AGENTS.md Checks).
      'eslint-comments/require-description': ['error', { ignore: [] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'import-x/no-restricted-paths': ['error', { zones: boundaryZones }],
    },
  },
  {
    // Browser globals belong to the two rendering areas only. Everything else runs on Node.
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // `apps/web/lib/telemetry/*.test.ts` and the area test suites stay Node-side.
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // JSX accessibility on every rendering file (NFR-044).
    files: ['apps/web/**/*.tsx', 'packages/ui/**/*.tsx'],
    extends: [jsxA11y.flatConfigs.recommended],
  },
  {
    // Interface copy resolves from the message catalogue. Test fixtures and the catalogues themselves
    // legitimately hold literals; shipped components do not.
    files: ['apps/web/**/*.tsx', 'packages/ui/src/**/*.tsx'],
    ignores: ['apps/web/messages/**', '**/*.test.tsx', '**/test/**'],
    plugins: { odp: odpPlugin },
    rules: { 'odp/no-raw-copy': 'error' },
  },
  {
    // packages/domain: no ambient effects at all (packages/domain/AGENTS.md Checks: the scan covers
    // `src`, tests included).
    files: ['packages/domain/src/**/*.ts'],
    rules: ambientDependencyRules,
  },
  {
    // packages/domain may not import a framework, a driver, a vendor SDK or another adapter package
    // (packages/domain/AGENTS.md Check "Import-boundary scan").
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'next',
                'next/*',
                'react',
                'react-dom',
                'pg',
                'pg/*',
                'drizzle-orm',
                'drizzle-orm/*',
                'redis',
                'redis/*',
                'axios',
                'node-fetch',
                'express',
                'fastify',
                'aws-sdk',
                '@aws-sdk/*',
                'node:fs',
                'node:http',
                'node:https',
                'node:net',
                'node:child_process',
                '@odp/db',
                '@odp/platform',
                '@odp/inference',
                '@odp/ui',
                '@odp/web',
              ],
              message:
                'packages/domain is framework-agnostic and effect-driven: reach the outside world through a port (packages/domain/AGENTS.md Discipline).',
            },
          ],
        },
      ],
    },
  },
  {
    // packages/platform: configuration is read once, in src/config; the clock and ids own time and
    // identity (packages/platform/AGENTS.md Checks).
    files: ['packages/platform/src/**/*.ts'],
    ignores: ['**/*.test.ts', 'packages/platform/src/config/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            'process.env is read once, in src/config/, and nowhere after boot (packages/platform/AGENTS.md).',
        },
      ],
    },
  },
  {
    // Vendor SDKs stay inside the adapter directory that owns them; the rest of the workspace reaches
    // the system through the port bundle (packages/platform/AGENTS.md Discipline).
    files: ['packages/platform/src/**/*.ts'],
    ignores: ['packages/platform/src/adapters/**', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'redis',
                'redis/*',
                'ioredis',
                'aws-sdk',
                '@aws-sdk/*',
                'twilio',
                '@sendgrid/*',
                'nodemailer',
                '@odp/db',
                '@odp/inference',
                '@odp/ui',
                '@odp/web',
              ],
              message:
                'A vendor SDK is imported only inside src/adapters/ (packages/platform/AGENTS.md Discipline).',
            },
          ],
        },
      ],
    },
  },
  {
    // One egress: provider SDKs only in src/adapters/ (packages/inference/AGENTS.md Discipline).
    files: ['packages/inference/src/**/*.ts'],
    ignores: ['packages/inference/src/adapters/**', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'openai',
                '@anthropic-ai/*',
                '@google/*',
                '@mistralai/*',
                'cohere-ai',
                'groq-sdk',
                'ollama',
                'axios',
                'node-fetch',
                '@odp/db',
                '@odp/platform',
                '@odp/ui',
                '@odp/web',
              ],
              message:
                'Model provider SDKs are imported only inside src/adapters/ (packages/inference/AGENTS.md Discipline).',
            },
          ],
        },
      ],
    },
  },
  {
    // packages/ui: presentation only — no domain, persistence, gateway, framework data APIs or locale
    // formatting (packages/ui/AGENTS.md Checks "Boundary audit" and "Copy and format audit").
    files: ['packages/ui/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', 'packages/ui/src/test/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@odp/domain',
                '@odp/db',
                '@odp/inference',
                '@odp/platform',
                '@odp/web',
                'next',
                'next/*',
                'pg',
                'drizzle-orm',
                'redis',
              ],
              message:
                'packages/ui renders resolved props and imports none of the domain, persistence, gateway or framework data APIs (packages/ui/AGENTS.md Discipline).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "Identifier[name='Intl']",
          message:
            'Locale formatting belongs to the caller; packages/ui formats nothing (packages/ui/AGENTS.md Discipline).',
        },
        {
          selector: "MemberExpression[property.name='toLocaleString']",
          message:
            'Locale formatting belongs to the caller; packages/ui formats nothing (packages/ui/AGENTS.md Discipline).',
        },
        {
          selector: "Identifier[name='fetch']",
          message:
            'packages/ui fetches nothing; data arrives as props (packages/ui/AGENTS.md Discipline).',
        },
      ],
    },
  },
  {
    // The application never opens the database itself: reads and writes go through the read contract's
    // domain boundary and the repositories packages/db exports (ADR-003, apps/web/AGENTS.md Discipline).
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pg', 'pg/*', 'drizzle-orm', 'drizzle-orm/*', 'drizzle-kit'],
              message:
                'Direct database access belongs to packages/db; apps/web reaches data through a contract (ADR-003, apps/web/AGENTS.md Discipline).',
            },
          ],
        },
      ],
    },
  },
  {
    // Persistence is consumed by the application; it renders nothing and reaches no model.
    files: ['packages/db/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'next',
                'next/*',
                'react',
                'react-dom',
                '@odp/ui',
                '@odp/inference',
                '@odp/web',
              ],
              message:
                'packages/db owns PostgreSQL and the repositories packages/domain declares; it never renders or calls a model (packages/db/AGENTS.md Scope).',
            },
          ],
        },
      ],
    },
  },
  {
    // The worker serves no browser request (services/worker/AGENTS.md Scope).
    files: ['services/worker/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@odp/ui', '@odp/web', 'react', 'react-dom', 'next', 'next/*'],
              message:
                'services/worker serves no browser request and imports no presentation layer (services/worker/AGENTS.md Scope).',
            },
          ],
        },
      ],
    },
  },
  // Formatting is Prettier's; this must stay last so it can switch off every stylistic rule above.
  prettier,
);
