/**
 * The shared setup for the web area's suites: the jest-dom matchers and a clean document between
 * tests, as `packages/ui` sets up its own (`apps/web/AGENTS.md` Checks).
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
