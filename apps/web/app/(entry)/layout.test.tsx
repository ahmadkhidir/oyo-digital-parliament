/**
 * The entry shell's language action, as a `C-001` surface (`C-039`, `screens.md` Footer).
 *
 * The footer's language switch is a server action, so it carries the same correlation rule as every
 * other write surface: the caller's `X-Correlation-Id` is read through the shared reader and a
 * malformed value is refused with the failure envelope instead of being replaced by a minted one.
 * The shell is rendered with the footer stubbed, which is how the test reaches the action React
 * would otherwise invoke on submit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/** The action the footer receives, captured from the rendered shell. */
type FooterAction = (formData: FormData) => Promise<unknown>;

/** The `C-001` failure envelope a direct caller receives through the action's `void` surface. */
interface FailureAnswer {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly cause: string;
    readonly correlationId: string;
    readonly fields: Readonly<Record<string, string>>;
  };
  readonly meta: {
    readonly rateLimit: {
      readonly limit: number;
      readonly remaining: number;
      readonly resetAt: string;
    };
  };
}

/** The request facts and locale cookie a test inspects; swapped per test. */
const holder = vi.hoisted(() => ({
  headers: new Headers(),
  jar: new Map<string, string>(),
  action: null as null | ((formData: FormData) => Promise<unknown>),
}));

vi.mock('next/headers', () => ({
  headers: async () => holder.headers,
  cookies: async () => ({
    get: (name: string) => {
      const value = holder.jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      holder.jar.set(name, value);
    },
  }),
}));

vi.mock('@odp/ui', () => ({
  focusRingClasses: 'ring',
  RecordFooter: ({
    languageSwitch,
  }: {
    readonly languageSwitch: { readonly action: (formData: FormData) => Promise<unknown> };
  }) => {
    holder.action = languageSwitch.action;
    return null;
  },
}));

import EntryLayout from './layout';

/** A form with the field the footer posts. */
function formWith(locale: string): FormData {
  const form = new FormData();
  form.set('locale', locale);
  return form;
}

/** Renders the shell and returns the action its footer was given. */
async function footerAction(): Promise<FooterAction> {
  render(await EntryLayout({ children: null }));
  if (holder.action === null) throw new Error('the footer received no action');
  return holder.action;
}

describe('the entry shell language action (C-039, C-001)', () => {
  beforeEach(() => {
    holder.headers = new Headers();
    holder.jar.clear();
    holder.action = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a malformed X-Correlation-Id with the C-001 failure envelope (C-001)', async () => {
    holder.headers = new Headers({ 'x-correlation-id': 'not-a-correlation-id' });
    const action = await footerAction();

    const answer = (await action(formWith('yo-NG'))) as FailureAnswer;

    expect(answer.ok).toBe(false);
    expect(answer.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      cause: 'CORRELATION_ID_INVALID',
      fields: { 'X-Correlation-Id': 'PATTERN_MISMATCH' },
    });
    // The refused value is never echoed: the refusal is labelled with a minted identifier.
    expect(answer.error.correlationId).toMatch(/^req_[0-9A-Z]{4,32}$/);
    expect(answer.meta.rateLimit).toMatchObject({ limit: 120, remaining: 120 });
    expect(answer.meta.rateLimit.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    // A refused call stores nothing: the previous language stays in force.
    expect(holder.jar.has('odp_locale')).toBe(false);
  });

  it('admits a contract-shaped identifier and stores the choice (C-039)', async () => {
    holder.headers = new Headers({ 'x-correlation-id': 'req_01J9Z6M2V4' });
    const action = await footerAction();

    await action(formWith('yo-NG'));

    expect(holder.jar.get('odp_locale')).toBe('yo-NG');
  });
});
