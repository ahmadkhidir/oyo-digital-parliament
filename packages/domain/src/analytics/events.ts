/**
 * The analytics event taxonomy (`analytics.md` Event Taxonomy, `C-089`).
 *
 * One entry per `EVT-###`: the event name, the properties `analytics.md` tabulates for it, and
 * whether `C-089` requires a `correlation_id`. The payload interfaces next to each entry are what
 * call sites are typed against, so an event emitted with a misspelled or invented property fails to
 * compile. The registry's `properties` map is what the same event is validated against at run time,
 * so a payload assembled from untyped input (a route handler's JSON body) fails before it is sent.
 *
 * Adding an event or a property is a change to `analytics.md` first. This file mirrors the table; it
 * never extends it, because an unlisted property is by definition not a measurement the campaign has
 * said it collects.
 */
import {
  booleanKind,
  enumKind,
  identifierKind,
  integerKind,
  quarterKind,
  tokenKind,
  type KindFor,
} from './kinds.ts';

/** Every declared analytics event id. */
export type EvtId =
  | 'EVT-001'
  | 'EVT-002'
  | 'EVT-003'
  | 'EVT-004'
  | 'EVT-005'
  | 'EVT-006'
  | 'EVT-007'
  | 'EVT-008'
  | 'EVT-009'
  | 'EVT-010'
  | 'EVT-011'
  | 'EVT-012'
  | 'EVT-013'
  | 'EVT-014'
  | 'EVT-015'
  | 'EVT-016'
  | 'EVT-017'
  | 'EVT-018'
  | 'EVT-019'
  | 'EVT-020'
  | 'EVT-021'
  | 'EVT-022'
  | 'EVT-023'
  | 'EVT-024'
  | 'EVT-025'
  | 'EVT-026'
  | 'EVT-027'
  | 'EVT-028'
  | 'EVT-029'
  | 'EVT-030'
  | 'EVT-031'
  | 'EVT-032'
  | 'EVT-033'
  | 'EVT-034'
  | 'EVT-035'
  | 'EVT-036'
  | 'EVT-037'
  | 'EVT-038'
  | 'EVT-039'
  | 'EVT-040'
  | 'EVT-041'
  | 'EVT-042'
  | 'EVT-043'
  | 'EVT-044'
  | 'EVT-045'
  | 'EVT-046'
  | 'EVT-047'
  | 'EVT-048';

/*
 * Closed value sets, spelled exactly as the record spells them. Each cites the schema entity the
 * event reports on, so a renamed enum value shows up as a failing test here rather than as an
 * unreadable dashboard row.
 */

/** `schema.md` Member.identityState. */
export const IDENTITY_STATES = ['registered', 'checked'] as const;
/** `schema.md` Member.verificationMethod. */
export const VERIFICATION_METHODS = ['self_code', 'organiser_attestation'] as const;
/** `schema.md` Member.locale and PendingRegistration.locale. */
export const ANALYTICS_LOCALES = ['en-NG', 'yo-NG'] as const;
export type AnalyticsLocale = (typeof ANALYTICS_LOCALES)[number];
/** `schema.md` Submission.type. */
export const SUBMISSION_TYPES = ['issue', 'proposal'] as const;
/** `schema.md` Submission.pillar. */
export const PILLARS = [
  'local_government_autonomy',
  'infrastructure',
  'health',
  'education',
  'economy_and_jobs',
  'agriculture_and_minerals',
  'security',
] as const;
/** `schema.md` Submission.locationScope. */
export const LOCATION_SCOPES = ['in_state', 'out_of_state'] as const;
/** `schema.md` Submission.source, which is how a submission was recorded. */
export const SUBMISSION_SOURCES = ['web', 'assisted_intake'] as const;
/** `schema.md` Comment.routingFlag. */
export const COMMENT_ROUTING_FLAGS = [
  'ordinary',
  'abuse_or_threat',
  'named_allegation',
  'spam',
] as const;
/** `schema.md` Decision.type. */
export const DECISION_TYPES = ['commit', 'decline', 'refer'] as const;
/** `schema.md` Commitment.status. */
export const COMMITMENT_STATUSES = ['committed', 'delivered', 'slipped', 'dropped'] as const;
/** `schema.md` SessionReservation.status. */
export const SESSION_RESERVATION_STATUSES = ['reserved', 'waitlisted', 'cancelled'] as const;
/** `schema.md` DataRequest.type. */
export const DATA_REQUEST_TYPES = ['access', 'correction', 'export', 'deletion'] as const;
/** `schema.md` Consent.purpose. */
export const CONSENT_PURPOSES = [
  'decision_notices',
  'record_transfer',
  'assisted_recording',
] as const;
/** `schema.md` ResidenceReview.method. */
export const RESIDENCE_METHODS = [
  'ward_confirmation',
  'organiser_attestation',
  'document',
] as const;
/** `schema.md` ResidenceReview.decision. */
export const RESIDENCE_DECISIONS = ['checked', 'rejected'] as const;
/** The four model capabilities, as `C-078` spells them. */
export const MODEL_CAPABILITIES = [
  'ward_candidate',
  'similar_submission',
  'moderation_routing',
  'budget_line_extraction',
] as const;
/** The outcomes the inference gateway returns, as `C-078` spells them. */
export const MODEL_OUTCOMES = ['ok', 'timeout', 'refused', 'disabled', 'error'] as const;

/** The payload each event carries, keyed by event name. */
export interface AnalyticsPayloads {
  /** `EVT-001`: a screen renders and the resident sees it. */
  readonly screen_viewed: {
    readonly screen: string;
    readonly device_class: string;
    readonly signed_in: boolean;
  };
  /** `EVT-002`: a telephone number is submitted on Sign In. */
  readonly sign_in_started: { readonly attempt: number };
  /** `EVT-003`: a one-time code is accepted. */
  readonly number_confirmed: { readonly attempts: number; readonly delivery_delay_band: string };
  /** `EVT-004`: the account is created after the code is accepted or the attestation is recorded. */
  readonly account_registered: {
    readonly identity_state: string;
    readonly verification_method: string;
    readonly shared_number: boolean;
    readonly ward_resolved: boolean;
    readonly locale: string;
  };
  /** `EVT-005`: a member moves from registered to checked. */
  readonly identity_state_changed: { readonly from_state: string; readonly to_state: string };
  /** `EVT-006`: candidate wards are returned on Ward Confirmation. */
  readonly ward_candidate_suggested: { readonly candidate_count: number; readonly source: string };
  /** `EVT-007`: a resident confirms a candidate ward. */
  readonly ward_confirmed: {
    readonly ward_id: string;
    readonly candidate_rank: number;
    readonly source: string;
  };
  /** `EVT-008`: "None of these" is chosen. */
  readonly ward_sent_for_review: { readonly lga_matched: boolean };
  /** `EVT-009`: a reviewer resolves a queued description. */
  readonly ward_review_resolved: { readonly resolution: string };
  /** `EVT-010`: a draft is first held for a submission. */
  readonly submission_drafted: { readonly type: string; readonly pillar: string };
  /** `EVT-011`: the Similar Submission sheet opens. */
  readonly similar_submission_shown: {
    readonly candidate_count: number;
    readonly top_similarity_band: string;
  };
  /** `EVT-012`: a submission publishes successfully. */
  readonly submission_published: {
    readonly type: string;
    readonly pillar: string;
    readonly ward_id: string;
    readonly location_scope: string;
    readonly source: string;
    readonly has_cost_band: boolean;
    readonly contains_named_entity: boolean;
  };
  /** `EVT-013`: validation or a server error blocks publication. A failure event. */
  readonly submission_publish_failed: { readonly failure_code: string };
  /** `EVT-014`: the author backs the suggestion or continues to publish. */
  readonly duplicate_choice_recorded: { readonly choice: string };
  /** `EVT-015`: a backing is written. */
  readonly backing_recorded: {
    readonly submission_id: string;
    readonly identity_state_at_backing: string;
  };
  /** `EVT-016`: a member withdraws a backing. */
  readonly backing_withdrawn: { readonly submission_id: string };
  /** `EVT-017`: anomaly review voids a backing. */
  readonly backing_voided: { readonly reason_code: string };
  /** `EVT-018`: an organiser records a submission at intake. */
  readonly assisted_intake_recorded: { readonly ward_id: string; readonly offline_replay: boolean };
  /** `EVT-019`: a submission is held for exceeding the daily allowance. */
  readonly assisted_intake_held: { readonly held_reason: string };
  /** `EVT-020`: a comment publishes. */
  readonly comment_posted: { readonly submission_id: string; readonly routing_flag: string };
  /** `EVT-021`: a comment is held for naming a person or company. */
  readonly comment_held_for_legal: { readonly submission_id: string };
  /** `EVT-022`: a moderator removes a comment. */
  readonly comment_removed: { readonly rule_code: string; readonly routing_flag_present: boolean };
  /** `EVT-023`: a removal is reversed. */
  readonly comment_restored: { readonly rule_code: string };
  /** `EVT-024`: a removal with no cited rule is invalidated. */
  readonly removal_invalidated: { readonly moderator_role: string };
  /** `EVT-025`: an author appeals a removal. */
  readonly appeal_submitted: { readonly rule_code: string };
  /** `EVT-026`: a decision is signed and published. */
  readonly decision_published: {
    readonly decision_type: string;
    readonly days_since_submission: number;
    readonly version: number;
  };
  /** `EVT-027`: the daily check finds a submission past twenty-one days. */
  readonly submission_overdue: { readonly days_overdue: number };
  /** `EVT-028`: a commitment moves between statuses. */
  readonly commitment_status_changed: {
    readonly from_status: string;
    readonly to_status: string;
    readonly reason_present: boolean;
  };
  /** `EVT-029`: staff confirm a budget-line match. */
  readonly budget_line_confirmed: { readonly confidence_band: string };
  /** `EVT-030`: staff reject a suggested budget-line match. */
  readonly budget_line_rejected: { readonly confidence_band: string };
  /** `EVT-031`: a ward report renders. */
  readonly ward_report_viewed: {
    readonly ward_id: string;
    readonly device_class: string;
    readonly suppressed: boolean;
  };
  /** `EVT-032`: a quarterly card is published. */
  readonly report_card_published: { readonly quarter: string; readonly correction: boolean };
  /** `EVT-033`: a place or waitlist position is taken. */
  readonly session_reservation_created: { readonly status: string };
  /** `EVT-034`: a question is offered for a session. */
  readonly session_question_submitted: { readonly session_id: string };
  /** `EVT-035`: the record of a session is published. */
  readonly session_record_published: {
    readonly questions_asked: number;
    readonly questions_unreached: number;
  };
  /** `EVT-036`: a member requests access, export, correction or deletion. */
  readonly data_request_created: { readonly request_type: string };
  /** `EVT-037`: a data request is fulfilled. */
  readonly data_request_completed: {
    readonly request_type: string;
    readonly days_to_complete: number;
  };
  /** `EVT-038`: the inference gateway returns. A model event. */
  readonly model_request_completed: {
    readonly capability: string;
    readonly latency_ms: number;
    readonly model_version: string;
    readonly outcome: string;
    readonly cost_micros: number;
  };
  /** `EVT-039`: a suggestion is accepted. A model event. */
  readonly model_suggestion_accepted: { readonly capability: string; readonly rank: number };
  /** `EVT-040`: a suggestion is declined or overridden. A model event. */
  readonly model_suggestion_rejected: { readonly capability: string };
  /** `EVT-041`: a capability falls back to its deterministic path. A model event. */
  readonly model_fallback_triggered: { readonly capability: string; readonly reason_code: string };
  /** `EVT-042`: the registration form is submitted and a pending registration is created. */
  readonly registration_started: { readonly locale: string };
  /** `EVT-043`: a submission or comment is held for legal review. */
  readonly legal_review_requested: { readonly case_type: string; readonly source: string };
  /** `EVT-044`: a legal reviewer clears, withholds or takes down an item. */
  readonly legal_review_decided: { readonly outcome: string; readonly days_open: number };
  /** `EVT-045`: a takedown is published with a public note. */
  readonly takedown_published: { readonly case_type: string };
  /** `EVT-046`: a member grants or withdraws an optional consent. */
  readonly consent_changed: { readonly purpose: string; readonly granted: boolean };
  /** `EVT-047`: a residence review accepts or rejects a member. */
  readonly residence_review_completed: { readonly decision: string; readonly method: string };
  /** `EVT-048`: a staff member saves or reserves a decision draft. */
  readonly decision_draft_saved: { readonly outcome: string; readonly reserved_hours: number };
}

/** Every declared event name. */
export type AnalyticsEventName = keyof AnalyticsPayloads;

/** One taxonomy entry. */
export interface AnalyticsEventDefinition<K extends AnalyticsEventName> {
  /** The `EVT-###` the name belongs to. */
  readonly evt: EvtId;
  /** The event name as `C-089` sends it. */
  readonly name: K;
  /** The declared value domain of every property, and nothing beyond them. */
  readonly properties: {
    readonly [P in keyof AnalyticsPayloads[K]]: KindFor<AnalyticsPayloads[K][P]>;
  };
  /**
   * `C-089`: a `correlation_id` is required on the four model events and on any failure event, so a
   * model call or a failure can be tied to the request that produced it.
   */
  readonly requiresCorrelationId: boolean;
}

/** The registry: every event `analytics.md` declares, with its properties. */
export const ANALYTICS_EVENTS: { readonly [K in AnalyticsEventName]: AnalyticsEventDefinition<K> } =
  {
    screen_viewed: {
      evt: 'EVT-001',
      name: 'screen_viewed',
      // A screen id and a device class are render facts. `signed_in` is a boolean, not an identity.
      properties: { screen: tokenKind(60), device_class: tokenKind(20), signed_in: booleanKind() },
      requiresCorrelationId: false,
    },
    sign_in_started: {
      evt: 'EVT-002',
      name: 'sign_in_started',
      properties: { attempt: integerKind(1) },
      requiresCorrelationId: false,
    },
    number_confirmed: {
      evt: 'EVT-003',
      name: 'number_confirmed',
      // `C-001`: three wrong code attempts before a cooldown, so a confirmed code is never the fourth.
      properties: { attempts: integerKind(1, 3), delivery_delay_band: tokenKind(40) },
      requiresCorrelationId: false,
    },
    account_registered: {
      evt: 'EVT-004',
      name: 'account_registered',
      properties: {
        identity_state: enumKind(IDENTITY_STATES),
        verification_method: enumKind(VERIFICATION_METHODS),
        shared_number: booleanKind(),
        ward_resolved: booleanKind(),
        locale: enumKind(ANALYTICS_LOCALES),
      },
      requiresCorrelationId: false,
    },
    identity_state_changed: {
      evt: 'EVT-005',
      name: 'identity_state_changed',
      properties: { from_state: enumKind(IDENTITY_STATES), to_state: enumKind(IDENTITY_STATES) },
      requiresCorrelationId: false,
    },
    ward_candidate_suggested: {
      evt: 'EVT-006',
      name: 'ward_candidate_suggested',
      properties: { candidate_count: integerKind(0), source: tokenKind(40) },
      requiresCorrelationId: false,
    },
    ward_confirmed: {
      evt: 'EVT-007',
      name: 'ward_confirmed',
      // A ward identifier scopes the count; the ward's name or description is never a property.
      properties: {
        ward_id: identifierKind('wrd'),
        candidate_rank: integerKind(1),
        source: tokenKind(40),
      },
      requiresCorrelationId: false,
    },
    ward_sent_for_review: {
      evt: 'EVT-008',
      name: 'ward_sent_for_review',
      properties: { lga_matched: booleanKind() },
      requiresCorrelationId: false,
    },
    ward_review_resolved: {
      evt: 'EVT-009',
      name: 'ward_review_resolved',
      properties: { resolution: tokenKind(40) },
      requiresCorrelationId: false,
    },
    submission_drafted: {
      evt: 'EVT-010',
      name: 'submission_drafted',
      properties: { type: enumKind(SUBMISSION_TYPES), pillar: enumKind(PILLARS) },
      requiresCorrelationId: false,
    },
    similar_submission_shown: {
      evt: 'EVT-011',
      name: 'similar_submission_shown',
      // `C-079`: the capability returns at most three candidates.
      properties: { candidate_count: integerKind(0, 3), top_similarity_band: tokenKind(40) },
      requiresCorrelationId: false,
    },
    submission_published: {
      evt: 'EVT-012',
      name: 'submission_published',
      properties: {
        type: enumKind(SUBMISSION_TYPES),
        pillar: enumKind(PILLARS),
        ward_id: identifierKind('wrd'),
        location_scope: enumKind(LOCATION_SCOPES),
        source: enumKind(SUBMISSION_SOURCES),
        has_cost_band: booleanKind(),
        contains_named_entity: booleanKind(),
      },
      requiresCorrelationId: false,
    },
    submission_publish_failed: {
      evt: 'EVT-013',
      name: 'submission_publish_failed',
      // The failure is named by its code, never by the text that failed validation.
      properties: { failure_code: tokenKind(60) },
      requiresCorrelationId: true,
    },
    duplicate_choice_recorded: {
      evt: 'EVT-014',
      name: 'duplicate_choice_recorded',
      properties: { choice: enumKind(['backed', 'continued']) },
      requiresCorrelationId: false,
    },
    backing_recorded: {
      evt: 'EVT-015',
      name: 'backing_recorded',
      properties: {
        submission_id: identifierKind('sub'),
        identity_state_at_backing: enumKind(IDENTITY_STATES),
      },
      requiresCorrelationId: false,
    },
    backing_withdrawn: {
      evt: 'EVT-016',
      name: 'backing_withdrawn',
      properties: { submission_id: identifierKind('sub') },
      requiresCorrelationId: false,
    },
    backing_voided: {
      evt: 'EVT-017',
      name: 'backing_voided',
      properties: { reason_code: tokenKind(60) },
      requiresCorrelationId: false,
    },
    assisted_intake_recorded: {
      evt: 'EVT-018',
      name: 'assisted_intake_recorded',
      properties: { ward_id: identifierKind('wrd'), offline_replay: booleanKind() },
      requiresCorrelationId: false,
    },
    assisted_intake_held: {
      evt: 'EVT-019',
      name: 'assisted_intake_held',
      properties: { held_reason: tokenKind(60) },
      requiresCorrelationId: false,
    },
    comment_posted: {
      evt: 'EVT-020',
      name: 'comment_posted',
      properties: {
        submission_id: identifierKind('sub'),
        routing_flag: enumKind(COMMENT_ROUTING_FLAGS),
      },
      requiresCorrelationId: false,
    },
    comment_held_for_legal: {
      evt: 'EVT-021',
      name: 'comment_held_for_legal',
      properties: { submission_id: identifierKind('sub') },
      requiresCorrelationId: false,
    },
    comment_removed: {
      evt: 'EVT-022',
      name: 'comment_removed',
      properties: { rule_code: tokenKind(60), routing_flag_present: booleanKind() },
      requiresCorrelationId: false,
    },
    comment_restored: {
      evt: 'EVT-023',
      name: 'comment_restored',
      properties: { rule_code: tokenKind(60) },
      requiresCorrelationId: false,
    },
    removal_invalidated: {
      evt: 'EVT-024',
      name: 'removal_invalidated',
      properties: { moderator_role: tokenKind(40) },
      requiresCorrelationId: false,
    },
    appeal_submitted: {
      evt: 'EVT-025',
      name: 'appeal_submitted',
      properties: { rule_code: tokenKind(60) },
      requiresCorrelationId: false,
    },
    decision_published: {
      evt: 'EVT-026',
      name: 'decision_published',
      properties: {
        decision_type: enumKind(DECISION_TYPES),
        days_since_submission: integerKind(0),
        version: integerKind(1),
      },
      requiresCorrelationId: false,
    },
    submission_overdue: {
      evt: 'EVT-027',
      name: 'submission_overdue',
      properties: { days_overdue: integerKind(1) },
      requiresCorrelationId: false,
    },
    commitment_status_changed: {
      evt: 'EVT-028',
      name: 'commitment_status_changed',
      properties: {
        from_status: enumKind(COMMITMENT_STATUSES),
        to_status: enumKind(COMMITMENT_STATUSES),
        reason_present: booleanKind(),
      },
      requiresCorrelationId: false,
    },
    budget_line_confirmed: {
      evt: 'EVT-029',
      name: 'budget_line_confirmed',
      properties: { confidence_band: tokenKind(40) },
      requiresCorrelationId: false,
    },
    budget_line_rejected: {
      evt: 'EVT-030',
      name: 'budget_line_rejected',
      properties: { confidence_band: tokenKind(40) },
      requiresCorrelationId: false,
    },
    ward_report_viewed: {
      evt: 'EVT-031',
      name: 'ward_report_viewed',
      properties: {
        ward_id: identifierKind('wrd'),
        device_class: tokenKind(20),
        suppressed: booleanKind(),
      },
      requiresCorrelationId: false,
    },
    report_card_published: {
      evt: 'EVT-032',
      name: 'report_card_published',
      properties: { quarter: quarterKind(), correction: booleanKind() },
      requiresCorrelationId: false,
    },
    session_reservation_created: {
      evt: 'EVT-033',
      name: 'session_reservation_created',
      properties: { status: enumKind(SESSION_RESERVATION_STATUSES) },
      requiresCorrelationId: false,
    },
    session_question_submitted: {
      evt: 'EVT-034',
      name: 'session_question_submitted',
      properties: { session_id: identifierKind('ses') },
      requiresCorrelationId: false,
    },
    session_record_published: {
      evt: 'EVT-035',
      name: 'session_record_published',
      properties: { questions_asked: integerKind(0), questions_unreached: integerKind(0) },
      requiresCorrelationId: false,
    },
    data_request_created: {
      evt: 'EVT-036',
      name: 'data_request_created',
      properties: { request_type: enumKind(DATA_REQUEST_TYPES) },
      requiresCorrelationId: false,
    },
    data_request_completed: {
      evt: 'EVT-037',
      name: 'data_request_completed',
      properties: { request_type: enumKind(DATA_REQUEST_TYPES), days_to_complete: integerKind(0) },
      requiresCorrelationId: false,
    },
    model_request_completed: {
      evt: 'EVT-038',
      name: 'model_request_completed',
      properties: {
        capability: enumKind(MODEL_CAPABILITIES),
        latency_ms: integerKind(0),
        model_version: tokenKind(120),
        outcome: enumKind(MODEL_OUTCOMES),
        cost_micros: integerKind(0),
      },
      requiresCorrelationId: true,
    },
    model_suggestion_accepted: {
      evt: 'EVT-039',
      name: 'model_suggestion_accepted',
      properties: { capability: enumKind(MODEL_CAPABILITIES), rank: integerKind(1) },
      requiresCorrelationId: true,
    },
    model_suggestion_rejected: {
      evt: 'EVT-040',
      name: 'model_suggestion_rejected',
      properties: { capability: enumKind(MODEL_CAPABILITIES) },
      requiresCorrelationId: true,
    },
    model_fallback_triggered: {
      evt: 'EVT-041',
      name: 'model_fallback_triggered',
      properties: { capability: enumKind(MODEL_CAPABILITIES), reason_code: tokenKind(60) },
      requiresCorrelationId: true,
    },
    registration_started: {
      evt: 'EVT-042',
      name: 'registration_started',
      properties: { locale: enumKind(ANALYTICS_LOCALES) },
      requiresCorrelationId: false,
    },
    legal_review_requested: {
      evt: 'EVT-043',
      name: 'legal_review_requested',
      properties: { case_type: tokenKind(40), source: tokenKind(40) },
      requiresCorrelationId: false,
    },
    legal_review_decided: {
      evt: 'EVT-044',
      name: 'legal_review_decided',
      properties: { outcome: tokenKind(40), days_open: integerKind(0) },
      requiresCorrelationId: false,
    },
    takedown_published: {
      evt: 'EVT-045',
      name: 'takedown_published',
      properties: { case_type: tokenKind(40) },
      requiresCorrelationId: false,
    },
    consent_changed: {
      evt: 'EVT-046',
      name: 'consent_changed',
      properties: { purpose: enumKind(CONSENT_PURPOSES), granted: booleanKind() },
      requiresCorrelationId: false,
    },
    residence_review_completed: {
      evt: 'EVT-047',
      name: 'residence_review_completed',
      properties: { decision: enumKind(RESIDENCE_DECISIONS), method: enumKind(RESIDENCE_METHODS) },
      requiresCorrelationId: false,
    },
    decision_draft_saved: {
      evt: 'EVT-048',
      name: 'decision_draft_saved',
      // `nfr.md` data lifecycle: a decision reservation is held for 24 hours.
      properties: { outcome: tokenKind(40), reserved_hours: integerKind(0, 24) },
      requiresCorrelationId: false,
    },
  };

/** Every declared event name, in taxonomy order. */
export const ANALYTICS_EVENT_NAMES = Object.keys(ANALYTICS_EVENTS) as AnalyticsEventName[];

/** Whether a string is one of the declared event names. */
export function isAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === 'string' && Object.hasOwn(ANALYTICS_EVENTS, value);
}

/** The definition for a name, or `undefined` when the name is outside the taxonomy. */
export function analyticsEventDefinition(
  name: string,
): AnalyticsEventDefinition<AnalyticsEventName> | undefined {
  return isAnalyticsEventName(name) ? ANALYTICS_EVENTS[name] : undefined;
}
