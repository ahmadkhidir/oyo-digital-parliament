/**
 * The single Vitest setup file (`packages/ui/AGENTS.md`, Tests): jest-dom matchers and a
 * clean DOM between tests. The document language defaults to the English fixture locale; the
 * axe helper sets it per run.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

document.documentElement.lang = 'en';

afterEach(() => {
  cleanup();
});
