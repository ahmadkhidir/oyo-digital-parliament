/**
 * The registry mirrors `analytics.md` Event Taxonomy (`EVT-001` to `EVT-048`, `C-089`).
 *
 * The table below is the taxonomy's event-to-id mapping written out by hand. If an event is renamed,
 * added or dropped in the specification without this registry following, one of these assertions
 * fails, which is the only way a closed vocabulary stays closed.
 */
import { describe, expect, it } from 'vitest';

import {
  ANALYTICS_EVENTS,
  ANALYTICS_EVENT_NAMES,
  analyticsEventDefinition,
  isAnalyticsEventName,
} from './events.ts';

/** The taxonomy, in the order `analytics.md` lists it. */
const TAXONOMY: ReadonlyArray<readonly [string, string]> = [
  ['screen_viewed', 'EVT-001'],
  ['sign_in_started', 'EVT-002'],
  ['number_confirmed', 'EVT-003'],
  ['account_registered', 'EVT-004'],
  ['identity_state_changed', 'EVT-005'],
  ['ward_candidate_suggested', 'EVT-006'],
  ['ward_confirmed', 'EVT-007'],
  ['ward_sent_for_review', 'EVT-008'],
  ['ward_review_resolved', 'EVT-009'],
  ['submission_drafted', 'EVT-010'],
  ['similar_submission_shown', 'EVT-011'],
  ['submission_published', 'EVT-012'],
  ['submission_publish_failed', 'EVT-013'],
  ['duplicate_choice_recorded', 'EVT-014'],
  ['backing_recorded', 'EVT-015'],
  ['backing_withdrawn', 'EVT-016'],
  ['backing_voided', 'EVT-017'],
  ['assisted_intake_recorded', 'EVT-018'],
  ['assisted_intake_held', 'EVT-019'],
  ['comment_posted', 'EVT-020'],
  ['comment_held_for_legal', 'EVT-021'],
  ['comment_removed', 'EVT-022'],
  ['comment_restored', 'EVT-023'],
  ['removal_invalidated', 'EVT-024'],
  ['appeal_submitted', 'EVT-025'],
  ['decision_published', 'EVT-026'],
  ['submission_overdue', 'EVT-027'],
  ['commitment_status_changed', 'EVT-028'],
  ['budget_line_confirmed', 'EVT-029'],
  ['budget_line_rejected', 'EVT-030'],
  ['ward_report_viewed', 'EVT-031'],
  ['report_card_published', 'EVT-032'],
  ['session_reservation_created', 'EVT-033'],
  ['session_question_submitted', 'EVT-034'],
  ['session_record_published', 'EVT-035'],
  ['data_request_created', 'EVT-036'],
  ['data_request_completed', 'EVT-037'],
  ['model_request_completed', 'EVT-038'],
  ['model_suggestion_accepted', 'EVT-039'],
  ['model_suggestion_rejected', 'EVT-040'],
  ['model_fallback_triggered', 'EVT-041'],
  ['registration_started', 'EVT-042'],
  ['legal_review_requested', 'EVT-043'],
  ['legal_review_decided', 'EVT-044'],
  ['takedown_published', 'EVT-045'],
  ['consent_changed', 'EVT-046'],
  ['residence_review_completed', 'EVT-047'],
  ['decision_draft_saved', 'EVT-048'],
];

describe('analytics taxonomy', () => {
  it('declares exactly the events analytics.md tabulates', () => {
    expect(ANALYTICS_EVENT_NAMES.slice().sort()).toEqual(TAXONOMY.map(([name]) => name).sort());
  });

  it('maps each event name to its EVT id', () => {
    for (const [name, evt] of TAXONOMY) {
      const definition = analyticsEventDefinition(name);
      expect(definition, name).toBeDefined();
      expect(definition?.evt, name).toBe(evt);
      expect(definition?.name, name).toBe(name);
    }
  });

  it('uses every EVT id once', () => {
    const ids = Object.values(ANALYTICS_EVENTS).map((definition) => definition.evt);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(48);
  });

  it('requires a correlation id on the four model events and on a failure event only', () => {
    const requiring = Object.values(ANALYTICS_EVENTS)
      .filter((definition) => definition.requiresCorrelationId)
      .map((definition) => definition.evt)
      .sort();
    expect(requiring).toEqual(['EVT-013', 'EVT-038', 'EVT-039', 'EVT-040', 'EVT-041']);
  });

  it('declares a bounded value domain for every property, and never a prose field', () => {
    for (const definition of Object.values(ANALYTICS_EVENTS)) {
      for (const [key, kind] of Object.entries(definition.properties as Record<string, { type: string }>)) {
        expect(Object.keys(definition.properties), `${definition.name}.${key}`).toContain(key);
        expect(
          ['boolean', 'integer', 'enum', 'token', 'identifier', 'quarter'],
          `${definition.name}.${key}`,
        ).toContain(kind.type);
      }
    }
  });

  it('declares every enum property with at least one value', () => {
    for (const definition of Object.values(ANALYTICS_EVENTS)) {
      for (const [key, kind] of Object.entries(
        definition.properties as Record<string, { type: string; values?: readonly string[] }>,
      )) {
        if (kind.type === 'enum') expect(kind.values?.length ?? 0, `${definition.name}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('recognises declared names and refuses anything else', () => {
    expect(isAnalyticsEventName('screen_viewed')).toBe(true);
    expect(isAnalyticsEventName('screen_view')).toBe(false);
    expect(isAnalyticsEventName('__proto__')).toBe(false);
    expect(isAnalyticsEventName(7)).toBe(false);
  });
});
