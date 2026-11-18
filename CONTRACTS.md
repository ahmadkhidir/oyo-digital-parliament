# Oyo Digital Parliament — Interface Contracts

**Status:** Frozen

**Contract version:** 1.1.0

**Applies to:** the single Next.js App Router deployable described in `docs/OyoDigitalParliament/architecture.md`, comprising the public record and the `/admin` console in one application.

**Authority:** where this document and the specification disagree, the specification wins and this document is corrected. Field names, enum values and `required` arrays are taken verbatim from `docs/OyoDigitalParliament/schema.md` and are not negotiable.

Every entry below is **Frozen**. An entry states the wire shape, who may call it, what it is allowed to change, and how it fails. Nothing here authorises a component to publish, decide, moderate or transfer on its own; authority is stated per entry.

Four surfaces exist, and every entry names one:

- **Server action** — a Next.js server action invoked from the route named in the entry. Returns the action result envelope in `C-001`.
- **Route handler** — `GET`/`POST`/`PUT`/`PATCH`/`DELETE` under `/api`, returning the HTTP response envelope in `C-001`. The two operational probes in `C-091` are route handlers outside `/api`; they return the constant body that entry fixes and never the envelope, because the envelope carries a request identifier and a timestamp and a probe must be free of both.
- **Internal RPC** — a call between modules of the same deployable or between the deployable and a worker/gateway. Not reachable from a browser.
- **Worker secret** — a scheduled invocation authenticated with the worker credential; never reachable from a browser.

## Version History

Append-only. Each row records what that version changed; an accepted version is never rewritten, and a later correction is a new row rather than an edit to an older one.

| Version | Change |
|---|---|
| 1.0.0 | First frozen set, `C-001` to `C-090`. |
| 1.1.0 | Adds `C-091` operational health probes. Reconciles the `C-001` identifier pattern with the identifiers this document prints. Aligns `C-077` with `C-089` and `C-090`: one event-name spelling, one audit result shape, and the correlation identifier carried beside the audit entity rather than on it. Defines the two result shapes `C-077` left open. Replaces the last abbreviated value in `C-011` with a timestamp. |

## Contract Index

| ID | Contract | Auth | Surface | Spec anchors |
|---|---|---|---|---|
| C-001 | Shared request, response and failure conventions | Public | All surfaces | NFR-020, NFR-025, NFR-026, NFR-027, NFR-028 |
| C-002 | Registration submission and code dispatch | Public | Action `registerResident` on `/join` | FEAT-001, NFR-004, NFR-020, EVT-042, `screens/03-registration-form.md` |
| C-003 | Registration code verification and account creation | Public | Action `confirmRegistration` on `/join/confirm` | FEAT-001, NFR-020, EVT-003, EVT-004, `screens/04-number-confirmation.md` |
| C-004 | Registration code resend | Public | Action `resendRegistrationCode` on `/join/confirm` | FEAT-001, NFR-027, `screens/04-number-confirmation.md` |
| C-005 | Sign-in code request | Public | Action `requestSignInCode` on `/sign-in` | FEAT-001, NFR-020, NFR-027, EVT-002, `screens/02-sign-in.md` |
| C-006 | Sign-in code verification and session start | Public | Action `completeSignIn` on `/sign-in` | FEAT-001, NFR-020, NFR-026, `screens/02-sign-in.md` |
| C-007 | Session read | Public | `GET /api/session` | NFR-026, `screens.md` Record Header |
| C-008 | Sign-out | Member session | Action `signOut` | NFR-026, `screens/13-my-record.md` |
| C-009 | Ward list read | Public | `GET /api/wards` | FEAT-002, NFR-002, `screens/05-ward-confirmation.md` |
| C-010 | Ward candidate suggestion | Member session | `POST /api/wards/candidates` | FEAT-002, NFR-014, NFR-051, EVT-006, `screens/05-ward-confirmation.md` |
| C-011 | Ward confirmation and unresolved queueing | Member session | Action `confirmWard` on `/join/ward` | FEAT-002, EVT-007, EVT-008, `screens/05-ward-confirmation.md` |
| C-012 | Submission draft save | Member session | Action `saveSubmissionDraft` on `/submit` | FEAT-003, EVT-010, `screens/06-submission-form.md` |
| C-013 | Submission draft discard | Member session | `DELETE /api/submission-drafts/{draftId}` | FEAT-003, `screens/06-submission-form.md` |
| C-014 | Submission publication | Member session | Action `publishSubmission` on `/submit` | FEAT-003, NFR-005, NFR-027, EVT-012, EVT-013, `screens/06-submission-form.md` |
| C-015 | Submission withdrawal | Member session | Action `withdrawSubmission` on `/s/{reference}` | FEAT-007, FEAT-008, `screens/07-submission-detail.md` |
| C-016 | Similar submission suggestion | Member session | `POST /api/submissions/similar` | FEAT-003, FEAT-005, NFR-012, NFR-050, EVT-011, `screens/06-submission-form.md` |
| C-017 | Backing creation | Member session | Action `backSubmission` on `/s/{reference}` | FEAT-005, NFR-006, NFR-027, EVT-015, `screens/07-submission-detail.md` |
| C-018 | Backing withdrawal | Member session | `DELETE /api/submissions/{reference}/backing` | FEAT-005, EVT-016, `screens/07-submission-detail.md` |
| C-019 | Comment publication | Member session | Action `postComment` on `/s/{reference}` | FEAT-006, FEAT-014, EVT-020, EVT-021, `screens/07-submission-detail.md` |
| C-020 | Comment withdrawal by author | Member session | `DELETE /api/comments/{commentId}` | FEAT-006, `screens/07-submission-detail.md` |
| C-021 | Appeal submission | Member session | Action `appealRemoval` on `/s/{reference}` | FEAT-011, EVT-025, `screens/07-submission-detail.md` |
| C-022 | Content report submission | Member session | Action `reportContent` on `/s/{reference}` | FEAT-014, EVT-043, `screens/07-submission-detail.md` |
| C-023 | Submission record read | Public | `GET /api/submissions/{reference}` | FEAT-003, FEAT-007, FEAT-014, NFR-001, `screens/07-submission-detail.md` |
| C-024 | Commitment register read | Public | `GET /api/commitments` | FEAT-007, NFR-001, `screens/08-commitment-register.md` |
| C-025 | Public ledger read | Public | `GET /api/ledger` | FEAT-008, NFR-003, `screens/09-public-ledger.md` |
| C-026 | Ward report read | Public | `GET /api/wards/{wardId}/report` | FEAT-009, NFR-002, EVT-031, `screens/10-ward-report.md` |
| C-027 | Quarterly report card read | Public | `GET /api/report-cards` | FEAT-009, `screens/11-quarterly-report-card.md` |
| C-028 | Session detail and record read | Public | `GET /api/sessions/{sessionId}` | FEAT-010, `screens/12-session-detail.md` |
| C-029 | Session reservation | Member session | Action `reserveSessionPlace` on `/sessions/{id}` | FEAT-010, EVT-033, `screens/12-session-detail.md` |
| C-030 | Session reservation cancellation | Member session | `DELETE /api/sessions/{sessionId}/reservations/mine` | FEAT-010, `screens/12-session-detail.md` |
| C-031 | Session question submission | Member session | Action `submitSessionQuestion` on `/sessions/{id}` | FEAT-010, EVT-034, `screens/12-session-detail.md` |
| C-032 | My Record read | Member session | `GET /api/me` | FEAT-012, NFR-040, `screens/13-my-record.md` |
| C-033 | Profile correction | Member session | Action `correctMyDetails` on `/me` | FEAT-012, NFR-040, `screens/13-my-record.md` |
| C-034 | Consent update | Member session | Action `updateConsent` on `/me` | FEAT-012, EVT-046, `screens/13-my-record.md` |
| C-035 | Data request creation | Member session | Action `createDataRequest` on `/me` | FEAT-012, NFR-040, EVT-036, `screens/13-my-record.md` |
| C-036 | Export file download | Member session | `GET /api/me/data-requests/{requestId}/file` | FEAT-012, NFR-040, `screens/13-my-record.md` |
| C-037 | Privacy notice read | Public | `GET /api/privacy-notice` | FEAT-012, NFR-040, NFR-045, `screens/23-privacy-notice.md` |
| C-038 | In-product search | Public | `GET /api/search` | FEAT-003, NFR-009, `screens/01-record-home.md` |
| C-039 | Language preference update | Public | Action `setLocale` | FEAT-012, `screens.md` Footer |
| C-040 | Decision queue read | Staff session (response_staff) | `GET /api/admin/decision-queue` | FEAT-007, FEAT-008, NFR-007, `screens/15-decision-queue.md` |
| C-041 | Decision reservation | Staff session (response_staff) | Action `reserveDecisionDraft` on `/admin/queue/{reference}/decide` | FEAT-007, EVT-048, `screens/16-decision-composer.md` |
| C-042 | Decision reservation release | Staff session (response_staff) | `DELETE /api/admin/decision-drafts/{decisionDraftId}` | FEAT-007, `screens/16-decision-composer.md` |
| C-043 | Decision publication | Staff session (response_staff) | Action `publishDecision` on `/admin/queue/{reference}/decide` | FEAT-007, NFR-007, EVT-026, `screens/16-decision-composer.md` |
| C-044 | Decision revision | Staff session (response_staff) | Action `reviseDecision` on `/admin/queue/{reference}/decide` | FEAT-007, `screens/16-decision-composer.md` |
| C-045 | Commitment status change | Staff session (response_staff) | Action `changeCommitmentStatus` | FEAT-007, FEAT-009, EVT-028, `screens/08-commitment-register.md` |
| C-046 | Delivery evidence record | Staff session (response_staff) | Action `recordDeliveryEvidence` on `/admin/report-card` | FEAT-009, `screens/20-report-card-workbench.md` |
| C-047 | Budget-line candidate read | Staff session (response_staff) | `GET /api/admin/report-cards/{quarter}/budget-lines` | FEAT-009, NFR-013, NFR-053, `screens/20-report-card-workbench.md` |
| C-048 | Budget-line decision | Staff session (response_staff) | Action `decideBudgetLine` on `/admin/report-card` | FEAT-009, EVT-029, EVT-030, `screens/20-report-card-workbench.md` |
| C-049 | Moderation queue read | Staff session (moderator, external_reviewer) | `GET /api/admin/moderation/cases` | FEAT-006, FEAT-011, `screens/17-moderation-log.md` |
| C-050 | Moderation action | Staff session (moderator) | Action `moderateComment` on `/admin/moderation` | FEAT-006, FEAT-011, NFR-028, EVT-022, `screens/17-moderation-log.md` |
| C-051 | Appeal queue read | Staff session (external_reviewer) | `GET /api/admin/moderation/appeals` | FEAT-011, `screens/17-moderation-log.md` |
| C-052 | Appeal decision and case reassignment | Staff session (external_reviewer) | Action `decideAppeal` on `/admin/moderation` | FEAT-011, EVT-023, `screens/17-moderation-log.md` |
| C-053 | Legal review queue read | Staff session (legal_reviewer) | `GET /api/admin/legal/cases` | FEAT-014, `screens/18-legal-review.md` |
| C-054 | Legal decision and takedown | Staff session (legal_reviewer) | Action `decideLegalReview` on `/admin/legal` | FEAT-014, NFR-043, EVT-044, EVT-045, `screens/18-legal-review.md` |
| C-055 | Ward description review queue read | Staff session (response_staff) | `GET /api/admin/ward-reviews` | FEAT-002, `screens/19-ward-review-queue.md` |
| C-056 | Ward description resolution | Staff session (response_staff) | Action `resolveWardDescription` on `/admin/wards/review` | FEAT-002, EVT-009, `screens/19-ward-review-queue.md` |
| C-057 | Residence review record | Staff session (response_staff) | Action `recordResidenceReview` on `/admin/wards/review` | FEAT-001, EVT-005, EVT-047, `screens/19-ward-review-queue.md` |
| C-058 | Assisted intake publication | Staff session (ward_organiser) | Action `recordAssistedIntake` on `/admin/intake` | FEAT-004, EVT-018, EVT-019, `screens/14-assisted-intake.md` |
| C-059 | Assisted intake offline replay | Staff session (ward_organiser) | `POST /api/admin/intake/replay` | FEAT-004, NFR-008, `screens/14-assisted-intake.md` |
| C-060 | Report card preparation read | Staff session (response_staff) | `GET /api/admin/report-cards/{quarter}` | FEAT-009, `screens/20-report-card-workbench.md` |
| C-061 | Report card publication | Staff session (response_staff) | Action `publishReportCard` on `/admin/report-card` | FEAT-009, EVT-032, `screens/20-report-card-workbench.md` |
| C-062 | Report card correction | Staff session (response_staff) | Action `correctReportCard` on `/admin/report-card` | FEAT-009, `screens/20-report-card-workbench.md` |
| C-063 | Session question selection | Staff session (response_staff) | Action `selectSessionQuestion` on `/admin/sessions/{id}/compose` | FEAT-010, `screens/21-session-composer.md` |
| C-064 | Session question answer | Staff session (response_staff) | Action `answerSessionQuestion` on `/admin/sessions/{id}/compose` | FEAT-010, `screens/21-session-composer.md` |
| C-065 | Session record publication | Staff session (response_staff) | Action `publishSessionRecord` on `/admin/sessions/{id}/compose` | FEAT-010, EVT-035, `screens/21-session-composer.md` |
| C-066 | Data request queue read | Staff session (operator) | `GET /api/admin/data-requests` | FEAT-012, `screens/22-data-request-queue.md` |
| C-067 | Data request resolution | Staff session (operator) | Action `resolveDataRequest` on `/admin/data-requests` | FEAT-012, EVT-037, `screens/22-data-request-queue.md` |
| C-068 | Staff account and role administration | Staff session (operator) | Action `administerStaffUser` on `/admin` | FEAT-011, FEAT-012, NFR-020, `operations.md` |
| C-069 | Feature flag administration | Staff session (operator) | Action `setFeatureFlag` on `/admin` | FEAT-002, FEAT-003, FEAT-009, FEAT-011, `release.md` |
| C-070 | Identity and access boundary | Internal only | Internal RPC | FEAT-001, FEAT-012, NFR-028, NFR-040 |
| C-071 | Ward reference boundary | Internal only | Internal RPC | FEAT-002 |
| C-072 | Submission boundary | Internal only | Internal RPC | FEAT-003, FEAT-004, FEAT-005 |
| C-073 | Discourse boundary | Internal only | Internal RPC | FEAT-006, FEAT-011, FEAT-014 |
| C-074 | Decision and commitment boundary | Internal only | Internal RPC | FEAT-007, FEAT-008, FEAT-009 |
| C-075 | Reporting boundary | Internal only | Internal RPC | FEAT-008, FEAT-009, NFR-002, NFR-003 |
| C-076 | Notification boundary | Internal only | Internal RPC | FEAT-001, FEAT-007, FEAT-011, NFR-010 |
| C-077 | Audit and analytics boundary | Internal only | Internal RPC | NFR-028, NFR-040, `analytics.md` |
| C-078 | Inference Gateway invocation envelope | Internal only | Internal RPC | NFR-012, NFR-013, NFR-014, NFR-015, NFR-045 |
| C-079 | `similar_submission` capability | Internal only | Internal RPC | FEAT-003, NFR-050, EVT-038, EVT-039, EVT-041 |
| C-080 | `ward_candidate` capability | Internal only | Internal RPC | FEAT-002, NFR-051, EVT-006, EVT-038, EVT-041 |
| C-081 | `moderation_routing` capability | Internal only | Internal RPC | FEAT-011, NFR-052, EVT-038, EVT-041 |
| C-082 | `budget_line_extraction` capability | Internal only | Internal RPC | FEAT-009, NFR-013, NFR-053, EVT-038, EVT-041 |
| C-083 | Twenty-one-day overdue check job | Worker secret | Scheduled job | FEAT-007, FEAT-008, EVT-027 |
| C-084 | Quarterly report card generation job | Worker secret | Scheduled job | FEAT-009, NFR-013 |
| C-085 | Backing anomaly review job | Worker secret | Scheduled job | FEAT-005, NFR-027, EVT-017 |
| C-086 | Cache pre-warming job | Worker secret | Scheduled job | NFR-001, NFR-002, NFR-003, NFR-010 |
| C-087 | Backup verification job | Worker secret | Scheduled job | NFR-010, NFR-011, `architecture.md` Backup & Recovery |
| C-088 | Handover and archive job | Worker secret | Scheduled job | FEAT-013, FEAT-012 |
| C-089 | Analytics event envelope | Internal only | Internal RPC | EVT-001–EVT-048, `analytics.md` |
| C-090 | Audit event envelope | Internal only | Internal RPC | NFR-028, `schema.md` AuditEvent |
| C-091 | Operational health probes | Monitor only | Route handler `GET /healthz`, `GET /readyz` | NFR-010, NFR-011, `operations.md` Incident & Escalation, `architecture.md` Logging & Monitoring |

---

## Domain 1 — Shared Conventions

### C-001: Shared request, response and failure conventions

**Status:** Frozen

**Auth:** Public

**Surface:** Applies to every entry in this document

**Spec anchors:** NFR-020, NFR-025, NFR-026, NFR-027, NFR-028, NFR-040, `architecture.md` Cross-Cutting Concerns

**Authority:** Binds every caller; the conventions themselves are public. The `Auth` column of each later entry narrows who may call it. An entry may narrow these rules; none may contradict them.

**Request:**
```json
{
  "headers": {
    "Idempotency-Key": "UUIDv4, required on every state-changing call",
    "X-Correlation-Id": "optional; when supplied it must match ^req_[0-9A-Z]{4,32}$ and is echoed unchanged; generated in that form when absent",
    "Origin": "required on browser writes; cross-origin values are refused",
    "Cookie": "odp_session=opaque; HttpOnly; SameSite=Lax; Secure"
  },
  "transport": {
    "reads": "GET with query parameters",
    "writes": "server action payload or JSON body, UTF-8",
    "internal": "JSON over the module boundary with a service credential"
  },
  "conventions": {
    "timestamps": "RFC 3339, UTC, second precision, suffix Z; e.g. 2026-11-18T09:14:00Z",
    "calendar dates": "YYYY-MM-DD interpreted in Africa/Lagos (UTC+01:00)",
    "identifiers": "opaque, pattern ^[a-z]{3}_[0-9A-Z]{4,26}$, e.g. sub_01J9Z6K4Q3W8R2T5Y7B1C0D9EF; three lower-case prefix letters naming the entity type, an underscore, then an upper-case alphanumeric body",
    "correlation identifier": "pattern ^req_[0-9A-Z]{4,32}$; names a request rather than a record, so its body may run six characters longer than a record body",
    "public reference": "pattern ^ODP-[0-9]{6}$",
    "money": "integer naira, no decimals, field names ending in Amount",
    "locale": "en-NG or yo-NG, read from Member.locale; Accept-Language never overrides it",
    "pagination": "cursor; limit default 20, maximum 50; order is (sortKey, id)",
    "idempotency window": "24 hours for Idempotency-Key; permanent for clientRecordId on assisted intake",
    "personal data": "telephoneNumber, fullName, declaredAge, memberId never appear on a public response or in analytics"
  }
}
```

**Identifier form.** The prefix names the entity type (`sub_`, `mbr_`, `stf_`, `cmt_`, `wdr_`, `aud_`, `evt_` and so on); the body is upper-case alphanumeric and the prefix is the only lower-case part, so the two halves never blur into one another. The value is opaque to every caller and is never parsed for meaning. The body range is four to twenty-six characters rather than a fixed twenty-six, because this document prints identifiers from seven to twenty-six characters long and several of them contain an `L` that the Crockford alphabet excludes; a fixed-length Crockford pattern would refuse values the contract itself prints, which is the worse error. A newly minted record identifier uses the twenty-six-character form shown above; the wider pattern keeps stored and already-printed identifiers valid. The correlation identifier is the one exception: it names a request rather than a record, so a supplied `X-Correlation-Id` may carry a body of up to 32 characters, and a value outside `^req_[0-9A-Z]{4,32}$` is refused rather than echoed.

**Response 200 (read envelope):**
```json
{
  "data": {},
  "meta": {
    "correlationId": "req_01J9Z6M2V4",
    "asAt": "2026-11-18T09:14:00Z",
    "degraded": false,
    "idempotentReplay": false,
    "locale": "en-NG"
  },
  "page": { "nextCursor": null, "hasMore": false }
}
```
`meta.asAt` is the time the figures were computed, not the time of the request. `meta.degraded` is `true` when a cached or fallback path answered, and the response then also carries `meta.degradedReason` (`READ_CACHE`, `SEARCH_UNAVAILABLE`, `CAPABILITY_FALLBACK`, `REPORT_STALE`).

**Response 200 (action envelope):**
```json
{ "ok": true, "data": {}, "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:14:00Z" } }
```

**Response 202 (queued write):**
```json
{
  "ok": true,
  "data": {
    "queuedWriteId": "qw_01J9Z6N8B1",
    "acceptedAt": "2026-11-18T09:14:00Z",
    "replayBy": "2026-11-19T09:14:00Z",
    "durable": true
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "degraded": true, "degradedReason": "PRIMARY_WRITE_UNAVAILABLE" }
}
```
A queued write is durable before the response returns. The submitted text is never discarded, and the same `Idempotency-Key` replays the queue entry rather than creating a second one.

**Response 4xx/5xx (error envelope):**
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "cause": "PROPOSAL_COST_BAND_MISSING",
    "message": "A proposal needs a cost band before it can be published.",
    "fields": { "costBand": "REQUIRED", "responsibleAuthority": "REQUIRED" },
    "correlationId": "req_01J9Z6M2V4",
    "retryAfterSeconds": 30,
    "meta": { "recoveryPath": "/sign-in", "existingDecisionId": null }
  }
}
```
`code` is one of the frozen taxonomy values below. `cause` is a stable upper-snake token naming the specific reason, so one code can carry several distinct causes without renaming the taxonomy. `fields` is present whenever validation is involved and maps a field path to a reason token (`REQUIRED`, `PATTERN_MISMATCH`, `OUT_OF_BAND`, `TOO_SHORT`, `TOO_LONG`, `ENUM_MISMATCH`, `IMMUTABLE`, `ALREADY_SET`, `UNKNOWN_FIELD`).

| Code | HTTP | Action result | Meaning |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | `ok:false` | Body, field or query failed a stated rule; `fields` is populated |
| `UNAUTHENTICATED` | 401 | `ok:false` | No session, expired session, or a second factor that lapsed |
| `FORBIDDEN_ROLE` | 403 | `ok:false` | The session's role does not hold the permission this entry requires |
| `NOT_FOUND` | 404 | `ok:false` | The addressed entity does not exist for this caller |
| `CONFLICT_ALREADY_DECIDED` | 409 | `ok:false` | A live decision, a published record, or an already-resolved case blocks the write |
| `CONFLICT_RESERVED` | 409 | `ok:false` | Another staff member holds the reservation; the holder and expiry are returned |
| `CONFLICT_DUPLICATE_BACKING` | 409 | `ok:false` | This member already holds an active backing for this submission |
| `POLICY_VIOLATION` | 422 | `ok:false` | The write is refused by product policy: consent absent, ward unresolved, thread locked, approval required |
| `RATE_LIMITED` | 429 | `ok:false` | Per-account, per-ward or per-number cap reached; `retryAfterSeconds` is always present |
| `LEGAL_HOLD` | 423 | `ok:false` | A legal hold blocks the requested change; the review date is returned |
| `CAPABILITY_UNAVAILABLE` | 503 | `ok:false` | A model capability is switched off or the gateway refused; the caller uses its deterministic path |
| `WRITE_QUEUED` | 202 | `ok:true` | The primary store cannot take the write; it is durably queued and returns `queuedWriteId` |
| `SERVICE_DEGRADED` | 503 | `ok:false` | A dependency is down and the call cannot be answered at all; a read that can still be served from cache returns `200` with `meta.degraded:true` instead of this error |

**Rate-limit signalling:** every response carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (epoch seconds). A refusal carries `RATE_LIMITED` with `retryAfterSeconds`. Caps are per account and per ward as required by `NFR-027`; the numeric caps are operator configuration, except the values the specification fixes: forty assisted submissions per ward per day, three wrong code attempts before a cooldown, and the backing-concentration rule in `C-085`.

**Audit correlation:** every state change appends exactly one AuditEvent (`C-090`) before the response returns, recorded with the same `correlationId`. `correlationId` is a transport property, not an `AuditEvent` property: `schema.md` gives the entity no such field, so the append carries the correlation beside the record and the log indexes it there. The stored entity keeps exactly the fields `schema.md` declares, and no read invents the field back onto it. A queued write appends its AuditEvent at replay, with the original `Idempotency-Key` retained on the record.

**Locale:** a member's `locale` is authoritative for every rendered and generated string. An anonymous visitor's choice is held in the session and applied to the PendingRegistration at `C-002`.

**Errors:** `VALIDATION_FAILED` for a missing `Idempotency-Key` on a state-changing call (`fields: {"Idempotency-Key": "REQUIRED"}`), for a reused key with a different payload (`fields: {"Idempotency-Key": "REUSED_WITH_DIFFERENT_PAYLOAD"}`), and for a supplied `X-Correlation-Id` outside the correlation form (`fields: {"X-Correlation-Id": "PATTERN_MISMATCH"}`), which is refused rather than echoed.

---

## Domain 2 — Public Client Interfaces

### C-002: Registration submission and code dispatch

**Status:** Frozen

**Auth:** Public

**Surface:** Server action `registerResident` on `/join`; transport `POST /api/join/registrations`

**Spec anchors:** FEAT-001, NFR-004, NFR-020, NFR-027, EVT-042, `screens/03-registration-form.md`, `screens/04-number-confirmation.md`

**Authority:** Creates a PendingRegistration and requests a code. Creates no Member, no session and no public record.

**Request:**
```json
{
  "fullName": "Oluwaseun Adeyemi",
  "declaredAge": 24,
  "telephoneNumber": "+2348031234567",
  "displayName": "Seun A.",
  "locale": "en-NG",
  "sharedNumberDeclaration": false
}
```
`displayName` may be omitted; the server then generates one from the first name and a number. `sharedNumberDeclaration` is `true` only when the resident states the handset and number are shared.

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "pendingRegistrationId": "prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9",
    "telephoneNumber": "+2348031234567",
    "expiresAt": "2026-11-19T09:14:00Z",
    "codeSentAt": "2026-11-18T09:14:00Z",
    "codeDelivery": { "status": "sent", "channel": "sms", "resendAvailableAt": "2026-11-18T09:15:00Z" },
    "nextScreen": "/join/confirm"
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:14:00Z" }
}
```
When the SMS gateway is unavailable the response is still `201`, with `codeDelivery.status` set to `"delayed"` and `resendAvailableAt` present; the PendingRegistration is held for 24 hours and no account exists.

**Errors:** `VALIDATION_FAILED` with `fields` covering `fullName` (`REQUIRED`, `TOO_LONG`), `declaredAge` (`REQUIRED`, `OUT_OF_BAND` for outside 18–35), `telephoneNumber` (`REQUIRED`, `PATTERN_MISMATCH` against `^\+234[0-9]{10}$`), `displayName` (`TOO_LONG`), `locale` (`ENUM_MISMATCH`), and `cause:"ALREADY_REGISTERED"` with `fields:{"telephoneNumber":"ALREADY_SET"}` and `meta.recoveryPath:"/sign-in"` when the number belongs to an account and `sharedNumberDeclaration` is not `true`. `RATE_LIMITED` per number and per IP. `SERVICE_DEGRADED` only when both the store and the SMS gateway refuse, in which case nothing is created.

---

### C-003: Registration code verification and account creation

**Status:** Frozen

**Auth:** Public

**Surface:** Server action `confirmRegistration` on `/join/confirm`

**Spec anchors:** FEAT-001, NFR-020, EVT-003, EVT-004, `screens/04-number-confirmation.md`

**Authority:** Accepts a one-time code, marks the PendingRegistration verified and creates the Member in `registered`. Establishes the session. Does not assign a ward.

**Request:**
```json
{ "pendingRegistrationId": "prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9", "code": "418302" }
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "member": {
      "id": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
      "displayName": "Seun A.",
      "identityState": "registered",
      "verificationMethod": "self_code",
      "sharedNumber": false,
      "wardStatus": "unresolved",
      "locale": "en-NG",
      "createdAt": "2026-11-18T09:16:00Z"
    },
    "session": { "established": true, "expiresAt": "2026-11-18T21:16:00Z" },
    "nextScreen": "/join/ward"
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:16:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `fields:{"code":["REQUIRED","PATTERN_MISMATCH"]}` and `cause:"CODE_INCORRECT"` or `cause:"CODE_EXPIRED"`; the response states attempts remaining. `NOT_FOUND` when the PendingRegistration is unknown or already expired (`cause:"PENDING_REGISTRATION_EXPIRED"`). `CONFLICT_ALREADY_DECIDED` with `cause:"CODE_ALREADY_USED"` when the same code would create a second account. `RATE_LIMITED` after three wrong attempts, with a short cooldown in `retryAfterSeconds`.

---

### C-004: Registration code resend

**Status:** Frozen

**Auth:** Public

**Surface:** Server action `resendRegistrationCode` on `/join/confirm`

**Spec anchors:** FEAT-001, NFR-027, `screens/04-number-confirmation.md`

**Authority:** Issues one new code against the same PendingRegistration. Does not extend `expiresAt` beyond 24 hours from the original creation.

**Request:**
```json
{ "pendingRegistrationId": "prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9" }
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "pendingRegistrationId": "prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9",
    "codeSentAt": "2026-11-18T09:20:00Z",
    "expiresAt": "2026-11-19T09:14:00Z",
    "resendAvailableAt": "2026-11-18T09:21:00Z",
    "codeDelivery": { "status": "sent", "channel": "sms" }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:20:00Z" }
}
```

**Errors:** `NOT_FOUND` when the pending record has expired. `RATE_LIMITED` while the resend timer is cooling down or the number cap is reached. `SERVICE_DEGRADED` with `cause:"SMS_CHANNEL_UNAVAILABLE"` and `meta.pendingRegistrationPreserved:true`.

---

### C-005: Sign-in code request

**Status:** Frozen

**Auth:** Public

**Surface:** Server action `requestSignInCode` on `/sign-in`

**Spec anchors:** FEAT-001, NFR-020, NFR-027, EVT-002, `screens/02-sign-in.md`

**Authority:** Starts a sign-in challenge for a number that belongs to at least one Member. Reveals only the count of accounts, never their names, until the code is accepted.

**Request:**
```json
{ "telephoneNumber": "+2348031234567" }
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "signInChallengeId": "sic_01J9Z6R4F7H2J9K1L3M5N7P0Q2",
    "accountCount": 2,
    "accountChoiceRequired": true,
    "codeDelivery": { "status": "sent", "channel": "sms", "resendAvailableAt": "2026-11-18T09:15:00Z" },
    "expiresAt": "2026-11-18T09:24:00Z"
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:14:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `fields:{"telephoneNumber":["REQUIRED","PATTERN_MISMATCH"]}`. `NOT_FOUND` with `cause:"NO_ACCOUNT_FOR_NUMBER"` and `meta.recoveryPath:"/join"`. `RATE_LIMITED` with `retryAfterSeconds`. `SERVICE_DEGRADED` with `cause:"SMS_CHANNEL_UNAVAILABLE"`.

---

### C-006: Sign-in code verification and session start

**Status:** Frozen

**Auth:** Public

**Surface:** Server action `completeSignIn` on `/sign-in`

**Spec anchors:** FEAT-001, NFR-020, NFR-026, `screens/02-sign-in.md`

**Authority:** Verifies the code, resolves which account is signing in, and opens a session. Never signs in automatically when more than one account shares the number.

**Request:**
```json
{
  "signInChallengeId": "sic_01J9Z6R4F7H2J9K1L3M5N7P0Q2",
  "code": "720418",
  "memberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA"
}
```
`memberId` is required when `accountChoiceRequired` was `true`.

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "member": {
      "id": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
      "displayName": "Seun A.",
      "identityState": "registered",
      "wardStatus": "resolved",
      "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
      "locale": "en-NG",
      "sharedNumber": true
    },
    "session": { "established": true, "expiresAt": "2026-11-18T21:16:00Z" },
    "returnTo": "/s/ODP-004821"
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:16:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `cause:"ACCOUNT_CHOICE_REQUIRED"` and `fields:{"memberId":"REQUIRED"}` when the number is shared and no account was chosen; `cause:"CODE_INCORRECT"`; `cause:"CODE_EXPIRED"`. `RATE_LIMITED` after three wrong attempts. `NOT_FOUND` when the challenge is unknown or has expired.

---

### C-007: Session read

**Status:** Frozen

**Auth:** Public

**Surface:** Route handler `GET /api/session`

**Spec anchors:** NFR-026, `screens.md` Record Header, `screens/01-record-home.md`

**Authority:** Reports the caller's state. Signed out is a successful answer, not an error.

**Request:**
```json
{ "query": {} }
```

**Response 200 (signed out):**
```json
{
  "data": { "signedIn": false, "member": null, "staff": null, "locale": "en-NG" },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:14:00Z", "degraded": false }
}
```

**Response 200 (staff):**
```json
{
  "data": {
    "signedIn": true,
    "member": null,
    "staff": {
      "id": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP",
      "fullName": "A. Balogun",
      "role": "external_reviewer",
      "external": true,
      "secondFactorSatisfied": true,
      "authorisedWardIds": []
    },
    "locale": "en-NG",
    "session": { "expiresAt": "2026-11-18T21:16:00Z", "absoluteExpiresAt": "2026-11-19T09:16:00Z" }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:14:00Z", "degraded": false }
}
```
A staff session never carries a member object, and an `external_reviewer` session never carries member personal data in any field.

**Errors:** `SERVICE_DEGRADED` when the session store is unreachable; the caller is treated as signed out and no privileged data is returned.

---

### C-008: Sign-out

**Status:** Frozen

**Auth:** Member session

**Surface:** Server action `signOut`

**Spec anchors:** NFR-026, `screens/13-my-record.md`

**Authority:** Ends the current session only. Does not revoke another device's session.

**Request:**
```json
{ "allSessions": false }
```

**Response 204:** no body; the session cookie is cleared with `Max-Age=0`.

**Errors:** `UNAUTHENTICATED` when no session exists. `FORBIDDEN_ROLE` when a staff session attempts the member-only endpoint.

---

### C-009: Ward list read

**Status:** Frozen

**Auth:** Public

**Surface:** Route handler `GET /api/wards`

**Spec anchors:** FEAT-002, NFR-002, `screens/05-ward-confirmation.md`, `screens/08-commitment-register.md`

**Authority:** Reads the ward reference only. Does not resolve a member's description.

**Request:**
```json
{ "query": { "localGovernmentArea": "Ibadan North", "cursor": null, "limit": 50 } }
```

**Response 200:**
```json
{
  "data": [
    {
      "id": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
      "name": "Ward IV, Agbowo",
      "localGovernmentArea": "Ibadan North",
      "aliases": ["Agbowo", "Agbowo Express"],
      "source": "confirmed",
      "createdAt": "2026-09-01T08:00:00Z"
    }
  ],
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:14:00Z", "degraded": false },
  "page": { "nextCursor": null, "hasMore": false }
}
```

**Errors:** `SERVICE_DEGRADED` with `cause:"WARD_REFERENCE_UNAVAILABLE"`; the caller then offers the free-text field alone, which remains sufficient to submit per `FEAT-002`.

---

### C-010: Ward candidate suggestion

**Status:** Frozen

**Auth:** Member session

**Surface:** Route handler `POST /api/wards/candidates`

**Spec anchors:** FEAT-002, NFR-014, NFR-051, EVT-006, EVT-039, EVT-040, EVT-041, `screens/05-ward-confirmation.md`

**Authority:** Suggests up to three candidate wards. Never assigns a ward, never writes to the Ward record, and never blocks the resident.

**Request:**
```json
{
  "description": "Behind Agbowo market, near the express",
  "localGovernmentArea": "Ibadan North"
}
```

**Response 200:**
```json
{
  "data": {
    "candidates": [
      { "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "name": "Ward IV, Agbowo", "localGovernmentArea": "Ibadan North", "rank": 1, "source": "model" },
      { "wardId": "wrd_01J9Z5B2C3D4E5F6G7H8J9KMP", "name": "Ward V, Bodija", "localGovernmentArea": "Ibadan North", "rank": 2, "source": "alias" }
    ],
    "capabilityStatus": "on",
    "confirmationRequired": true
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:14:00Z", "degraded": false }
}
```
When the capability is off or the gateway returns nothing, the response is `200` with `capabilityStatus:"fallback"`, candidates drawn from alias and exact matching only, and no notice shown to the resident.

**Errors:** `VALIDATION_FAILED` with `fields` covering `description` (`REQUIRED`, `TOO_LONG` at 500) and `localGovernmentArea` (`REQUIRED` when two wards share a name). `CAPABILITY_UNAVAILABLE` is never returned to the client; it is absorbed into `capabilityStatus:"fallback"`. `SERVICE_DEGRADED` with `cause:"WARD_REFERENCE_UNAVAILABLE"`.

---

### C-011: Ward confirmation and unresolved queueing

**Status:** Frozen

**Auth:** Member session

**Surface:** Server action `confirmWard` on `/join/ward`

**Spec anchors:** FEAT-002, EVT-007, EVT-008, `screens/05-ward-confirmation.md`, `screens/13-my-record.md`

**Authority:** Writes `Member.wardId` and `Member.wardStatus` on the caller's own record. When no candidate is accepted, writes a `queued` WardDescriptionReview and leaves the member `unresolved`. Never moves an existing submission.

**Request (candidate confirmed):**
```json
{
  "memberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
  "description": "Behind Agbowo market, near the express",
  "localGovernmentArea": "Ibadan North",
  "confirmedWardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
  "confirmedRank": 1
}
```

**Request (none of these):**
```json
{
  "memberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
  "description": "After the old cocoa shed, before the river",
  "localGovernmentArea": "Ibadan North",
  "confirmedWardId": null,
  "noneOfThese": true
}
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "member": { "id": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA", "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "wardStatus": "resolved" },
    "wardDescriptionReview": null,
    "nextScreen": "/"
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:20:00Z" }
}
```
The unresolved branch returns `200` with `member.wardStatus:"unresolved"`, `member.wardId` absent, and `wardDescriptionReview: { "id": "wdr_01J9Z7A3B5C7D9E1F3G5H7J9KM", "status": "queued", "createdAt": "2026-11-18T09:20:00Z" }`.

**Errors:** `VALIDATION_FAILED` with `fields:{"description":["REQUIRED","TOO_LONG"],"localGovernmentArea":"REQUIRED"}` when the local government area is required to disambiguate two wards with one name. `FORBIDDEN_ROLE` when `memberId` is not the session's member. `NOT_FOUND` when `confirmedWardId` does not exist. `SERVICE_DEGRADED` with `cause:"WARD_REFERENCE_UNAVAILABLE"`; the free-text description alone is then accepted and queued.

---

### C-012: Submission draft save

**Status:** Frozen

**Auth:** Member session

**Surface:** Server action `saveSubmissionDraft` on `/submit`; transport `PUT /api/submission-drafts/{draftId}` for a subsequent save

**Spec anchors:** FEAT-003, EVT-010, `screens/06-submission-form.md`

**Authority:** Holds a private SubmissionDraft. Never publishes, never becomes public, and never appears in search.

**Request:**
```json
{
  "draftId": null,
  "type": "proposal",
  "body": "The borehole at Agbowo market has been dry since March and the women selling there buy water from vendors.",
  "pillar": "infrastructure",
  "locationText": "Agbowo market, behind the express",
  "locationScope": "in_state",
  "costBand": "5m_to_20m",
  "responsibleAuthority": "Ibadan North Local Government",
  "containsNamedEntity": false,
  "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
  "wardStatus": "resolved"
}
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "id": "sdr_01J9Z7C5E7G9J1L3N5P7Q9R1ST",
    "authorId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
    "status": "draft",
    "createdAt": "2026-11-18T09:30:00Z",
    "updatedAt": "2026-11-18T09:30:00Z",
    "expiresAt": "2026-12-18T09:30:00Z"
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:30:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `fields` for `type` (`ENUM_MISMATCH`), `body` (`TOO_LONG` at 2000), `pillar` (`ENUM_MISMATCH`), `locationText` (`TOO_LONG` at 300), `costBand` (`ENUM_MISMATCH`), `responsibleAuthority` (`TOO_LONG` at 200). `FORBIDDEN_ROLE` when the draft belongs to another member. `NOT_FOUND` when `draftId` is unknown or expired. `WRITE_QUEUED` when the primary store is unavailable.

---

### C-013: Submission draft discard

**Status:** Frozen

**Auth:** Member session

**Surface:** Route handler `DELETE /api/submission-drafts/{draftId}`

**Spec anchors:** FEAT-003, `screens/06-submission-form.md`

**Authority:** Discards the caller's own draft. A discarded draft is not recoverable.

**Request:**
```json
{ "path": { "draftId": "sdr_01J9Z7C5E7G9J1L3N5P7Q9R1ST" } }
```

**Response 204:** no body.

**Errors:** `NOT_FOUND` when the draft is unknown, expired or owned by another member. `UNAUTHENTICATED`. `FORBIDDEN_ROLE` for a staff session.

---

### C-014: Submission publication

**Status:** Frozen

**Auth:** Member session

**Surface:** Server action `publishSubmission` on `/submit`

**Spec anchors:** FEAT-003, FEAT-002, NFR-005, NFR-027, EVT-012, EVT-013, `screens/06-submission-form.md`, `screens/07-submission-detail.md`

**Authority:** Creates the Submission, allocates its public `reference`, starts the twenty-one-day clock at `submittedAt`, and indexes it for search. A submission whose author declared a named person or company is created with `status:"withheld"` and does not publish. A submission outside Oyo State is created with `status:"out_of_area"`.

**Request:**
```json
{
  "draftId": "sdr_01J9Z7C5E7G9J1L3N5P7Q9R1ST",
  "type": "proposal",
  "body": "The borehole at Agbowo market has been dry since March and the women selling there buy water from vendors.",
  "pillar": "infrastructure",
  "locationText": "Agbowo market, behind the express",
  "locationScope": "in_state",
  "costBand": "5m_to_20m",
  "responsibleAuthority": "Ibadan North Local Government",
  "containsNamedEntity": false,
  "similarSubmissionChoice": "continued"
}
```
`similarSubmissionChoice` is `backed` or `continued` when the Similar Submission sheet was shown, and absent otherwise.

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "submission": {
      "id": "sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST",
      "reference": "ODP-004821",
      "authorId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
      "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
      "wardStatus": "resolved",
      "type": "proposal",
      "pillar": "infrastructure",
      "locationScope": "in_state",
      "status": "awaiting_decision",
      "source": "web",
      "submittedAt": "2026-11-18T09:40:00Z",
      "decisionDueAt": "2026-12-09T09:40:00Z",
      "ledgerEligible": true
    }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:40:00Z" }
}
```
For a withheld submission the response is `201` with `status:"withheld"`, `ledgerEligible:true`, and `legalReviewId` set. For an out-of-area submission it is `201` with `status:"out_of_area"` and `ledgerEligible:false`.

**Errors:** `VALIDATION_FAILED` with `fields` naming every missing requirement: `body` (`REQUIRED`, `TOO_SHORT` below 30, `TOO_LONG` above 2000), `pillar` (`REQUIRED`, `ENUM_MISMATCH`), `locationText` (`REQUIRED`, `TOO_LONG`), `locationScope` (`REQUIRED`), `costBand` (`REQUIRED` for a proposal, `ENUM_MISMATCH`), `responsibleAuthority` (`REQUIRED` for a proposal, `TOO_LONG`). `POLICY_VIOLATION` with `cause:"WARD_UNRESOLVED"` is **not** raised: the submission is accepted with `wardStatus:"unresolved"`. `RATE_LIMITED` per account and per ward. `LEGAL_HOLD` is not raised at creation; the submission is created withheld instead. `WRITE_QUEUED` with a durable queue entry when the primary store is unavailable; the original `submittedAt` is supplied by the client as `clientSubmittedAt` and preserved on replay.

---

### C-015: Submission withdrawal

**Status:** Frozen

**Auth:** Member session

**Surface:** Server action `withdrawSubmission` on `/s/{reference}`

**Spec anchors:** FEAT-007, FEAT-008, FEAT-005, `screens/07-submission-detail.md`, `screens/09-public-ledger.md`

**Authority:** Sets `Submission.status` to `withdrawn` and `withdrawnAt`. Backings remain recorded and are shown as withdrawn. A commitment created by a decision stays in the register with `withdrawnByAuthor:true`. The ledger entry stays.

**Request:**
```json
{ "reference": "ODP-004821", "reason": null }
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "submission": { "reference": "ODP-004821", "status": "withdrawn", "withdrawnAt": "2026-11-20T11:02:00Z" },
    "backingsRetained": 37,
    "commitment": { "id": "cmt_01J9ZA1B3C5D7E9F1G3H5J7KMP", "withdrawnByAuthor": true, "authorWithdrawnAt": "2026-11-20T11:02:00Z" }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-20T11:02:00Z" }
}
```

**Errors:** `FORBIDDEN_ROLE` when the caller is not `authorId`. `CONFLICT_ALREADY_DECIDED` with `cause:"ALREADY_WITHDRAWN"`. `LEGAL_HOLD` when the submission is under an open LegalReview with `status:"open"`; withdrawal is refused while the case is undecided, and `meta.reviewDate` is returned. `NOT_FOUND`.

---

### C-016: Similar submission suggestion

**Status:** Frozen

**Auth:** Member session

**Surface:** Route handler `POST /api/submissions/similar`

**Spec anchors:** FEAT-003, FEAT-005, NFR-012, NFR-050, EVT-011, EVT-014, EVT-039, EVT-040, `screens/06-submission-form.md`

**Authority:** Ranks up to three existing submissions in the same ward. Never merges, blocks, hides or rewrites anything. The author's choice is recorded either way.

**Request:**
```json
{
  "body": "The borehole at Agbowo market has been dry since March and the women selling there buy water from vendors.",
  "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
  "type": "proposal",
  "pillar": "infrastructure"
}
```

**Response 200:**
```json
{
  "data": {
    "candidates": [
      {
        "submissionId": "sub_01J9Z4P1Q2R3S4T5V6W7X8Y9ZA",
        "reference": "ODP-004102",
        "body": "Agbowo market borehole has not worked since the rains stopped; traders are buying water.",
        "status": "awaiting_decision",
        "backingCount": 54,
        "checkedBackingCount": 21,
        "similarityScore": 0.91,
        "rank": 1
      }
    ],
    "capabilityStatus": "on",
    "blocking": false
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:35:00Z", "degraded": false }
}
```
When the capability is unavailable the response is `200` with `capabilityStatus:"fallback"` and candidates from exact and near-string matching; when that finds nothing, `candidates` is empty and the submission publishes with no suggestion.

**Errors:** `VALIDATION_FAILED` with `fields` for `body` (`REQUIRED`, `TOO_LONG`), `wardId` (`REQUIRED`). `NOT_FOUND` when `wardId` is unknown. `SERVICE_DEGRADED` with `cause:"SEARCH_UNAVAILABLE"`; the draft is still publishable.

---

### C-017: Backing creation

**Status:** Frozen

**Auth:** Member session

**Surface:** Server action `backSubmission` on `/s/{reference}`

**Spec anchors:** FEAT-005, FEAT-002, NFR-006, NFR-027, EVT-014, EVT-015, `screens/07-submission-detail.md`

**Authority:** Records one Backing for one member against one submission, capturing `identityStateAtBacking` and `wardIdAtBacking` at the moment of the write. Never allows a member to back the same submission twice and never allows an author to back their own.

**Request:**
```json
{ "reference": "ODP-004821", "identityStateAtBacking": "checked" }
```
`identityStateAtBacking` is advisory; the server stamps the authoritative value and ignores a mismatch.

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "backing": {
      "id": "bkg_01J9Z7F1G3H5J7K9L1M3N5P7QR",
      "submissionId": "sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST",
      "memberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
      "identityStateAtBacking": "checked",
      "wardIdAtBacking": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
      "state": "active",
      "createdAt": "2026-11-18T10:00:00Z"
    },
    "counts": { "backingCount": 55, "checkedBackingCount": 22, "countState": "published", "wardSpread": [{ "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "count": 31 }] }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T10:00:00Z" }
}
```
When the concentration rule in `C-085` fires, `countState` is `"under_review"` and the public count is held rather than the member rejected.

**Errors:** `CONFLICT_DUPLICATE_BACKING` with `fields:{"submissionId":"ALREADY_SET"}`. `POLICY_VIOLATION` with `cause:"AUTHOR_CANNOT_BACK_OWN_SUBMISSION"`, `cause:"WARD_UNRESOLVED"`, or `cause:"SUBMISSION_WITHDRAWN"`. `NOT_FOUND`. `RATE_LIMITED` per account and per ward. `WRITE_QUEUED` when the primary store is unavailable.

---

### C-018: Backing withdrawal

**Status:** Frozen

**Auth:** Member session

**Surface:** Route handler `DELETE /api/submissions/{reference}/backing`

**Spec anchors:** FEAT-005, EVT-016, `screens/07-submission-detail.md`

**Authority:** Sets the caller's own Backing to `withdrawn` and decrements the published count. Never deletes the backing row.

**Request:**
```json
{ "path": { "reference": "ODP-004821" } }
```

**Response 200:**
```json
{
  "data": {
    "backing": { "id": "bkg_01J9Z7F1G3H5J7K9L1M3N5P7QR", "state": "withdrawn" },
    "counts": { "backingCount": 54, "checkedBackingCount": 21, "countState": "published" }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T10:04:00Z" }
}
```

**Errors:** `NOT_FOUND` when no active backing exists for this member and submission. `CONFLICT_ALREADY_DECIDED` with `cause:"BACKING_ALREADY_WITHDRAWN"`. `UNAUTHENTICATED`. A backing held by the anomaly review is withdrawn on request; the published count is recalculated and remains `under_review` until the case closes.

---

### C-019: Comment publication

**Status:** Frozen

**Auth:** Member session

**Surface:** Server action `postComment` on `/s/{reference}`

**Spec anchors:** FEAT-006, FEAT-014, NFR-025, NFR-027, EVT-020, EVT-021, EVT-043, `screens/07-submission-detail.md`

**Authority:** Creates a Comment in `published`, `held_for_legal` or `removed` state. A routing label may be attached as `routingFlag`; it never changes status on its own and is never published. A thread that is locked accepts no comments.

**Request:**
```json
{
  "reference": "ODP-004821",
  "body": "The tender was never advertised in this ward, so how did the contractor get chosen?"
}
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "comment": {
      "id": "cmt_01J9Z7G3H5J7K9L1M3N5P7Q9RS",
      "submissionId": "sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST",
      "authorId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
      "body": "The tender was never advertised in this ward, so how did the contractor get chosen?",
      "status": "published",
      "createdAt": "2026-11-18T10:12:00Z"
    },
    "routingFlagApplied": false
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T10:12:00Z" }
}
```
A comment classified `named_allegation` or declared by its author to name a person or company is created with `status:"held_for_legal"` and `legalReviewId` present; the author is told it is held. `routingFlag` is never returned to the public client.

**Errors:** `VALIDATION_FAILED` with `fields:{"body":["REQUIRED","TOO_SHORT","TOO_LONG"]}`. `POLICY_VIOLATION` with `cause:"THREAD_LOCKED"` or `cause:"SUBMISSION_WITHDRAWN"`. `NOT_FOUND`. `RATE_LIMITED`. `WRITE_QUEUED` with the text preserved.

---

### C-020: Comment withdrawal by author

**Status:** Frozen

**Auth:** Member session

**Surface:** Route handler `DELETE /api/comments/{commentId}`

**Spec anchors:** FEAT-006, `screens/07-submission-detail.md`

**Authority:** Sets `Comment.status` to `withdrawn`. Replies remain readable beneath a note. Never deletes the text, because the moderation and legal record depend on it.

**Request:**
```json
{ "path": { "commentId": "cmt_01J9Z7G3H5J7K9L1M3N5P7Q9RS" } }
```

**Response 200:**
```json
{
  "data": { "comment": { "id": "cmt_01J9Z7G3H5J7K9L1M3N5P7Q9RS", "status": "withdrawn" }, "repliesRetained": 3 },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T10:20:00Z" }
}
```

**Errors:** `FORBIDDEN_ROLE` when the caller is not `authorId`. `CONFLICT_ALREADY_DECIDED` when the comment is `removed` or already `withdrawn`; a removed comment is appealed under `C-021`, not withdrawn. `LEGAL_HOLD` when an open LegalReview concerns the comment.

---

### C-021: Appeal submission

**Status:** Frozen

**Auth:** Member session

**Surface:** Server action `appealRemoval` on `/s/{reference}`

**Spec anchors:** FEAT-011, FEAT-006, EVT-025, `screens/07-submission-detail.md`

**Authority:** Creates an Appeal in `open` and queues it to the external reviewer. Never restores the comment and never decides the case.

**Request:**
```json
{
  "commentId": "cmt_01J9Z7G3H5J7K9L1M3N5P7Q9RS",
  "reason": "The comment criticises the contractor selection and names no person; rule R-02 does not apply."
}
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "appeal": {
      "id": "apl_01J9Z7H5J7K9L1M3N5P7Q9R1ST",
      "commentId": "cmt_01J9Z7G3H5J7K9L1M3N5P7Q9RS",
      "memberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
      "reason": "The comment criticises the contractor selection and names no person; rule R-02 does not apply.",
      "status": "open",
      "createdAt": "2026-11-18T10:30:00Z"
    },
    "decisionDueAt": "2026-11-23T10:30:00Z"
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T10:30:00Z" }
}
```

**Errors:** `FORBIDDEN_ROLE` when the caller is not the comment's author. `POLICY_VIOLATION` with `cause:"COMMENT_NOT_REMOVED"`. `CONFLICT_ALREADY_DECIDED` when an appeal for this removal is already `upheld` or `reversed`. `VALIDATION_FAILED` with `fields:{"reason":["REQUIRED","TOO_LONG"]}`. `NOT_FOUND`.

---

### C-022: Content report submission

**Status:** Frozen

**Auth:** Member session

**Surface:** Server action `reportContent` on `/s/{reference}`

**Spec anchors:** FEAT-014, NFR-043, EVT-043, `screens/07-submission-detail.md`, `operations.md` Moderation & Abuse

**Authority:** Raises a LegalReview in `open`. A report never changes the submission's or comment's status, visibility or count on its own; only `C-054` decides.

**Request:**
```json
{
  "submissionId": "sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST",
  "commentId": null,
  "reason": "This names a company and accuses it of fraud."
}
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "legalReview": {
      "id": "lrv_01J9Z7J7K9L1M3N5P7Q9R1S3TU",
      "submissionId": "sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST",
      "commentId": null,
      "requestedById": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
      "reason": "This names a company and accuses it of fraud.",
      "status": "open",
      "requestedAt": "2026-11-18T10:40:00Z"
    }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T10:40:00Z" }
}
```
Exactly one of `submissionId` or `commentId` is set. A duplicate report from the same member for the same item returns the existing open case with `201` and `meta.idempotentReplay:true`.

**Errors:** `VALIDATION_FAILED` with `fields:{"reason":["REQUIRED","TOO_LONG"],"submissionId":"EXACTLY_ONE_OF","commentId":"EXACTLY_ONE_OF"}`. `NOT_FOUND`. `RATE_LIMITED`. `LEGAL_HOLD` when a case is already open for the item (`cause:"CASE_ALREADY_OPEN"`, `meta.existingLegalReviewId` returned).

---

### C-023: Submission record read

**Status:** Frozen

**Auth:** Public

**Surface:** Route handler `GET /api/submissions/{reference}`

**Spec anchors:** FEAT-003, FEAT-007, FEAT-008, FEAT-014, NFR-001, `screens/07-submission-detail.md`

**Authority:** Reads the published record. Never returns `telephoneNumber`, `fullName`, `declaredAge`, `authorId` in a resolvable form, or any identifier of a member. Reads are served from the cache and remain available when writes are down.

**Request:**
```json
{ "path": { "reference": "ODP-004821" }, "query": { "commentCursor": null, "commentLimit": 20 } }
```

**Response 200:**
```json
{
  "data": {
    "submission": {
      "id": "sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST",
      "reference": "ODP-004821",
      "authorDisplayName": "Seun A.",
      "recorderDisplayName": null,
      "ward": { "id": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "name": "Ward IV, Agbowo", "localGovernmentArea": "Ibadan North" },
      "type": "proposal",
      "body": "The borehole at Agbowo market has been dry since March and the women selling there buy water from vendors.",
      "pillar": "infrastructure",
      "locationText": "Agbowo market, behind the express",
      "locationScope": "in_state",
      "costBand": "5m_to_20m",
      "responsibleAuthority": "Ibadan North Local Government",
      "status": "decided",
      "source": "web",
      "submittedAt": "2026-11-18T09:40:00Z",
      "withdrawnAt": null,
      "overdue": false,
      "backing": { "backingCount": 55, "checkedBackingCount": 22, "countState": "published", "wardSpread": [{ "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "count": 31 }] }
    },
    "decision": {
      "id": "dec_01J9ZB1C3D5E7F9G1H3J5K7LMP",
      "version": 1,
      "type": "commit",
      "reason": "The borehole is on the 2027 water programme for Ibadan North and the contractor is named in the published procurement notice.",
      "authority": null,
      "signatoryDisplayName": "A. Balogun",
      "supersedesDecisionId": null,
      "publishedAt": "2026-11-25T12:00:00Z"
    },
    "supersededDecisions": [],
    "commitment": {
      "id": "cmt_01J9ZB2D4E6F8G1H3J5K7L9MNP",
      "owner": "Director, Water Resources, Ibadan North",
      "costBand": "5m_to_20m",
      "targetDate": "2027-03-31",
      "status": "committed",
      "statusReason": null,
      "withdrawnByAuthor": false,
      "pillar": "infrastructure",
      "budgetLineReference": null,
      "budgetLineAmount": null,
      "budgetLineConfirmedById": null,
      "updatedAt": "2026-11-25T12:00:00Z"
    },
    "legalNote": null,
    "discussion": { "locked": false, "comments": [] }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-25T12:00:30Z", "degraded": false },
  "page": { "nextCursor": null, "hasMore": false }
}
```

**Errors:** `NOT_FOUND` when the reference is unknown. `SERVICE_DEGRADED` with `meta.degradedReason:"READ_CACHE"` when the primary store is unavailable; the last rendered page is served with its `asAt`. A held or taken-down submission is returned `200` with `legalNote` populated and no body text.

---

### C-024: Commitment register read

**Status:** Frozen

**Auth:** Public

**Surface:** Route handler `GET /api/commitments`

**Spec anchors:** FEAT-007, NFR-001, `screens/08-commitment-register.md`

**Authority:** Reads commitments. No filter can remove the ledger link or hide a status.

**Request:**
```json
{
  "query": {
    "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
    "localGovernmentArea": "Ibadan North",
    "pillar": "infrastructure",
    "status": "committed",
    "cursor": null,
    "limit": 20
  }
}
```

**Response 200:**
```json
{
  "data": {
    "totals": { "committed": 41, "delivered": 12, "slipped": 5, "dropped": 3, "asAt": "2026-11-25T12:00:00Z" },
    "resultCount": 41,
    "commitments": [
      {
        "id": "cmt_01J9ZB2D4E6F8G1H3J5K7L9MNP",
        "reference": "ODP-004821",
        "pillar": "infrastructure",
        "owner": "Director, Water Resources, Ibadan North",
        "costBand": "5m_to_20m",
        "targetDate": "2027-03-31",
        "status": "committed",
        "statusReason": null,
        "withdrawnByAuthor": false,
        "ward": { "id": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "name": "Ward IV, Agbowo" },
        "updatedAt": "2026-11-25T12:00:00Z"
      }
    ],
    "ledgerPath": "/declined"
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-25T12:00:00Z", "degraded": false },
  "page": { "nextCursor": "c_01J9ZB3E5F7G9H1J3K5L7M9NPQ", "hasMore": true }
}
```

**Errors:** `VALIDATION_FAILED` with `fields` for `pillar` (`ENUM_MISMATCH`), `status` (`ENUM_MISMATCH`), `limit` (`OUT_OF_BAND` above 50). `NOT_FOUND` when `wardId` is unknown. `SERVICE_DEGRADED` with the last rendered page and its `asAt`; a stale total is never returned without its date.

---

### C-025: Public ledger read

**Status:** Frozen

**Auth:** Public

**Surface:** Route handler `GET /api/ledger`

**Spec anchors:** FEAT-008, NFR-003, `screens/09-public-ledger.md`

**Authority:** Reads the declined, unanswered and withheld record. Out-of-area submissions are excluded by construction. A withheld entry is counted and labelled; a takedown never removes a row.

**Request:**
```json
{ "query": { "wardId": null, "month": "2026-11", "cursor": null, "limit": 20 } }
```

**Response 200:**
```json
{
  "data": {
    "totals": { "declined": 18, "unanswered": 7, "withheld": 2, "asAt": "2026-11-25T12:00:00Z", "period": "2026-11" },
    "reconciliationNote": "These figures reconcile with the published answer rate. Out-of-area submissions are excluded.",
    "entries": [
      {
        "reference": "ODP-004512",
        "outcomeLabel": "unanswered",
        "ward": { "id": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "name": "Ward IV, Agbowo" },
        "submittedAt": "2026-10-30T08:10:00Z",
        "daysOverdue": 5,
        "decision": null,
        "legalNote": null
      },
      {
        "reference": "ODP-004401",
        "outcomeLabel": "declined",
        "ward": { "id": "wrd_01J9Z5B2C3D4E5F6G7H8J9KMP", "name": "Ward V, Bodija" },
        "submittedAt": "2026-10-02T11:00:00Z",
        "daysOverdue": null,
        "decision": { "type": "decline", "reason": "The land in question is under a state acquisition order, so the local government cannot grant the request.", "signatoryDisplayName": "A. Balogun", "publishedAt": "2026-10-14T09:00:00Z" },
        "legalNote": null
      }
    ]
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-25T12:00:00Z", "degraded": false },
  "page": { "nextCursor": "c_01J9ZB4F6G8H1J3K5L7M9NPQR", "hasMore": true }
}
```
`outcomeLabel` is one of `declined`, `unanswered`, `withheld`, `later_accepted`, `withdrawn`. It is a presentation label derived from `Submission.status`, `Decision.type` and `LegalReview.status`; it is not a stored enum.

**Errors:** `VALIDATION_FAILED` with `fields:{"month":"PATTERN_MISMATCH"}` outside `YYYY-MM`. `SERVICE_DEGRADED` with the cached ledger and its `asAt`. `NOT_FOUND` is never returned for an empty ledger; an empty ledger is `200` with zero totals.

---

### C-026: Ward report read

**Status:** Frozen

**Auth:** Public

**Surface:** Route handler `GET /api/wards/{wardId}/report`

**Spec anchors:** FEAT-009, FEAT-002, NFR-002, EVT-031, `screens/10-ward-report.md`

**Authority:** Reads a ward report. A closed quarter is read from the fixed snapshot published with its report card; the open quarter is read live and labelled as current. Figures below five in a ward-pillar cell are suppressed and the cell says so.

**Request:**
```json
{ "path": { "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM" }, "query": { "quarter": "2026-Q4" } }
```

**Response 200:**
```json
{
  "data": {
    "ward": { "id": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "name": "Ward IV, Agbowo", "localGovernmentArea": "Ibadan North" },
    "quarter": "2026-Q4",
    "basis": "snapshot",
    "counters": { "submissions": 63, "decisions": 51, "commitments": 22, "overdue": 4, "generatedAt": "2027-01-02T05:00:00Z" },
    "pillars": [
      {
        "pillar": "infrastructure",
        "submissions": 24,
        "decisions": 20,
        "commitments": 9,
        "overdue": 2,
        "suppressionApplied": false
      },
      {
        "pillar": "agriculture_and_minerals",
        "submissions": 3,
        "decisions": null,
        "commitments": null,
        "overdue": null,
        "suppressionApplied": true
      }
    ],
    "statewideCommitments": 214,
    "unresolvedDescriptionCount": 2,
    "neighbouringWards": [{ "id": "wrd_01J9Z5B2C3D4E5F6G7H8J9KMP", "name": "Ward V, Bodija" }]
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2027-01-02T05:00:00Z", "degraded": false }
}
```
A suppressed cell returns `null` for a count and `suppressionApplied:true`; it never returns a substituted or rounded figure. When no card exists for the requested quarter, `basis` is `"live"` and the current figures are returned with `meta.degradedReason:"REPORT_STALE"` only if a stale snapshot is served.

**Errors:** `VALIDATION_FAILED` with `fields:{"quarter":"PATTERN_MISMATCH"}` outside `YYYY-QN`. `NOT_FOUND` when the ward is unknown. `SERVICE_DEGRADED` with the last generated report and its date.

---

### C-027: Quarterly report card read

**Status:** Frozen

**Auth:** Public

**Surface:** Route handler `GET /api/report-cards`

**Spec anchors:** FEAT-009, `screens/11-quarterly-report-card.md`

**Authority:** Reads a published card and its ward table. Never composes a partial card; a missing or failed card yields the most recent published one, labelled.

**Request:**
```json
{ "query": { "quarter": "2026-Q4" } }
```

**Response 200:**
```json
{
  "data": {
    "reportCard": {
      "id": "rpc_01J9ZC1D3E5F7G9H1J3K5L7MNP",
      "quarter": "2026-Q4",
      "cutOffAt": "2026-12-31T23:59:59Z",
      "publishedAt": "2027-01-02T06:00:00Z",
      "status": "published",
      "correctionOfId": null,
      "answerRate": 0.86,
      "deliveryRate": 0.71,
      "committedCount": 214,
      "deliveredCount": 61,
      "slippedCount": 12,
      "droppedCount": 7,
      "summaryNote": "Two thirds of the quarter's commitments are on schedule; the water programme slipped in three wards."
    },
    "movement": [
      { "fromStatus": "committed", "toStatus": "delivered", "changedAt": "2026-12-04T10:00:00Z", "count": 61 },
      { "fromStatus": "committed", "toStatus": "slipped", "changedAt": "2026-12-19T10:00:00Z", "count": 12 }
    ],
    "wardTable": [
      { "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "submissions": 63, "decisions": 51, "commitments": 22, "overdue": 4, "suppressionApplied": false }
    ],
    "previousQuarters": ["2026-Q3", "2026-Q2"]
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2027-01-02T06:00:05Z", "degraded": false }
}
```

**Errors:** `VALIDATION_FAILED` with `fields:{"quarter":"PATTERN_MISMATCH"}`. `NOT_FOUND` when no card has ever been published; the response then carries `meta.mostRecentQuarter:null` and the screen states that the current quarter is in progress. `SERVICE_DEGRADED` with the most recent card and its `publishedAt`.

---

### C-028: Session detail and record read

**Status:** Frozen

**Auth:** Public

**Surface:** Route handler `GET /api/sessions/{sessionId}`

**Spec anchors:** FEAT-010, `screens/12-session-detail.md`

**Authority:** Reads a session, its remaining places and its published record. The record is readable whether or not the reader holds a reservation.

**Request:**
```json
{ "path": { "sessionId": "ses_01J9ZD1E3F5G7H9J1K3L5M7NPQ" } }
```

**Response 200:**
```json
{
  "data": {
    "session": {
      "id": "ses_01J9ZD1E3F5G7H9J1K3L5M7NPQ",
      "title": "Ibadan North youth session",
      "localGovernmentArea": "Ibadan North",
      "venue": "Agbowo Community Hall",
      "startsAt": "2027-01-16T10:00:00Z",
      "capacity": 200,
      "status": "scheduled",
      "cancellationReason": null,
      "rescheduledFromId": null,
      "recordPublishedAt": null
    },
    "reservedCount": 186,
    "waitlistedCount": 9,
    "placesRemaining": 14,
    "myReservation": { "id": "rsv_01J9ZD2F4G6H8J1K3L5M7NPQR", "status": "reserved", "waitlistPosition": null },
    "questionsReceived": 48,
    "record": null
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-12-01T08:00:00Z", "degraded": false }
}
```
`record` is present only when `recordPublishedAt` is set, and then carries `questionsAsked`, `questionsUnreached` and the per-question `questionText`, `answerText`, `outcome` list. A question held for legal review appears only as a count in `record.questionsHeld`, never as text.

**Errors:** `NOT_FOUND`. `SERVICE_DEGRADED` with the cached session page and its `asAt`.

---

### C-029: Session reservation

**Status:** Frozen

**Auth:** Member session

**Surface:** Server action `reserveSessionPlace` on `/sessions/{id}`

**Spec anchors:** FEAT-010, EVT-033, `screens/12-session-detail.md`

**Authority:** Creates one Reservation for one member and one session, as `reserved` or `waitlisted`. Two members reserving the last place resolve to one reservation and one waitlist position. A retry never creates a duplicate.

**Request:**
```json
{ "sessionId": "ses_01J9ZD1E3F5G7H9J1K3L5M7NPQ" }
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "reservation": {
      "id": "rsv_01J9ZD2F4G6H8J1K3L5M7NPQR",
      "sessionId": "ses_01J9ZD1E3F5G7H9J1K3L5M7NPQ",
      "memberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
      "status": "waitlisted",
      "waitlistPosition": 10,
      "createdAt": "2026-12-01T08:04:00Z"
    },
    "placesRemaining": 0,
    "whatToBring": "A means of identification and the reference of any submission you want to speak to."
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-12-01T08:04:00Z" }
}
```
A repeat call for the same member and session returns `200` with the existing reservation and `meta.idempotentReplay:true`.

**Errors:** `POLICY_VIOLATION` with `cause:"SESSION_CLOSED"` or `cause:"SESSION_CANCELLED"`; the replacement session id is returned in `meta.rescheduledToId`. `NOT_FOUND`. `RATE_LIMITED`. `WRITE_QUEUED` with a durable queue entry.

---

### C-030: Session reservation cancellation

**Status:** Frozen

**Auth:** Member session

**Surface:** Route handler `DELETE /api/sessions/{sessionId}/reservations/mine`

**Spec anchors:** FEAT-010, `screens/12-session-detail.md`

**Authority:** Sets the caller's own Reservation to `cancelled` and releases the place to the first waitlisted member. No penalty is recorded.

**Request:**
```json
{ "path": { "sessionId": "ses_01J9ZD1E3F5G7H9J1K3L5M7NPQ" } }
```

**Response 200:**
```json
{
  "data": { "reservation": { "id": "rsv_01J9ZD2F4G6H8J1K3L5M7NPQR", "status": "cancelled" }, "placesRemaining": 1 },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-12-01T08:20:00Z" }
}
```

**Errors:** `NOT_FOUND` when the caller holds no reservation. `POLICY_VIOLATION` with `cause:"SESSION_ALREADY_HELD"` when the session has taken place.

---

### C-031: Session question submission

**Status:** Frozen

**Auth:** Member session

**Surface:** Server action `submitSessionQuestion` on `/sessions/{id}`

**Spec anchors:** FEAT-010, EVT-034, `screens/12-session-detail.md`

**Authority:** Creates a SessionQuestion with `selected:false` and `outcome:"not_reached"` until a staff member selects and answers it. A question naming a person or company in an allegation is held for legal review and cannot be selected.

**Request:**
```json
{ "sessionId": "ses_01J9ZD1E3F5G7H9J1K3L5M7NPQ", "questionText": "Why was the Agbowo water contract not advertised in the ward?" }
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "sessionQuestion": {
      "id": "sq_01J9ZD3G5H7J9K1L3M5N7P9QRS",
      "sessionId": "ses_01J9ZD1E3F5G7H9J1K3L5M7NPQ",
      "memberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
      "questionText": "Why was the Agbowo water contract not advertised in the ward?",
      "selected": false,
      "outcome": "not_reached",
      "createdAt": "2026-12-01T08:30:00Z"
    }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-12-01T08:30:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `fields:{"questionText":["REQUIRED","TOO_LONG"]}`. `POLICY_VIOLATION` with `cause:"SESSION_CLOSED"` when the session has taken place and its record published. `NOT_FOUND`. `RATE_LIMITED`. `WRITE_QUEUED`.

---

### C-032: My Record read

**Status:** Frozen

**Auth:** Member session

**Surface:** Route handler `GET /api/me`

**Spec anchors:** FEAT-012, NFR-040, `screens/13-my-record.md`

**Authority:** Rendered by the Identity and Access Service for the member alone. This is the only read in the system permitted to return `fullName`, `telephoneNumber` and `declaredAge`, and it returns them only for the session's own member.

**Request:**
```json
{ "query": { "submissionCursor": null, "submissionLimit": 20 } }
```

**Response 200:**
```json
{
  "data": {
    "member": {
      "id": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
      "fullName": "Oluwaseun Adeyemi",
      "telephoneNumber": "+2348031234567",
      "displayName": "Seun A.",
      "declaredAge": 24,
      "identityState": "checked",
      "wardStatus": "resolved",
      "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
      "locale": "en-NG",
      "createdAt": "2026-11-18T09:16:00Z",
      "sharedNumber": false
    },
    "consents": [
      { "id": "cns_01J9ZE1F3G5H7J9K1L3M5N7PQR", "purpose": "decision_notices", "granted": true, "recordedAt": "2026-11-18T09:16:00Z", "withdrawnAt": null }
    ],
    "submissions": [
      { "reference": "ODP-004821", "status": "decided", "decision": { "type": "commit", "authority": null } }
    ],
    "heldBackings": [
      { "submissionReference": "ODP-004102", "submissionStatus": "awaiting_decision", "backingState": "active" }
    ],
    "dataRequests": [
      { "id": "drq_01J9ZE2G4H6J8K1L3M5N7P9QRS", "type": "export", "status": "completed", "requestedAt": "2026-11-20T09:00:00Z", "fileReference": "exports/mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA/2026-11-20.zip" }
    ],
    "heldItems": []
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-20T09:05:00Z", "degraded": false },
  "page": { "nextCursor": null, "hasMore": false }
}
```

**Errors:** `UNAUTHENTICATED`. `FORBIDDEN_ROLE` for any staff session; there is no staff view of this response. `SERVICE_DEGRADED` with `cause:"IDENTITY_STORE_UNAVAILABLE"`; no partial personal data is returned.

---

### C-033: Profile correction

**Status:** Frozen

**Auth:** Member session

**Surface:** Server action `correctMyDetails` on `/me`

**Spec anchors:** FEAT-012, NFR-040, `screens/13-my-record.md`

**Authority:** Corrects `displayName`, `fullName` and `locale` on the caller's own Member row. Never rewrites the public record: earlier comments and submissions keep the display name attributed at the time of writing, with a note.

**Request:**
```json
{
  "displayName": "Seun Adeyemi",
  "fullName": "Oluwaseun Adeyemi",
  "locale": "yo-NG"
}
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "member": { "id": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA", "displayName": "Seun Adeyemi", "fullName": "Oluwaseun Adeyemi", "locale": "yo-NG" },
    "previousDisplayNameRetainedOn": { "submissions": 2, "comments": 5 }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-21T07:00:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `fields` for `displayName` (`REQUIRED`, `TOO_LONG` at 60, `ALREADY_SET` when disambiguation is needed), `fullName` (`REQUIRED`, `TOO_LONG` at 160), `locale` (`ENUM_MISMATCH`). `RATE_LIMITED` on repeated display-name changes. `SERVICE_DEGRADED` with `cause:"IDENTITY_STORE_UNAVAILABLE"`.

---

### C-034: Consent update

**Status:** Frozen

**Auth:** Member session

**Surface:** Server action `updateConsent` on `/me`

**Spec anchors:** FEAT-012, EVT-046, `screens/13-my-record.md`

**Authority:** Grants or withdraws exactly one optional purpose. Takes effect immediately. Consent is never bundled into registration and never inferred.

**Request:**
```json
{ "purpose": "record_transfer", "granted": false }
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "consent": {
      "id": "cns_01J9ZE3H5J7K9L1M3N5P7Q9RST",
      "memberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
      "purpose": "record_transfer",
      "granted": false,
      "recordedAt": "2026-10-02T09:00:00Z",
      "withdrawnAt": "2026-11-21T07:10:00Z"
    },
    "effectiveImmediately": true
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-21T07:10:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `fields:{"purpose":["REQUIRED","ENUM_MISMATCH"],"granted":["REQUIRED","ENUM_MISMATCH"]}`. `CONFLICT_ALREADY_DECIDED` with `cause:"CONSENT_ALREADY_IN_STATE"`. `SERVICE_DEGRADED`.

---

### C-035: Data request creation

**Status:** Frozen

**Auth:** Member session

**Surface:** Server action `createDataRequest` on `/me`

**Spec anchors:** FEAT-012, NFR-040, EVT-036, `screens/13-my-record.md`, `screens/22-data-request-queue.md`

**Authority:** Creates a DataRequest in `received`. Never performs the request itself. A deletion request against an item under legal hold is deferred, not refused silently.

**Request:**
```json
{ "type": "deletion", "note": null }
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "dataRequest": {
      "id": "drq_01J9ZE4J6K8L1M3N5P7Q9R1STU",
      "memberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
      "type": "deletion",
      "status": "received",
      "requestedAt": "2026-11-21T07:20:00Z"
    },
    "dueAt": "2026-12-21T07:20:00Z",
    "legalHoldDetected": false
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-21T07:20:00Z" }
}
```
`dueAt` is seven days for `access` and `correction`, thirty days for `export` and `deletion`. When a legal hold applies, `legalHoldDetected` is `true`, the request is still created, and the member is told the hold has a review date.

**Errors:** `VALIDATION_FAILED` with `fields:{"type":["REQUIRED","ENUM_MISMATCH"]}`. `CONFLICT_ALREADY_DECIDED` with `cause:"DUPLICATE_EXPORT_REQUEST"` when an export is already open; the existing request id is returned in `meta.existingDataRequestId`. `RATE_LIMITED`. `WRITE_QUEUED`.

---

### C-036: Export file download

**Status:** Frozen

**Auth:** Member session

**Surface:** Route handler `GET /api/me/data-requests/{requestId}/file`

**Spec anchors:** FEAT-012, NFR-040, `screens/13-my-record.md`

**Authority:** Serves the machine-readable export produced for the caller's own completed `export` request. Returns the same file for a repeated request; never generates a second file.

**Request:**
```json
{ "path": { "requestId": "drq_01J9ZE2G4H6J8K1L3M5N7P9QRS" } }
```

**Response 200:** binary body, `Content-Type: application/zip`, `Content-Disposition: attachment; filename="odp-export-mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA.zip"`, and a signed object-storage URL valid for five minutes.

**Errors:** `NOT_FOUND` when the request is unknown, belongs to another member, or is not an export. `LEGAL_HOLD` when the request is `deferred_for_legal_hold`, with `meta.legalHoldNote` and `meta.reviewDate`. `SERVICE_DEGRADED` with `cause:"OBJECT_STORAGE_UNAVAILABLE"`.

---

### C-037: Privacy notice read

**Status:** Frozen

**Auth:** Public

**Surface:** Route handler `GET /api/privacy-notice`

**Spec anchors:** FEAT-012, NFR-040, NFR-045, `screens/23-privacy-notice.md`

**Authority:** Reads the published notice and its history. Readable without a session, because it must be readable before registration.

**Request:**
```json
{ "query": { "version": null } }
```

**Response 200:**
```json
{
  "data": {
    "notice": {
      "version": "2026-11-01",
      "effectiveAt": "2026-11-01T00:00:00Z",
      "summary": "What you submit is public. Your name and number are never published.",
      "lawfulBasis": [],
      "rights": [],
      "retention": [],
      "processors": [
        { "name": "model provider named in the processing agreement", "purpose": "de-identified inference for ranking, routing and extraction", "region": "named in the processing agreement" }
      ]
    },
    "previousVersions": ["2026-09-15"]
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:14:00Z", "degraded": false }
}
```

**Errors:** `NOT_FOUND` when a requested version has never been published. `SERVICE_DEGRADED` with the last published notice and its `effectiveAt`; the screen never renders blank.

---

### C-038: In-product search

**Status:** Frozen

**Auth:** Public

**Surface:** Route handler `GET /api/search`

**Spec anchors:** FEAT-003, NFR-009, `screens/01-record-home.md`, `screens/08-commitment-register.md`

**Authority:** Queries the Postgres full-text index over published submissions. Returns no draft, no held text and no withdrawn body.

**Request:**
```json
{ "query": { "q": "borehole agbowo", "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "pillar": null, "cursor": null, "limit": 20 } }
```

**Response 200:**
```json
{
  "data": {
    "results": [
      { "reference": "ODP-004821", "title": "Borehole at Agbowo market", "snippet": "…has been dry since March…", "pillar": "infrastructure", "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "status": "decided", "rank": 0.83 }
    ],
    "resultCount": 1,
    "fallbackPath": null
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T09:14:00Z", "degraded": false },
  "page": { "nextCursor": null, "hasMore": false }
}
```
When the index is unavailable the response is `200` with `results:[]`, `fallbackPath:"/wards/{wardId}"`, and `meta.degradedReason:"SEARCH_UNAVAILABLE"`; the screen offers the ward list and its submissions instead.

**Errors:** `VALIDATION_FAILED` with `fields:{"q":["REQUIRED","TOO_SHORT"]}`. `SERVICE_DEGRADED` with the fallback path.

---

### C-039: Language preference update

**Status:** Frozen

**Auth:** Public

**Surface:** Server action `setLocale`

**Spec anchors:** FEAT-012, `screens.md` Footer, `screens/13-my-record.md`

**Authority:** Stores the choice against the Member when signed in, and in the session when signed out. An anonymous choice is applied to the PendingRegistration at `C-002`. Never changes stored content.

**Request:**
```json
{ "locale": "yo-NG" }
```

**Response 200:**
```json
{
  "ok": true,
  "data": { "locale": "yo-NG", "scope": "member", "appliedAt": "2026-11-21T07:30:00Z" },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-21T07:30:00Z" }
}
```
When signed out, `scope` is `"session"` and no Member row is written.

**Errors:** `VALIDATION_FAILED` with `fields:{"locale":["REQUIRED","ENUM_MISMATCH"]}`.

---

## Domain 3 — Admin Console Interfaces

### C-040: Decision queue read

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Route handler `GET /api/admin/decision-queue`

**Spec anchors:** FEAT-007, FEAT-008, NFR-007, `screens/15-decision-queue.md`

**Authority:** Reads the queue ordered by the twenty-one-day deadline, overdue first. Excludes out-of-area submissions, withdrawn submissions and submissions held for legal review. Reports a colleague's reservation without exposing the draft's content.

**Request:**
```json
{ "query": { "wardId": null, "localGovernmentArea": null, "state": "due", "cursor": null, "limit": 20 } }
```
`state` is `due`, `overdue`, `decided` or `all`.

**Response 200:**
```json
{
  "data": {
    "answerRate": { "value": 0.86, "period": "2026-10-01/2026-11-25", "answeredWithin21Days": 258, "eligible": 300 },
    "dueTodayCount": 6,
    "overdueCount": 7,
    "rows": [
      {
        "reference": "ODP-004821",
        "ward": { "id": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "name": "Ward IV, Agbowo" },
        "submittedAt": "2026-11-18T09:40:00Z",
        "decisionDueAt": "2026-12-09T09:40:00Z",
        "daysRemaining": 14,
        "daysOverdue": null,
        "status": "awaiting_decision",
        "backingCount": 55,
        "checkedBackingCount": 22,
        "decisionDraft": { "staffId": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP", "staffDisplayName": "A. Balogun", "reservedUntil": "2026-11-25T14:00:00Z" }
      }
    ]
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-25T10:00:00Z", "degraded": false },
  "page": { "nextCursor": "c_01J9ZF1G3H5J7K9L1M3N5P7QRS", "hasMore": true }
}
```

**Errors:** `FORBIDDEN_ROLE` when the session is not `response_staff` or `operator`; the screen states what the role would require. `SERVICE_DEGRADED` with the last successful queue and its `asAt`.

---

### C-041: Decision reservation

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Server action `reserveDecisionDraft` on `/admin/queue/{reference}/decide`

**Spec anchors:** FEAT-007, EVT-048, `screens/16-decision-composer.md`

**Authority:** Creates or updates one DecisionDraft held by the caller for twenty-four hours. Reserves the case so a colleague cannot publish a competing answer. Does not decide anything.

**Request:**
```json
{
  "reference": "ODP-004821",
  "type": "commit",
  "reason": "The borehole is on the 2027 water programme for Ibadan North.",
  "owner": "Director, Water Resources, Ibadan North",
  "costBand": "5m_to_20m",
  "targetDate": "2027-03-31",
  "pillar": "infrastructure",
  "authority": null
}
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "decisionDraft": {
      "id": "ddr_01J9ZF2H4J6K8L1M3N5P7Q9RST",
      "submissionId": "sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST",
      "staffId": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP",
      "type": "commit",
      "reservedUntil": "2026-11-26T10:00:00Z",
      "createdAt": "2026-11-25T10:00:00Z",
      "updatedAt": "2026-11-25T10:00:00Z"
    }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-25T10:00:00Z" }
}
```

**Errors:** `CONFLICT_RESERVED` with `fields:{"submissionId":"ALREADY_SET"}` and `meta` carrying `holderStaffId`, `holderDisplayName` and `reservedUntil`, when a colleague's reservation is live. `CONFLICT_ALREADY_DECIDED` with `meta.existingDecisionId` when a live decision already exists and the caller has not opened a revision. `VALIDATION_FAILED` with `fields` for `type` (`ENUM_MISMATCH`), `reason` (`TOO_LONG`), `costBand` (`ENUM_MISMATCH`), `targetDate` (`PATTERN_MISMATCH`), `pillar` (`ENUM_MISMATCH`). `LEGAL_HOLD`. `FORBIDDEN_ROLE`.

---

### C-042: Decision reservation release

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Route handler `DELETE /api/admin/decision-drafts/{decisionDraftId}`

**Spec anchors:** FEAT-007, `screens/16-decision-composer.md`

**Authority:** Releases the caller's own reservation so a colleague may take the case immediately. The draft text is discarded.

**Request:**
```json
{ "path": { "decisionDraftId": "ddr_01J9ZF2H4J6K8L1M3N5P7Q9RST" } }
```

**Response 204:** no body.

**Errors:** `FORBIDDEN_ROLE` when the reservation belongs to another staff member; only its holder or the operator may release it. `NOT_FOUND` when the draft has already expired or been published.

---

### C-043: Decision publication

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Server action `publishDecision` on `/admin/queue/{reference}/decide`

**Spec anchors:** FEAT-007, FEAT-008, NFR-007, NFR-042, EVT-026, `screens/16-decision-composer.md`

**Authority:** Writes the Decision and, for a Commit, the Commitment in one transaction. A published decision is immutable in content; a later change is a revision under `C-044`. Invalidates the submission, register and ledger cache; appends the AuditEvent; queues the author notice. The decision stands even if the notice fails.

**Request:**
```json
{
  "reference": "ODP-004821",
  "decisionDraftId": "ddr_01J9ZF2H4J6K8L1M3N5P7Q9RST",
  "type": "commit",
  "reason": "The borehole is on the 2027 water programme for Ibadan North and the contractor is named in the published procurement notice.",
  "authority": null,
  "owner": "Director, Water Resources, Ibadan North",
  "costBand": "5m_to_20m",
  "targetDate": "2027-03-31",
  "pillar": "infrastructure"
}
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "decision": {
      "id": "dec_01J9ZB1C3D5E7F9G1H3J5K7LMP",
      "submissionId": "sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST",
      "version": 1,
      "type": "commit",
      "reason": "The borehole is on the 2027 water programme for Ibadan North and the contractor is named in the published procurement notice.",
      "authority": null,
      "signatoryId": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP",
      "supersedesDecisionId": null,
      "publishedAt": "2026-11-25T12:00:00Z"
    },
    "commitment": {
      "id": "cmt_01J9ZB2D4E6F8G1H3J5K7L9MNP",
      "decisionId": "dec_01J9ZB1C3D5E7F9G1H3J5K7LMP",
      "submissionId": "sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST",
      "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
      "owner": "Director, Water Resources, Ibadan North",
      "costBand": "5m_to_20m",
      "targetDate": "2027-03-31",
      "status": "committed",
      "withdrawnByAuthor": false,
      "pillar": "infrastructure",
      "updatedAt": "2026-11-25T12:00:00Z"
    },
    "notice": { "queued": true, "channel": "sms", "deliveryState": "queued" }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-25T12:00:00Z" }
}
```
For a `decline` the response carries `decision` and `commitment:null`. For a `refer` it carries `decision.authority` set and `commitment:null`.

**Errors:** `VALIDATION_FAILED` with `fields` covering `type` (`REQUIRED`, `ENUM_MISMATCH`), `reason` (`REQUIRED`, `TOO_LONG` at 2000), `owner` (`REQUIRED` for `commit`, `TOO_LONG`), `costBand` (`REQUIRED` for `commit`, `ENUM_MISMATCH`), `targetDate` (`REQUIRED` for `commit`, `PATTERN_MISMATCH`), `pillar` (`REQUIRED` for `commit`, `ENUM_MISMATCH`), `authority` (`REQUIRED` for `refer`, `TOO_LONG`). `CONFLICT_ALREADY_DECIDED` with `meta.existingDecisionId` and a path to publish a revision. `CONFLICT_RESERVED` when a colleague's draft is live. `POLICY_VIOLATION` with `cause:"TARGET_DATE_IN_PAST"` or `cause:"DIRECTOR_APPROVAL_REQUIRED"` when the target date falls before the submission's quarter (`meta.approvalBy:"campaign_director"`). `LEGAL_HOLD` when the submission is withheld. `FORBIDDEN_ROLE`. `SERVICE_DEGRADED` with `cause:"PRIMARY_WRITE_UNAVAILABLE"`; nothing is partially written.

---

### C-044: Decision revision

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Server action `reviseDecision` on `/admin/queue/{reference}/decide`

**Spec anchors:** FEAT-007, `screens/16-decision-composer.md`, `screens/07-submission-detail.md`

**Authority:** Publishes a new Decision with `version` incremented and `supersedesDecisionId` set to the live decision. The earlier version remains readable and marked superseded. A revised Commit updates the existing Commitment rather than creating a second one.

**Request:**
```json
{
  "supersedesDecisionId": "dec_01J9ZB1C3D5E7F9G1H3J5K7LMP",
  "type": "commit",
  "reason": "The programme slipped to the second quarter; the revised date reflects the appropriation line.",
  "owner": "Director, Water Resources, Ibadan North",
  "costBand": "5m_to_20m",
  "targetDate": "2027-06-30",
  "pillar": "infrastructure",
  "authority": null
}
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "decision": { "id": "dec_01J9ZG3J5K7L9M1N3P5Q7R9STU", "submissionId": "sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST", "version": 2, "type": "commit", "reason": "The programme slipped to the second quarter; the revised date reflects the appropriation line.", "authority": null, "signatoryId": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP", "supersedesDecisionId": "dec_01J9ZB1C3D5E7F9G1H3J5K7LMP", "publishedAt": "2026-12-02T09:00:00Z" },
    "commitment": { "id": "cmt_01J9ZB2D4E6F8G1H3J5K7L9MNP", "targetDate": "2027-06-30", "status": "committed", "updatedAt": "2026-12-02T09:00:00Z" },
    "supersededDecisionRetained": true
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-12-02T09:00:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` as in `C-043`. `NOT_FOUND` when `supersedesDecisionId` is not the live decision for this submission. `CONFLICT_ALREADY_DECIDED` with `cause:"STALE_SUPERSESSION"` when a newer version already exists. `FORBIDDEN_ROLE`. `SERVICE_DEGRADED`.

---

### C-045: Commitment status change

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Server action `changeCommitmentStatus`

**Spec anchors:** FEAT-007, FEAT-009, EVT-028, `screens/08-commitment-register.md`, `screens/11-quarterly-report-card.md`

**Authority:** Moves a Commitment between `committed`, `delivered`, `slipped` and `dropped`, writes a CommitmentStatusChange, and sets `statusReason`. A dropped commitment stays in the register with its reason. Never deletes a commitment.

**Request:**
```json
{
  "commitmentId": "cmt_01J9ZB2D4E6F8G1H3J5K7L9MNP",
  "toStatus": "slipped",
  "reason": "The appropriation line was not released in the first quarter.",
  "changedAt": null
}
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "commitment": { "id": "cmt_01J9ZB2D4E6F8G1H3J5K7L9MNP", "status": "slipped", "statusReason": "The appropriation line was not released in the first quarter.", "updatedAt": "2026-12-19T10:00:00Z" },
    "statusChange": {
      "id": "csc_01J9ZG4K6L8M1N3P5Q7R9S1TUV",
      "commitmentId": "cmt_01J9ZB2D4E6F8G1H3J5K7L9MNP",
      "fromStatus": "committed",
      "toStatus": "slipped",
      "reason": "The appropriation line was not released in the first quarter.",
      "changedById": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP",
      "changedAt": "2026-12-19T10:00:00Z"
    }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-12-19T10:00:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `fields` for `toStatus` (`REQUIRED`, `ENUM_MISMATCH`) and `reason` (`REQUIRED` when `toStatus` is `slipped` or `dropped`, `TOO_LONG`). `CONFLICT_ALREADY_DECIDED` with `cause:"STATUS_UNCHANGED"`. `NOT_FOUND`. `FORBIDDEN_ROLE`.

---

### C-046: Delivery evidence record

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Server action `recordDeliveryEvidence` on `/admin/report-card`

**Spec anchors:** FEAT-009, `screens/20-report-card-workbench.md`, `screens/11-quarterly-report-card.md`

**Authority:** Records DeliveryEvidence against a commitment and states whether it may be published. Private evidence supports a delivered status without appearing on the public record.

**Request:**
```json
{
  "commitmentId": "cmt_01J9ZB2D4E6F8G1H3J5K7L9MNP",
  "type": "site_visit",
  "reference": "Visit 2027-02-14, Agbowo market",
  "description": "The borehole was running and the ward officer confirmed the pump installation.",
  "public": true
}
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "deliveryEvidence": {
      "id": "dev_01J9ZG5L7M9N1P3Q5R7S9T1UVW",
      "commitmentId": "cmt_01J9ZB2D4E6F8G1H3J5K7L9MNP",
      "type": "site_visit",
      "reference": "Visit 2027-02-14, Agbowo market",
      "description": "The borehole was running and the ward officer confirmed the pump installation.",
      "recordedById": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP",
      "recordedAt": "2027-02-15T09:00:00Z",
      "public": true
    }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2027-02-15T09:00:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `fields` for `type` (`REQUIRED`, `ENUM_MISMATCH`), `reference` (`REQUIRED`, `TOO_LONG` at 200), `description` (`REQUIRED`, `TOO_LONG` at 1000), `public` (`REQUIRED`). `NOT_FOUND`. `FORBIDDEN_ROLE`.

---

### C-047: Budget-line candidate read

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Route handler `GET /api/admin/report-cards/{quarter}/budget-lines`

**Spec anchors:** FEAT-009, NFR-013, NFR-053, `screens/20-report-card-workbench.md`

**Authority:** Lists suggested appropriation lines for the quarter's commitments. A candidate is a suggestion only; nothing is published until `C-048` confirms it.

**Request:**
```json
{ "path": { "quarter": "2026-Q4" }, "query": { "commitmentId": null, "status": "suggested", "cursor": null, "limit": 20 } }
```

**Response 200:**
```json
{
  "data": {
    "capabilityStatus": "on",
    "candidates": [
      {
        "id": "blm_01J9ZG6M8N1P3Q5R7S9T1UVWX",
        "commitmentId": "cmt_01J9ZB2D4E6F8G1H3J5K7L9MNP",
        "lineReference": "IB-N/WS/2027/014",
        "lineDescription": "Rehabilitation of community boreholes, Ibadan North",
        "amount": 12000000,
        "confidence": 0.93,
        "status": "suggested",
        "createdAt": "2027-01-01T02:00:00Z"
      }
    ],
    "unmatchedCommitmentCount": 4
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2027-01-01T02:00:00Z", "degraded": false },
  "page": { "nextCursor": null, "hasMore": false }
}
```
When the capability is off, `capabilityStatus` is `"fallback"`, `candidates` is empty, and every commitment is presented for manual matching. No error is returned, because manual reconciliation is a valid path.

**Errors:** `VALIDATION_FAILED` with `fields:{"quarter":"PATTERN_MISMATCH"}`. `NOT_FOUND` when the quarter is unknown. `FORBIDDEN_ROLE`. `SERVICE_DEGRADED` with the last generated candidate set and its `asAt`.

---

### C-048: Budget-line decision

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Server action `decideBudgetLine` on `/admin/report-card`

**Spec anchors:** FEAT-009, EVT-029, EVT-030, `screens/20-report-card-workbench.md`

**Authority:** Confirms or rejects one candidate match. A confirmed match writes `budgetLineReference`, `budgetLineDescription`, `budgetLineAmount`, `budgetLineConfirmedById` and `budgetLineConfirmedAt` onto the Commitment; only a confirmed match may be published. Never confirms on behalf of a model.

**Request:**
```json
{ "budgetLineMatchId": "blm_01J9ZG6M8N1P3Q5R7S9T1UVWX", "status": "confirmed" }
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "budgetLineMatch": { "id": "blm_01J9ZG6M8N1P3Q5R7S9T1UVWX", "status": "confirmed", "confirmedById": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP" },
    "commitment": {
      "id": "cmt_01J9ZB2D4E6F8G1H3J5K7L9MNP",
      "budgetLineReference": "IB-N/WS/2027/014",
      "budgetLineDescription": "Rehabilitation of community boreholes, Ibadan North",
      "budgetLineAmount": 12000000,
      "budgetLineConfirmedById": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP",
      "budgetLineConfirmedAt": "2027-01-01T09:00:00Z"
    }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2027-01-01T09:00:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `fields:{"status":["REQUIRED","ENUM_MISMATCH"]}`. `CONFLICT_ALREADY_DECIDED` when the candidate was already confirmed or rejected by this or another staff member. `NOT_FOUND`. `FORBIDDEN_ROLE`.

---

### C-049: Moderation queue read

**Status:** Frozen

**Auth:** Staff session (external_reviewer)

**Surface:** Route handler `GET /api/admin/moderation/cases`

**Spec anchors:** FEAT-006, FEAT-011, `screens/17-moderation-log.md`

**Authority:** Reads removals awaiting review, with the rule cited in full and the removed text. The external reviewer sees every removal. A moderator calling the same entry receives only the removals they performed, which is the moderator's own removal log. An `external_reviewer` session receives no member personal data, no ward beyond the submission in question, and no member identifier in a resolvable form.

**Request:**
```json
{ "query": { "reviewStatus": "open", "includeDecided": false, "cursor": null, "limit": 20 } }
```

**Response 200:**
```json
{
  "data": {
    "openCount": 12,
    "pastFiveDaysCount": 2,
    "cases": [
      {
        "moderationActionId": "mda_01J9ZH1N3P5Q7R9S1T3U5V7WXY",
        "commentId": "cmt_01J9Z7G3H5J7K9L1M3N5P7Q9RS",
        "commentBody": "The tender was never advertised in this ward, so how did the contractor get chosen?",
        "routingFlag": "ordinary",
        "action": "remove",
        "rule": { "id": "rul_01J9Z3B1C2D3E4F5G6H7J8K9MN", "code": "R-02", "title": "Unverified allegations against named people", "text": "…" },
        "moderatorDisplayName": "M. Ojo",
        "occurredAt": "2026-11-18T11:00:00Z",
        "reviewStatus": "open",
        "appeal": { "id": "apl_01J9Z7H5J7K9L1M3N5P7Q9R1ST", "reason": "…", "status": "open" },
        "assignedReviewerId": null
      }
    ]
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T11:30:00Z", "degraded": false },
  "page": { "nextCursor": null, "hasMore": false }
}
```

**Errors:** `FORBIDDEN_ROLE` for any other role. `SERVICE_DEGRADED` with the last successful case list and its `asAt`.

---

### C-050: Moderation action

**Status:** Frozen

**Auth:** Staff session (moderator)

**Surface:** Server action `moderateComment` on `/admin/moderation`

**Spec anchors:** FEAT-006, FEAT-011, NFR-028, EVT-022, EVT-024, `screens/17-moderation-log.md`

**Authority:** Removes, restores, holds for legal review or releases a comment. Every removal requires a `ruleId`; a removal recorded without one is invalid on review and is restored automatically by `C-052`. Removal is a state change, never a delete. A moderator who is the subject of the comment must recuse.

**Request:**
```json
{
  "commentId": "cmt_01J9Z7G3H5J7K9L1M3N5P7Q9RS",
  "action": "remove",
  "ruleId": "rul_01J9Z3B1C2D3E4F5G6H7J8K9MN",
  "reason": "Names a company and alleges fraud without evidence."
}
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "moderationAction": {
      "id": "mda_01J9ZH1N3P5Q7R9S1T3U5V7WXY",
      "commentId": "cmt_01J9Z7G3H5J7K9L1M3N5P7Q9RS",
      "moderatorId": "stf_01J9Z4D9E2F3G4H5J6K7M8NPQ",
      "action": "remove",
      "ruleId": "rul_01J9Z3B1C2D3E4F5G6H7J8K9MN",
      "reason": "Names a company and alleges fraud without evidence.",
      "reviewStatus": "open",
      "occurredAt": "2026-11-18T11:00:00Z"
    },
    "comment": { "id": "cmt_01J9Z7G3H5J7K9L1M3N5P7Q9RS", "status": "removed" }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-18T11:00:00Z" }
}
```
`restore` yields `reviewStatus:"not_reviewable"` and `comment.status:"restored"`; `hold_for_legal` yields `comment.status:"held_for_legal"` and creates an open LegalReview under `C-053`.

**Errors:** `VALIDATION_FAILED` with `fields` for `action` (`REQUIRED`, `ENUM_MISMATCH`) and `ruleId` (`REQUIRED` for `remove`, `NOT_FOUND` when retired or unknown). `POLICY_VIOLATION` with `cause:"MODERATOR_IS_SUBJECT"`; the case must be reassigned under `C-052`. `CONFLICT_ALREADY_DECIDED` when the comment is already in the requested state. `LEGAL_HOLD` when an open LegalReview blocks the action. `FORBIDDEN_ROLE`.

---

### C-051: Appeal queue read

**Status:** Frozen

**Auth:** Staff session (external_reviewer)

**Surface:** Route handler `GET /api/admin/moderation/appeals`

**Spec anchors:** FEAT-011, `screens/17-moderation-log.md`

**Authority:** Reads appeals and the removals they concern, for the external reviewer only. Never returns a member identifier, real name, telephone number or ward outside the submission in question.

**Request:**
```json
{ "query": { "status": "open", "cursor": null, "limit": 20 } }
```

**Response 200:**
```json
{
  "data": {
    "appeals": [
      {
        "id": "apl_01J9Z7H5J7K9L1M3N5P7Q9R1ST",
        "commentId": "cmt_01J9Z7G3H5J7K9L1M3N5P7Q9RS",
        "reason": "The comment criticises the contractor selection and names no person.",
        "status": "open",
        "assignedReviewerId": null,
        "createdAt": "2026-11-18T10:30:00Z",
        "decideBy": "2026-11-23T10:30:00Z",
        "moderationAction": { "ruleCode": "R-02", "occurredAt": "2026-11-18T11:00:00Z" }
      }
    ],
    "overdueCount": 1
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-19T09:00:00Z", "degraded": false },
  "page": { "nextCursor": null, "hasMore": false }
}
```

**Errors:** `FORBIDDEN_ROLE`. `SERVICE_DEGRADED` with the last successful list and its `asAt`.

---

### C-052: Appeal decision and case reassignment

**Status:** Frozen

**Auth:** Staff session (external_reviewer)

**Surface:** Server action `decideAppeal` on `/admin/moderation`

**Spec anchors:** FEAT-011, EVT-023, EVT-024, `screens/17-moderation-log.md`

**Authority:** Upholds or reverses a removal, or reassigns the case. A reversal restores the comment with a note that it was removed and restored, and closes the appeal. A campaign role cannot overturn a reviewer's reversal. A removal with no cited rule is invalid and is restored automatically.

**Request:**
```json
{
  "appealId": "apl_01J9Z7H5J7K9L1M3N5P7Q9R1ST",
  "status": "reversed",
  "outcomeReason": "The comment criticises a procurement decision and names no person; R-02 does not apply.",
  "assignedReviewerId": null
}
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "appeal": { "id": "apl_01J9Z7H5J7K9L1M3N5P7Q9R1ST", "status": "reversed", "reviewerId": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP", "outcomeReason": "The comment criticises a procurement decision and names no person; R-02 does not apply.", "decidedAt": "2026-11-19T10:00:00Z" },
    "moderationAction": { "id": "mda_01J9ZH1N3P5Q7R9S1T3U5V7WXY", "reviewStatus": "reversed", "reviewedAt": "2026-11-19T10:00:00Z" },
    "comment": { "id": "cmt_01J9Z7G3H5J7K9L1M3N5P7Q9RS", "status": "restored", "restorationNote": "Removed and restored." }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-19T10:00:00Z" }
}
```
`status:"reassigned"` requires `assignedReviewerId` and leaves the case open in the second reviewer's queue. `status:"upheld"` leaves the comment `removed`.

**Errors:** `VALIDATION_FAILED` with `fields` for `status` (`REQUIRED`, `ENUM_MISMATCH`) and `outcomeReason` (`REQUIRED` for `upheld` and `reversed`, `TOO_LONG`) and `assignedReviewerId` (`REQUIRED` for `reassigned`). `POLICY_VIOLATION` with `cause:"REVIEWER_CONFLICT"`; a reviewer who is the subject of the comment cannot decide it. `CONFLICT_ALREADY_DECIDED`. `FORBIDDEN_ROLE` for every role except `external_reviewer`.

---

### C-053: Legal review queue read

**Status:** Frozen

**Auth:** Staff session (legal_reviewer)

**Surface:** Route handler `GET /api/admin/legal/cases`

**Spec anchors:** FEAT-014, NFR-043, `screens/18-legal-review.md`

**Authority:** Reads held submissions and comments with the reason they were raised. Returns held text for the legal reviewer only.

**Request:**
```json
{ "query": { "status": "open", "cursor": null, "limit": 20 } }
```

**Response 200:**
```json
{
  "data": {
    "cases": [
      {
        "id": "lrv_01J9Z7J7K9L1M3N5P7Q9R1S3TU",
        "submissionId": "sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST",
        "commentId": null,
        "heldText": "…",
        "requestedByDisplayName": "Seun A.",
        "reason": "This names a company and accuses it of fraud.",
        "status": "open",
        "requestedAt": "2026-11-18T10:40:00Z",
        "daysOpen": 1
      }
    ],
    "openCount": 3,
    "reviewerAvailable": true
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-19T09:00:00Z", "degraded": false },
  "page": { "nextCursor": null, "hasMore": false }
}
```

**Errors:** `FORBIDDEN_ROLE`. `SERVICE_DEGRADED` with the last successful queue and its `asAt`; a case is never shown without its reason.

---

### C-054: Legal decision and takedown

**Status:** Frozen

**Auth:** Staff session (legal_reviewer)

**Surface:** Server action `decideLegalReview` on `/admin/legal`

**Spec anchors:** FEAT-014, NFR-043, EVT-044, EVT-045, `screens/18-legal-review.md`, `screens/09-public-ledger.md`

**Authority:** Clears, withholds or takes down a held submission or comment, and records the reason and the public note. A withheld or taken-down submission stays in the ledger with `LegalReview.publicNote`. A comment stays in the moderation log and its author's view. A takedown is never a delete. A restore reverses a withhold or takedown with a recorded reason.

**Request:**
```json
{
  "legalReviewId": "lrv_01J9Z7J7K9L1M3N5P7Q9R1S3TU",
  "status": "withheld",
  "outcomeReason": "The text names a company and repeats an allegation that cannot be defended on the evidence supplied.",
  "publicNote": "Withheld for legal review: unverified allegation against a named company."
}
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "legalReview": {
      "id": "lrv_01J9Z7J7K9L1M3N5P7Q9R1S3TU",
      "status": "withheld",
      "reviewerId": "stf_01J9Z4E1F3G5H7J9K1L3M5NPQ",
      "outcomeReason": "The text names a company and repeats an allegation that cannot be defended on the evidence supplied.",
      "publicNote": "Withheld for legal review: unverified allegation against a named company.",
      "decidedAt": "2026-11-19T11:00:00Z"
    },
    "submission": { "reference": "ODP-004821", "status": "withheld", "ledgerEligible": true },
    "comment": null,
    "notice": { "queued": true, "channel": "sms" }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-19T11:00:00Z" }
}
```
`status:"cleared"` publishes the item and sets `Comment.status:"published"` or `Submission.status:"awaiting_decision"`, with a note that it was reviewed. `status:"takedown"` sets `Comment.status:"removed"` or `Submission.status:"withheld"` and leaves the row in place. Restoring a withheld or taken-down item sets `status:"cleared"` with `meta.restoredFrom` naming the prior status.

**Errors:** `VALIDATION_FAILED` with `fields` for `status` (`REQUIRED`, `ENUM_MISMATCH`) and `outcomeReason` (`REQUIRED`, `TOO_LONG`) and `publicNote` (`REQUIRED` for `withheld` and `takedown`, `TOO_LONG` at 500). `POLICY_VIOLATION` with `cause:"PUBLIC_NOTE_REPEATS_ALLEGATION"` when the note reproduces the allegation, and `cause:"DIRECTOR_APPROVAL_REQUIRED"` when releasing a hold after a defamation claim. `CONFLICT_ALREADY_DECIDED`. `FORBIDDEN_ROLE`.

---

### C-055: Ward description review queue read

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Route handler `GET /api/admin/ward-reviews`

**Spec anchors:** FEAT-002, `screens/19-ward-review-queue.md`

**Authority:** Reads unresolved descriptions, oldest first, with the resident's own words and the selected local government area. Never assigns a ward.

**Request:**
```json
{ "query": { "status": "queued", "localGovernmentArea": null, "cursor": null, "limit": 20 } }
```

**Response 200:**
```json
{
  "data": {
    "reviews": [
      {
        "id": "wdr_01J9Z7A3B5C7D9E1F3G5H7J9KM",
        "description": "After the old cocoa shed, before the river",
        "localGovernmentArea": "Ibadan North",
        "status": "queued",
        "memberIdentityState": "registered",
        "memberWardStatus": "unresolved",
        "submissionReferences": ["ODP-004812"],
        "createdAt": "2026-11-18T09:25:00Z"
      }
    ],
    "queuedCount": 4,
    "candidateWards": [{ "id": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "name": "Ward IV, Agbowo", "localGovernmentArea": "Ibadan North" }]
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-19T09:00:00Z", "degraded": false },
  "page": { "nextCursor": null, "hasMore": false }
}
```

**Errors:** `FORBIDDEN_ROLE`. `SERVICE_DEGRADED` with the last successful queue and its `asAt`. A review whose member account has since been deleted is returned with `memberDeleted:true` and can only be closed, not resolved.

---

### C-056: Ward description resolution

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Server action `resolveWardDescription` on `/admin/wards/review`

**Spec anchors:** FEAT-002, EVT-009, `screens/19-ward-review-queue.md`

**Authority:** Resolves a queued description to one ward, or rejects it with a reason. On resolution, sets `Member.wardId` and `Member.wardStatus` for the member and moves that member's unresolved submissions to the same ward without changing their text. Never moves a submission that already carries a resolved ward.

**Request (resolved):**
```json
{
  "reviewId": "wdr_01J9Z7A3B5C7D9E1F3G5H7J9KM",
  "status": "resolved",
  "resolvedWardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
  "rejectionReason": null
}
```

**Request (rejected):**
```json
{
  "reviewId": "wdr_01J9Z7A3B5C7D9E1F3G5H7J9KM",
  "status": "rejected",
  "resolvedWardId": null,
  "rejectionReason": "The description names two different areas; please name the nearest school or market."
}
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "wardDescriptionReview": { "id": "wdr_01J9Z7A3B5C7D9E1F3G5H7J9KM", "status": "resolved", "resolvedWardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "reviewerId": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP", "resolvedAt": "2026-11-19T10:30:00Z" },
    "member": { "id": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA", "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "wardStatus": "resolved" },
    "submissionsMoved": ["ODP-004812"],
    "submissionsUnchanged": 2
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-19T10:30:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `fields` for `status` (`REQUIRED`, `ENUM_MISMATCH`), `resolvedWardId` (`REQUIRED` for `resolved`, `NOT_FOUND`), `rejectionReason` (`REQUIRED` for `rejected`, `TOO_LONG` at 500). `CONFLICT_ALREADY_DECIDED` when the description is already resolved or rejected. `POLICY_VIOLATION` with `cause:"MEMBER_ACCOUNT_DELETED"`; the review may then only be rejected. `FORBIDDEN_ROLE`.

---

### C-057: Residence review record

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Server action `recordResidenceReview` on `/admin/wards/review`

**Spec anchors:** FEAT-001, EVT-005, EVT-047, `screens/19-ward-review-queue.md`

**Authority:** Records a ResidenceReview and, on `decision:"checked"`, moves the member from `registered` to `checked`. A rejection leaves the member `registered` and states what is missing. Never changes the ward.

**Request:**
```json
{
  "memberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
  "method": "ward_confirmation",
  "decision": "checked",
  "notes": "Confirmed at the Agbowo ward meeting; the member's street is inside the ward boundary."
}
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "residenceReview": {
      "id": "rsv_01J9ZJ1K3L5M7N9P1Q3R5S7TUV",
      "memberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
      "reviewerId": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP",
      "method": "ward_confirmation",
      "decision": "checked",
      "reviewedAt": "2026-11-19T11:00:00Z"
    },
    "member": { "identityState": "checked" },
    "backingsUpdated": 3
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-19T11:00:00Z" }
}
```
`backingsUpdated` counts existing Backing rows whose `identityStateAtBacking` the review now makes stale for display; the stored `identityStateAtBacking` on past backings is never rewritten, and only the member's current state changes.

**Errors:** `VALIDATION_FAILED` with `fields` for `method` (`REQUIRED`, `ENUM_MISMATCH`), `decision` (`REQUIRED`, `ENUM_MISMATCH`), `notes` (`TOO_LONG` at 1000). `POLICY_VIOLATION` with `cause:"WARD_UNRESOLVED"`; a residence cannot be checked before the ward is recorded. `NOT_FOUND`. `FORBIDDEN_ROLE`.

---

### C-058: Assisted intake publication

**Status:** Frozen

**Auth:** Staff session (ward_organiser)

**Surface:** Server action `recordAssistedIntake` on `/admin/intake`

**Spec anchors:** FEAT-004, FEAT-001, FEAT-003, EVT-018, EVT-019, `screens/14-assisted-intake.md`

**Authority:** Records the resident's consent, creates an organiser-attested Member when no account exists or attaches to the one that does, and publishes the Submission with `recorderId` set. Beyond forty submissions for one ward in one day, the submission is held as a SubmissionDraft with `status:"held_for_review"` and no public reference is issued. Never merges two accounts that share a number.

**Request:**
```json
{
  "clientRecordId": "intake-2026-11-19-0042",
  "resident": {
    "fullName": "Rukayat Bello",
    "telephoneNumber": "+2348051234567",
    "displayName": "Rukayat B.",
    "locale": "yo-NG",
    "memberId": null
  },
  "consent": { "purpose": "assisted_recording", "granted": true, "recordedAt": "2026-11-19T12:00:00Z" },
  "submission": {
    "type": "issue",
    "body": "The drain behind the school floods every rainy season and the classrooms take water.",
    "pillar": "infrastructure",
    "locationText": "Behind Anglican Primary School, Agbowo",
    "locationScope": "in_state",
    "costBand": null,
    "responsibleAuthority": null,
    "containsNamedEntity": false,
    "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
    "submittedAt": "2026-11-19T11:58:00Z"
  }
}
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "submission": {
      "id": "sub_01J9ZJ2L4M6N8P1Q3R5S7T9UVW",
      "reference": "ODP-004902",
      "authorId": "mbr_01J9ZJ3M5N7P9Q1R3S5T7V9WXY",
      "recorderId": "stf_01J9Z4F2G4H6J8K1L3M5N7P9QR",
      "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
      "status": "awaiting_decision",
      "source": "assisted_intake",
      "submittedAt": "2026-11-19T11:58:00Z"
    },
    "account": { "created": true, "verificationMethod": "organiser_attestation", "sharedNumber": false },
    "consent": { "id": "cns_01J9ZJ4N6P8Q1R3S5T7V9WXY", "purpose": "assisted_recording", "granted": true },
    "referenceSlip": { "reference": "ODP-004902", "wardName": "Ward IV, Agbowo", "recordedAt": "2026-11-19T12:00:00Z" }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-19T12:00:00Z" }
}
```

**Response 202 (allowance exceeded):**
```json
{
  "ok": true,
  "data": {
    "held": true,
    "submissionDraft": { "id": "sdr_01J9ZJ5P7Q9R1S3T5V7W9XY", "status": "held_for_review", "heldReason": "Daily recording allowance of 40 submissions for this ward exceeded.", "expiresAt": "2026-12-19T12:00:00Z" },
    "referenceIssued": false
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-19T12:00:00Z" }
}
```

**Errors:** `POLICY_VIOLATION` with `cause:"CONSENT_NOT_RECORDED"`, `cause:"WARD_NOT_AUTHORISED"` (the correct organiser's ward is named in `meta.authorisedWardIds`), or `cause:"TELEPHONE_NUMBER_REQUIRED"` (the call keeps an unpublished draft instead). `VALIDATION_FAILED` with `fields` for every submission requirement as in `C-014`, plus `resident.fullName`, `resident.telephoneNumber`, `resident.displayName`. `NOT_FOUND` when `resident.memberId` does not exist. `WRITE_QUEUED` with the whole record queued durably.

---

### C-059: Assisted intake offline replay

**Status:** Frozen

**Auth:** Staff session (ward_organiser)

**Surface:** Route handler `POST /api/admin/intake/replay`

**Spec anchors:** FEAT-004, NFR-008, `screens/14-assisted-intake.md`

**Authority:** Replays a batch of intakes queued on the device. Each item is idempotent on `clientRecordId`, preserves its original `submittedAt`, and creates at most one submission. A duplicate is reported as `replayed`, never created twice.

**Request:**
```json
{
  "batchId": "batch-2026-11-19-agbowo-01",
  "items": [
    {
      "clientRecordId": "intake-2026-11-19-0042",
      "resident": { "fullName": "Rukayat Bello", "telephoneNumber": "+2348051234567", "displayName": "Rukayat B.", "locale": "yo-NG", "memberId": null },
      "consent": { "purpose": "assisted_recording", "granted": true, "recordedAt": "2026-11-19T11:55:00Z" },
      "submission": { "type": "issue", "body": "…", "pillar": "infrastructure", "locationText": "…", "locationScope": "in_state", "containsNamedEntity": false, "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "submittedAt": "2026-11-19T11:58:00Z" }
    }
  ]
}
```

**Response 200:**
```json
{
  "data": {
    "batchId": "batch-2026-11-19-agbowo-01",
    "results": [
      { "clientRecordId": "intake-2026-11-19-0042", "outcome": "created", "reference": "ODP-004902", "submissionId": "sub_01J9ZJ2L4M6N8P1Q3R5S7T9UVW", "replayed": false },
      { "clientRecordId": "intake-2026-11-19-0041", "outcome": "replayed", "reference": "ODP-004901", "submissionId": "sub_01J9ZJ1K3L5M7N9P1Q3R5S7TUV", "replayed": true },
      { "clientRecordId": "intake-2026-11-19-0043", "outcome": "held", "reference": null, "submissionDraftId": "sdr_01J9ZJ5P7Q9R1S3T5V7W9XY", "heldReason": "Daily recording allowance of 40 submissions for this ward exceeded." }
    ],
    "createdCount": 1,
    "replayedCount": 1,
    "heldCount": 1,
    "rejectedCount": 0
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-19T18:00:00Z" }
}
```
One item's failure never fails the batch. A rejected item carries `outcome:"rejected"` and an `error` object with the same envelope as `C-001`.

**Errors:** `VALIDATION_FAILED` when `batchId` or `items` is missing or the batch exceeds 100 items. `POLICY_VIOLATION` with `cause:"WARD_NOT_AUTHORISED"` for a batch aimed at a ward the organiser does not hold. `FORBIDDEN_ROLE`. `SERVICE_DEGRADED` with `cause:"PRIMARY_WRITE_UNAVAILABLE"`; the batch stays queued on the device and is replayed again with the same `clientRecordId` values.

---

### C-060: Report card preparation read

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Route handler `GET /api/admin/report-cards/{quarter}`

**Spec anchors:** FEAT-009, `screens/20-report-card-workbench.md`

**Authority:** Reads the figures, confirmed matches, unmatched commitments and existing card for a quarter. Never publishes.

**Request:**
```json
{ "path": { "quarter": "2026-Q4" } }
```

**Response 200:**
```json
{
  "data": {
    "quarter": "2026-Q4",
    "cutOffAt": "2026-12-31T23:59:59Z",
    "existingCard": null,
    "figures": { "answerRate": 0.86, "deliveryRate": 0.71, "committedCount": 214, "deliveredCount": 61, "slippedCount": 12, "droppedCount": 7 },
    "wardRows": [{ "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "submissions": 63, "decisions": 51, "commitments": 22, "overdue": 4, "suppressionApplied": false }],
    "unmatchedCommitments": [{ "commitmentId": "cmt_01J9ZB2D4E6F8G1H3J5K7L9MNP", "reason": "No confirmed appropriation line." }],
    "statusChangeCount": 73
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2027-01-01T09:00:00Z", "degraded": false }
}
```

**Errors:** `VALIDATION_FAILED` with `fields:{"quarter":"PATTERN_MISMATCH"}`. `FORBIDDEN_ROLE`. `SERVICE_DEGRADED` with the last generated figures and their `asAt`; a partial card is never offered for publication.

---

### C-061: Report card publication

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Server action `publishReportCard` on `/admin/report-card`

**Spec anchors:** FEAT-009, EVT-032, NFR-042, `screens/20-report-card-workbench.md`, `screens/11-quarterly-report-card.md`

**Authority:** Freezes the quarter into a ReportCard and its WardReportSnapshot and WardPillarSnapshot rows, and publishes it. A published card is immutable; a later change is a correction under `C-062`. A commitment without a confirmed match is published as unmatched, never guessed.

**Request:**
```json
{
  "quarter": "2026-Q4",
  "cutOffAt": "2026-12-31T23:59:59Z",
  "summaryNote": "Two thirds of the quarter's commitments are on schedule; the water programme slipped in three wards."
}
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "reportCard": {
      "id": "rpc_01J9ZC1D3E5F7G9H1J3K5L7MNP",
      "quarter": "2026-Q4",
      "cutOffAt": "2026-12-31T23:59:59Z",
      "publishedAt": "2027-01-02T06:00:00Z",
      "status": "published",
      "correctionOfId": null,
      "answerRate": 0.86,
      "deliveryRate": 0.71,
      "committedCount": 214,
      "deliveredCount": 61,
      "slippedCount": 12,
      "droppedCount": 7,
      "summaryNote": "Two thirds of the quarter's commitments are on schedule; the water programme slipped in three wards.",
      "generatedAt": "2027-01-02T05:00:00Z"
    },
    "wardSnapshotCount": 33,
    "wardPillarSnapshotCount": 231,
    "suppressedCellCount": 4
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2027-01-02T06:00:00Z" }
}
```

**Errors:** `CONFLICT_ALREADY_DECIDED` with `cause:"CARD_ALREADY_PUBLISHED"` and `meta.existingReportCardId`; the only route is `C-062`. `VALIDATION_FAILED` with `fields` for `quarter` (`REQUIRED`, `PATTERN_MISMATCH`), `cutOffAt` (`REQUIRED`, `PATTERN_MISMATCH`), `summaryNote` (`TOO_LONG` at 2000). `POLICY_VIOLATION` with `cause:"CUT_OFF_AFTER_QUARTER_CLOSE"`. `FORBIDDEN_ROLE`. `SERVICE_DEGRADED`; no partial card is written.

---

### C-062: Report card correction

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Server action `correctReportCard` on `/admin/report-card`

**Spec anchors:** FEAT-009, `screens/20-report-card-workbench.md`, `screens/11-quarterly-report-card.md`

**Authority:** Publishes a corrected ReportCard with `correctionOfId` pointing at the published one, marks the earlier card `superseded`, and writes a fresh set of snapshots. The earlier card remains readable. Requires the campaign director's approval.

**Request:**
```json
{
  "correctionOfId": "rpc_01J9ZC1D3E5F7G9H1J3K5L7MNP",
  "summaryNote": "Corrected: the delivered count was understated by six commitments recorded after the cut-off was applied.",
  "correctionReason": "Six delivery records were entered on 2 January against December delivery dates.",
  "directorApprovalReference": "dir-approval-2027-01-05"
}
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "reportCard": { "id": "rpc_01J9ZK1L3M5N7P9Q1R3S5T7UVW", "quarter": "2026-Q4", "status": "corrected", "correctionOfId": "rpc_01J9ZC1D3E5F7G9H1J3K5L7MNP", "publishedAt": "2027-01-06T09:00:00Z", "deliveredCount": 67, "summaryNote": "Corrected: the delivered count was understated by six commitments recorded after the cut-off was applied." },
    "superseded": { "id": "rpc_01J9ZC1D3E5F7G9H1J3K5L7MNP", "status": "superseded" },
    "wardSnapshotCount": 33
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2027-01-06T09:00:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `fields` for `correctionOfId` (`REQUIRED`), `summaryNote` (`TOO_LONG`), `correctionReason` (`REQUIRED`, `TOO_LONG`), `directorApprovalReference` (`REQUIRED`). `CONFLICT_ALREADY_DECIDED` when a correction of this card already exists; correct the latest card instead. `FORBIDDEN_ROLE`. `SERVICE_DEGRADED`.

---

### C-063: Session question selection

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Server action `selectSessionQuestion` on `/admin/sessions/{id}/compose`

**Spec anchors:** FEAT-010, `screens/21-session-composer.md`

**Authority:** Marks a SessionQuestion `selected` and records who selected it and when. A question held for legal review cannot be selected until the review clears.

**Request:**
```json
{ "sessionId": "ses_01J9ZD1E3F5G7H9J1K3L5M7NPQ", "sessionQuestionId": "sq_01J9ZD3G5H7J9K1L3M5N7P9QRS", "selected": true }
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "sessionQuestion": { "id": "sq_01J9ZD3G5H7J9K1L3M5N7P9QRS", "selected": true, "selectedById": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP", "selectedAt": "2027-01-16T13:00:00Z", "outcome": "not_reached" },
    "selectedCount": 12,
    "questionsReceived": 48
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2027-01-16T13:00:00Z" }
}
```

**Errors:** `POLICY_VIOLATION` with `cause:"QUESTION_HELD_FOR_LEGAL_REVIEW"` or `cause:"SESSION_CANCELLED"`. `CONFLICT_ALREADY_DECIDED` with `cause:"RECORD_ALREADY_PUBLISHED"`. `NOT_FOUND`. `FORBIDDEN_ROLE`.

---

### C-064: Session question answer

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Server action `answerSessionQuestion` on `/admin/sessions/{id}/compose`

**Spec anchors:** FEAT-010, `screens/21-session-composer.md`

**Authority:** Records the answer text and the outcome for a selected question. Before publication a later answer replaces an earlier one; after publication a correction is recorded instead of an overwrite.

**Request:**
```json
{
  "sessionId": "ses_01J9ZD1E3F5G7H9J1K3L5M7NPQ",
  "sessionQuestionId": "sq_01J9ZD3G5H7J9K1L3M5N7P9QRS",
  "answerText": "The contract was advertised on the state procurement portal on 4 October; the notice is attached to the record.",
  "outcome": "asked"
}
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "sessionQuestion": {
      "id": "sq_01J9ZD3G5H7J9K1L3M5N7P9QRS",
      "outcome": "asked",
      "answerText": "The contract was advertised on the state procurement portal on 4 October; the notice is attached to the record.",
      "answeredById": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP",
      "answeredAt": "2027-01-16T13:20:00Z"
    },
    "remainingSelectedWithoutOutcome": 0
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2027-01-16T13:20:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `fields` for `outcome` (`REQUIRED`, `ENUM_MISMATCH`) and `answerText` (`REQUIRED` for `asked` and `answered_in_writing`, `TOO_LONG` at 2000). `POLICY_VIOLATION` with `cause:"QUESTION_NOT_SELECTED"`. `NOT_FOUND`. `FORBIDDEN_ROLE`.

---

### C-065: Session record publication

**Status:** Frozen

**Auth:** Staff session (response_staff)

**Surface:** Server action `publishSessionRecord` on `/admin/sessions/{id}/compose`

**Spec anchors:** FEAT-010, EVT-035, `screens/21-session-composer.md`, `screens/12-session-detail.md`

**Authority:** Publishes the record of questions, answers and unreached questions, and sets `Session.recordPublishedAt`. Every selected question must carry an outcome. A held question is reported as a count, never as text.

**Request:**
```json
{ "sessionId": "ses_01J9ZD1E3F5G7H9J1K3L5M7NPQ", "correctionOfRecordAt": null }
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "session": { "id": "ses_01J9ZD1E3F5G7H9J1K3L5M7NPQ", "status": "held", "recordPublishedAt": "2027-01-20T09:00:00Z" },
    "record": { "questionsAsked": 12, "questionsAnsweredInWriting": 3, "questionsCarriedForward": 5, "questionsUnreached": 8, "questionsHeld": 1 }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2027-01-20T09:00:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `cause:"SELECTED_QUESTION_WITHOUT_OUTCOME"` and `fields` listing each `sessionQuestionId`. `CONFLICT_ALREADY_DECIDED` with `cause:"RECORD_ALREADY_PUBLISHED"`; use a correction with `correctionOfRecordAt`. `POLICY_VIOLATION` with `cause:"SESSION_NOT_HELD"` when the session has not taken place and was not cancelled. `FORBIDDEN_ROLE`. `SERVICE_DEGRADED`.

---

### C-066: Data request queue read

**Status:** Frozen

**Auth:** Staff session (operator)

**Surface:** Route handler `GET /api/admin/data-requests`

**Spec anchors:** FEAT-012, NFR-040, `screens/22-data-request-queue.md`

**Authority:** Reads open DataRequests ordered by statutory deadline. Returns the request type, state, hold note and outcome reason only. Never returns `fullName`, `telephoneNumber` or any other personal data; the operator works the request through the Identity and Access Service.

**Request:**
```json
{ "query": { "status": "open", "cursor": null, "limit": 20 } }
```

**Response 200:**
```json
{
  "data": {
    "requests": [
      {
        "id": "drq_01J9ZE4J6K8L1M3N5P7Q9R1STU",
        "type": "deletion",
        "status": "received",
        "requestedAt": "2026-11-21T07:20:00Z",
        "dueAt": "2026-12-21T07:20:00Z",
        "overdue": false,
        "legalHoldNote": null,
        "outcomeReason": null,
        "fileReference": null
      }
    ],
    "openCount": 4,
    "overdueCount": 1
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-22T09:00:00Z", "degraded": false },
  "page": { "nextCursor": null, "hasMore": false }
}
```

**Errors:** `FORBIDDEN_ROLE`. `SERVICE_DEGRADED` with the last successful queue and its `asAt`.

---

### C-067: Data request resolution

**Status:** Frozen

**Auth:** Staff session (operator)

**Surface:** Server action `resolveDataRequest` on `/admin/data-requests`

**Spec anchors:** FEAT-012, EVT-037, NFR-040, `screens/22-data-request-queue.md`

**Authority:** Moves a DataRequest to `in_progress`, `completed`, `deferred_for_legal_hold` or `refused`, recording the reason and, for an export, the file reference. Completion of a deletion anonymises the Member through the Identity and Access Service and leaves submissions in place marked as withdrawn by author. Every access to member data is logged.

**Request:**
```json
{
  "requestId": "drq_01J9ZE4J6K8L1M3N5P7Q9R1STU",
  "action": "defer",
  "outcomeReason": "One submission is under an open legal review; the hold is reviewed on 2026-12-19.",
  "legalHoldNote": "Held for legal review, reference ODP-004821; review date 2026-12-19.",
  "fileReference": null
}
```
`action` is `start`, `complete`, `defer` or `refuse`.

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "dataRequest": {
      "id": "drq_01J9ZE4J6K8L1M3N5P7Q9R1STU",
      "type": "deletion",
      "status": "deferred_for_legal_hold",
      "legalHoldNote": "Held for legal review, reference ODP-004821; review date 2026-12-19.",
      "outcomeReason": "One submission is under an open legal review; the hold is reviewed on 2026-12-19.",
      "completedById": "stf_01J9Z4G3H5J7K9L1M3N5P7Q9RS",
      "completedAt": "2026-11-22T10:00:00Z"
    },
    "propagation": { "identityAnonymised": true, "analyticsTokenReplaced": true, "auditConfirmed": true, "heldSubmissionReference": "ODP-004821" }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-22T10:00:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `fields` for `action` (`REQUIRED`, `ENUM_MISMATCH`), `outcomeReason` (`REQUIRED` for `defer`, `refuse` and `deletion` completion, `TOO_LONG`), `legalHoldNote` (`REQUIRED` for `defer`, `TOO_LONG` at 500), `fileReference` (`REQUIRED` for a completed `export`). `CONFLICT_ALREADY_DECIDED` when the request is already closed. `LEGAL_HOLD` with `cause:"DELETION_DEFERRED"` when a deletion is blocked by an open LegalReview; use `defer` and record the review date. `FORBIDDEN_ROLE`.

---

### C-068: Staff account and role administration

**Status:** Frozen

**Auth:** Staff session (operator)

**Surface:** Server action `administerStaffUser` on `/admin`

**Spec anchors:** FEAT-011, FEAT-012, NFR-020, `operations.md` Admin & Governance, `release.md` Change approval

**Authority:** Creates a StaffUser or changes `role`, `authorisedWardIds` and `active`. Every staff role requires a second factor. An `external_reviewer` must have `external:true`. No account may both read member personal data and see field operations. A change to a verification or identity rule requires the campaign director.

**Request:**
```json
{
  "staffUserId": null,
  "fullName": "B. Adebayo",
  "role": "external_reviewer",
  "external": true,
  "authorisedWardIds": [],
  "secondFactorEnrolled": true,
  "active": true
}
```

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "staffUser": {
      "id": "stf_01J9ZL1M3N5P7Q9R1S3T5V7WXY",
      "fullName": "B. Adebayo",
      "role": "external_reviewer",
      "external": true,
      "authorisedWardIds": [],
      "secondFactorEnrolled": true,
      "active": true,
      "createdAt": "2026-11-22T11:00:00Z"
    },
    "permissionsGranted": ["moderation.review", "appeal.decide", "audit.access_log.read"]
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-22T11:00:00Z" }
}
```

**Errors:** `VALIDATION_FAILED` with `fields` for `fullName` (`REQUIRED`, `TOO_LONG`), `role` (`REQUIRED`, `ENUM_MISMATCH` against the six staff roles), `external` (`REQUIRED`, `IMMUTABLE` when a role change would strip external status from an `external_reviewer`), `authorisedWardIds` (`REQUIRED` for `ward_organiser`), `secondFactorEnrolled` (`REQUIRED`, `ALREADY_SET` when false). `POLICY_VIOLATION` with `cause:"COMBINED_ACCESS_FORBIDDEN"` when the requested role would hold both member-data access and field operations. `FORBIDDEN_ROLE`. `CONFLICT_ALREADY_DECIDED` when deactivating the last active operator.

---

### C-069: Feature flag administration

**Status:** Frozen

**Auth:** Staff session (operator)

**Surface:** Server action `setFeatureFlag` on `/admin`

**Spec anchors:** FEAT-002, FEAT-003, FEAT-009, FEAT-011, `release.md` Rollout Phases & Feature Flags, `operations.md` Model quality incidents

**Authority:** Enables or disables one named flag. A model flag may be enabled only when a passing ModelEvaluation exists for the pinned version against the threshold for that capability. Disabling is always permitted and is the first response to a quality regression. Every change is audited.

**Request:**
```json
{ "flag": "similar_submission_suggestions", "enabled": true, "modelEvaluationId": "mev_01J9ZM1N3P5Q7R9S1T3V5W7XYZ" }
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "flag": "similar_submission_suggestions",
    "enabled": true,
    "capability": "similar_submission",
    "modelVersion": "odp-sim-2026-08-1",
    "fallback": "exact string matching; submissions publish with no suggestion",
    "modelEvaluation": { "id": "mev_01J9ZM1N3P5Q7R9S1T3V5W7XYZ", "metric": "precision_at_1", "threshold": 0.85, "result": 0.88, "passed": true, "runAt": "2026-06-30T09:00:00Z" }
  },
  "meta": { "correlationId": "req_01J9Z6M2V4", "asAt": "2026-11-22T12:00:00Z" }
}
```
The seven flags are `ward_candidate_suggestions`, `similar_submission_suggestions`, `moderation_routing`, `assisted_intake`, `budget_line_extraction`, `report_card_workbench` and `session_reservations`.

**Errors:** `VALIDATION_FAILED` with `fields` for `flag` (`REQUIRED`, `ENUM_MISMATCH`) and `enabled` (`REQUIRED`). `POLICY_VIOLATION` with `cause:"MODEL_EVALUATION_MISSING_OR_FAILED"` and `meta.requiredThreshold` and `meta.capability` when a model flag is enabled without a passing evaluation. `NOT_FOUND`. `FORBIDDEN_ROLE`.

---

## Domain 4 — Internal Service Boundaries

### C-070: Identity and access boundary

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `identity.*`

**Spec anchors:** FEAT-001, FEAT-012, NFR-028, NFR-040, `architecture.md` Identity and Access Service

**Authority:** The only component permitted to read a member's `fullName`, `telephoneNumber` or `declaredAge`, apart from the member's own `C-032` view. Every other component receives a member identifier and a display name only. Every call that touches personal data is logged, including refusals.

**Request:**
```json
{
  "operation": "resolveActor | getMemberIdentity | assertPersonalDataPermission | createAttestedAccount | anonymiseMember | exportMemberData | listRolesForStaff",
  "caller": { "component": "submission_service", "correlationId": "req_01J9Z6M2V4" },
  "args": {
    "sessionToken": "opaque",
    "memberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
    "purpose": "attribution | member_data_request | residence_review | assisted_intake"
  }
}
```

**Response 200:**
```json
{
  "operation": "resolveActor",
  "result": {
    "actorType": "member",
    "actorId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
    "role": "member",
    "identityState": "checked",
    "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
    "wardStatus": "resolved",
    "locale": "en-NG",
    "sharedNumber": false,
    "sessionExpiresAt": "2026-11-18T21:16:00Z"
  },
  "personalDataReturned": false
}
```
`getMemberIdentity` returns `fullName`, `telephoneNumber` and `declaredAge` only when `purpose` is one of the four permitted purposes and the caller holds the permission; otherwise it returns the identifier and display name with `personalDataReturned:false`.

**Errors:** `FORBIDDEN_ROLE` with `cause:"PERSONAL_DATA_PERMISSION_ABSENT"`; the attempt is logged as `member_data.read_refused`. `NOT_FOUND` when the member is unknown or anonymised. `LEGAL_HOLD` when an anonymisation is blocked by an open LegalReview, with the review date. `VALIDATION_FAILED` for an unknown `operation` or a missing `purpose`. `SERVICE_DEGRADED` when the store is unreachable; no cached personal data is ever served.

---

### C-071: Ward reference boundary

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `ward.*`

**Spec anchors:** FEAT-002, `architecture.md` Ward Reference Service

**Authority:** Resolves descriptions to wards, serves the ward reference, and records confirmations and alias accumulation. Never assigns a ward to a member or a submission on its own; the caller applies the resolution.

**Request:**
```json
{
  "operation": "getWard | listByLocalGovernmentArea | matchDescription | appendAlias | recordResolution",
  "args": {
    "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
    "description": "Behind Agbowo market, near the express",
    "localGovernmentArea": "Ibadan North",
    "reviewId": "wdr_01J9Z7A3B5C7D9E1F3G5H7J9KM",
    "limit": 3
  }
}
```

**Response 200:**
```json
{
  "operation": "matchDescription",
  "result": {
    "candidates": [
      { "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "name": "Ward IV, Agbowo", "localGovernmentArea": "Ibadan North", "matchType": "alias", "rank": 1 }
    ],
    "capabilityStatus": "on"
  }
}
```

**Errors:** `NOT_FOUND` for an unknown ward or review. `VALIDATION_FAILED` for an unknown operation, a description over 500 characters, or a missing local government area where two wards share a name. `POLICY_VIOLATION` when appending an alias to a `seeded` ward without a confirmed description. `SERVICE_DEGRADED` with `cause:"WARD_REFERENCE_UNAVAILABLE"`; the caller falls back to the free-text path.

---

### C-072: Submission boundary

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `submission.*`

**Spec anchors:** FEAT-003, FEAT-004, FEAT-005, `architecture.md` Submission Service

**Authority:** Owns Submission, SubmissionDraft, Backing and the duplicate check. Applies ward resolution to unresolved submissions when the ward reference resolves. Never publishes on inference output and never merges two submissions.

**Request:**
```json
{
  "operation": "createSubmission | getSubmission | listByWard | applyWardResolution | recordBacking | withdrawBacking | withdrawSubmission | countBackings | findSimilar",
  "args": {
    "reference": "ODP-004821",
    "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
    "memberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
    "body": "…",
    "clientSubmittedAt": "2026-11-19T11:58:00Z",
    "clientRecordId": "intake-2026-11-19-0042"
  }
}
```

**Response 200:**
```json
{
  "operation": "recordBacking",
  "result": {
    "backing": { "id": "bkg_01J9Z7F1G3H5J7K9L1M3N5P7QR", "submissionId": "sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST", "memberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA", "identityStateAtBacking": "checked", "wardIdAtBacking": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "state": "active", "createdAt": "2026-11-18T10:00:00Z" },
    "counts": { "backingCount": 55, "checkedBackingCount": 22, "countState": "published" }
  }
}
```

**Errors:** `CONFLICT_DUPLICATE_BACKING`. `POLICY_VIOLATION` with `cause:"AUTHOR_CANNOT_BACK_OWN_SUBMISSION"` or `cause:"WARD_UNRESOLVED"`. `CONFLICT_ALREADY_DECIDED` with `cause:"DUPLICATE_CLIENT_RECORD_ID"`, which returns the existing submission rather than creating another. `NOT_FOUND`. `SERVICE_DEGRADED`.

---

### C-073: Discourse boundary

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `discourse.*`

**Spec anchors:** FEAT-006, FEAT-011, FEAT-014, `architecture.md` Discourse Service

**Authority:** Owns Comment, Rule, ModerationAction and Appeal. A removal is a state change and never a delete. Every removal cites an active Rule. A removal without a rule is invalid and is restored when the case reaches review.

**Request:**
```json
{
  "operation": "createComment | listComments | applyModerationAction | createAppeal | decideAppeal | listOpenRemovals | listRules | attachRoutingFlag",
  "args": {
    "commentId": "cmt_01J9Z7G3H5J7K9L1M3N5P7Q9RS",
    "submissionId": "sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST",
    "moderatorId": "stf_01J9Z4D9E2F3G4H5J6K7M8NPQ",
    "ruleId": "rul_01J9Z3B1C2D3E4F5G6H7J8K9MN",
    "action": "remove | restore | hold_for_legal | release_from_legal",
    "reason": "…"
  }
}
```

**Response 200:**
```json
{
  "operation": "applyModerationAction",
  "result": {
    "moderationAction": { "id": "mda_01J9ZH1N3P5Q7R9S1T3U5V7WXY", "commentId": "cmt_01J9Z7G3H5J7K9L1M3N5P7Q9RS", "moderatorId": "stf_01J9Z4D9E2F3G4H5J6K7M8NPQ", "action": "remove", "ruleId": "rul_01J9Z3B1C2D3E4F5G6H7J8K9MN", "reason": "…", "reviewStatus": "open", "occurredAt": "2026-11-18T11:00:00Z" },
    "comment": { "id": "cmt_01J9Z7G3H5J7K9L1M3N5P7Q9RS", "status": "removed" }
  }
}
```

**Errors:** `VALIDATION_FAILED` with `fields:{"ruleId":"REQUIRED"}` for a removal. `POLICY_VIOLATION` with `cause:"MODERATOR_IS_SUBJECT"` or `cause:"RULE_RETIRED"`. `CONFLICT_ALREADY_DECIDED` for a decided appeal or an unchanged status. `NOT_FOUND`. `LEGAL_HOLD`.

---

### C-074: Decision and commitment boundary

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `record.*`

**Spec anchors:** FEAT-007, FEAT-008, FEAT-009, `architecture.md` Decision and Commitment Service

**Authority:** Owns Decision, Commitment and CommitmentStatusChange, and computes the overdue set and the answer rate from the record. A published decision is immutable in content. The overdue flag is derived from `submittedAt` and `status` and is never stored. The answer rate is computed from the record, never from an editable figure.

**Request:**
```json
{
  "operation": "getLiveDecision | publishDecision | reviseDecision | createCommitment | changeCommitmentStatus | listOverdue | computeAnswerRate | getCommitment",
  "args": {
    "submissionId": "sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST",
    "asOf": "2026-11-25T12:00:00Z",
    "periodStart": "2026-10-01T00:00:00Z",
    "periodEnd": "2026-11-25T23:59:59Z"
  }
}
```

**Response 200:**
```json
{
  "operation": "computeAnswerRate",
  "result": {
    "answerRate": 0.86,
    "answeredWithin21Days": 258,
    "eligible": 300,
    "excludedOutOfArea": 41,
    "excludedWithdrawnBeforeDecision": 12,
    "withheldInDenominator": 2,
    "computedAt": "2026-11-25T12:00:00Z"
  }
}
```

**Errors:** `CONFLICT_ALREADY_DECIDED` with `cause:"LIVE_DECISION_EXISTS"` and the existing decision id. `VALIDATION_FAILED` for missing mandatory fields per decision type. `POLICY_VIOLATION` with `cause:"TARGET_DATE_IN_PAST"`. `NOT_FOUND`. `SERVICE_DEGRADED`; a commitment count is never reconciled from a partial read.

---

### C-075: Reporting boundary

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `reporting.*`

**Spec anchors:** FEAT-008, FEAT-009, NFR-002, NFR-003, `architecture.md` Reporting Service

**Authority:** Produces the cached public record: the register, the ledger, the ward report and the card. Applies the suppression rule (a cell below five is suppressed and says so). Serves its last good output when the primary store is unavailable.

**Request:**
```json
{
  "operation": "getCommitmentRegister | getLedgerPage | getWardReport | getReportCard | buildSnapshots | invalidatePublicPage",
  "args": {
    "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
    "quarter": "2026-Q4",
    "month": "2026-11",
    "page": { "cursor": null, "limit": 20 },
    "cacheKey": "ward:wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM:2026-Q4"
  }
}
```

**Response 200:**
```json
{
  "operation": "getWardReport",
  "result": {
    "basis": "snapshot",
    "generatedAt": "2027-01-02T05:00:00Z",
    "counters": { "submissions": 63, "decisions": 51, "commitments": 22, "overdue": 4 },
    "suppressedCells": 1,
    "cache": { "key": "ward:wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM:2026-Q4", "hit": true, "expiresAt": "2027-01-02T06:00:00Z" }
  }
}
```

**Errors:** `NOT_FOUND` for an unknown ward or quarter. `VALIDATION_FAILED` for an unknown operation or a malformed quarter. `SERVICE_DEGRADED` with the last generated output and its `generatedAt`; a suppressed cell is always `null`, never zero.

---

### C-076: Notification boundary

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `notify.*`

**Spec anchors:** FEAT-001, FEAT-007, FEAT-011, NFR-010, `operations.md` Registration code delivery failure

**Authority:** Queues and delivers one-time codes, decision notices, appeal outcomes and session reminders. Holds a message when its channel is unavailable and retries with backoff. Never blocks the write that produced the notice.

**Request:**
```json
{
  "operation": "enqueue | getDeliveryState | listHeld",
  "args": {
    "channel": "sms | in_product",
    "template": "registration_code | decision_published | appeal_decided | session_reminder | data_request_outcome",
    "recipientMemberId": "mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
    "payload": { "reference": "ODP-004821", "decisionType": "commit" },
    "dedupeKey": "decision:dec_01J9ZB1C3D5E7F9G1H3J5K7LMP"
  }
}
```

**Response 201:**
```json
{
  "operation": "enqueue",
  "result": {
    "notificationId": "ntf_01J9ZN1P3Q5R7S9T1V3W5X7YZ",
    "channel": "sms",
    "state": "queued",
    "attempts": 0,
    "nextAttemptAt": "2026-11-25T12:00:30Z",
    "held": false
  }
}
```
A `dedupeKey` already present returns the existing notification with `state` unchanged. `held:true` means the channel is unavailable and the message is retained.

**Errors:** `VALIDATION_FAILED` for an unknown template, channel or operation. `NOT_FOUND` when `recipientMemberId` is unknown or anonymised. `SERVICE_DEGRADED` with `cause:"SMS_CHANNEL_UNAVAILABLE"`; the notification is held, not lost, and the caller is told the notice is queued rather than failing its own write.

---

### C-077: Audit and analytics boundary

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `audit.*` and `analytics.*`

**Spec anchors:** NFR-028, NFR-040, `analytics.md` Analytics Data Governance, `operations.md` Admin & Governance

**Authority:** Appends audit events and emits product events. The audit log is append-only: no update and no delete operation exists on this boundary, so `audit.append` is the only verb that writes it. Analytics events carry a pseudonymous `user_id` and never a name, telephone number, ward description or free text. The external reviewer may read the access log but never event content. The caller is the authenticated service credential and never a component named inside `args`; the permitted emitter list is operator configuration, not a value a caller may assert.

**Request:** four operations, each with its own argument shape. `args` carries only what the named operation needs, and an undeclared key is refused rather than ignored.

`audit.append` — `args` is exactly the `C-090` request, with `correlationId` travelling beside the entity rather than on it:
```json
{
  "operation": "audit.append",
  "args": {
    "actorId": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP",
    "actorRole": "response_staff",
    "action": "decision.published",
    "entityType": "Decision",
    "entityId": "dec_01J9ZB1C3D5E7F9G1H3J5K7LMP",
    "reason": "Commit published against ODP-004821.",
    "occurredAt": "2026-11-25T12:00:00Z",
    "correlationId": "req_01J9Z6M2V4"
  }
}
```

`analytics.emit` — `args` is exactly the `C-089` envelope, in `C-089`'s own spelling:
```json
{
  "operation": "analytics.emit",
  "args": {
    "event_name": "decision_published",
    "event_id": "evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AB",
    "occurred_at": "2026-11-25T12:00:00Z",
    "user_id": "usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
    "anonymous_id": null,
    "session_id": "ses_01J9ZQ2S4T6V8W1X3Y5Z7AB",
    "platform": "web",
    "app_version": "2026.11.3",
    "locale": "en-NG",
    "correlation_id": "req_01J9Z6M2V4",
    "properties": { "decision_type": "commit", "days_since_submission": 7, "version": 1 }
  }
}
```
The event name is always `event_name`, spelled as `analytics.md` tabulates it; `eventName` is not an accepted spelling and this boundary keeps no camel-case alias. The split is by owner, not by operation: an audit property keeps the `schema.md` spelling (`actorId`, `correlationId`) and an analytics property keeps the `analytics.md` spelling (`event_name`, `correlation_id`).

`audit.readAccessLog`:
```json
{ "operation": "audit.readAccessLog", "args": { "since": "2026-11-01T00:00:00Z", "limit": 20 } }
```
`since` is optional and inclusive; `limit` defaults to 20 and is refused outside 1–50, per the `C-001` pagination convention.

`analytics.replaceUserToken`:
```json
{ "operation": "analytics.replaceUserToken", "args": { "userId": "usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA" } }
```

**Response 201 (`audit.append`, `analytics.emit`) and 200 (`audit.readAccessLog`, `analytics.replaceUserToken`):** the answer frames the operation's own result, and each operation returns one shape and only that shape.

```json
{
  "ok": true,
  "operation": "audit.append",
  "result": { "ok": true, "id": "aud_01J9ZN2Q4R6S8T1V3W5X7Y9ZA", "appended": true, "sequence": 184223, "occurredAt": "2026-11-25T12:00:00Z" }
}
```
The `audit.append` result is the `C-090` response: the identifier field is `id`, there is no `auditEventId` spelling on either surface, and there is no `personalDataPresent` flag because an event carrying personal data is refused rather than accepted with a marker.

```json
{
  "ok": true,
  "operation": "analytics.emit",
  "result": { "ok": true, "accepted": true, "event_id": "evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AB", "storedAt": "2026-11-25T12:00:00Z" }
}
```
The `analytics.emit` result is the `C-089` response: `accepted`, `event_id` and `storedAt`, with the boundary's `ok` carried with it. `ok` appears at both levels on every successful answer because the outer flag answers the call and the inner one is the operation's own value; a caller may read either.

```json
{
  "ok": true,
  "operation": "audit.readAccessLog",
  "result": {
    "ok": true,
    "entries": [
      { "auditEventId": "aud_01J9ZN2Q4R6S8T1V3W5X7Y9ZA", "actorId": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP", "actorRole": "operator", "action": "member_data.read", "occurredAt": "2026-11-25T11:40:00Z" }
    ],
    "nextCursor": null
  }
}
```
One entry per recorded read, export or refusal; `auditEventId` names the entry being read, so it is the one place where the access-log field name differs from `C-090`'s response `id`. `reason` and `entityId` are deliberately absent, because the reason can quote the text of a held item and the target can name a submission whose author asked for deletion. `nextCursor` is `null` on the last page, per `C-001`.

```json
{
  "ok": true,
  "operation": "analytics.replaceUserToken",
  "result": { "ok": true, "userIdToken": "tok_01J9ZR3S5T7V9W1X3Y5Z7AB2C", "replacedEvents": 412 }
}
```
`userIdToken` is the non-reversible token now stored in place of the identifier, and `replacedEvents` is how many stored events it replaced. The operation is idempotent: the same `userId` derives the same token on every attempt, so a retry reports the replacement rather than issuing a second token. The caller appends `member_data.deleted` (`C-090`) after this returns; `analytics.md` makes the deletion complete only when the analytics store and the audit log both confirm.

**Errors:** one taxonomy across the four operations. `VALIDATION_FAILED` with `cause:"OPERATION_UNKNOWN"` and `fields:{"operation":"ENUM_MISMATCH"}` for any operation outside the four, including `audit.update` and `audit.delete`, because neither operation exists; `cause:"ARGS_MALFORMED"` with `fields:{"args":"REQUIRED"}` when `args` is not an object; and `cause:"AUDIT_EVENT_INVALID"` or `cause:"EVENT_ENVELOPE_INVALID"` with the field map from `C-090` or `C-089` when a property is missing, mistyped or outside its declared range. `VALIDATION_FAILED` with `cause:"ACCESS_LOG_LIMIT_OUT_OF_BAND"` and `fields:{"limit":"OUT_OF_BAND"}` when `limit` is outside 1–50, and with `cause:"USER_ID_INVALID"` and `fields:{"userId":"REQUIRED"}` or `"PATTERN_MISMATCH"` when `userId` is absent or not in the `C-001` form. `POLICY_VIOLATION` with `cause:"PERSONAL_DATA_IN_AUDIT_REASON"` or `cause:"PERSONAL_DATA_IN_EVENT"` when a property carries a name, telephone number, ward description or free text; the record is rejected, not redacted. `FORBIDDEN_ROLE` with `cause:"COMPONENT_NOT_PERMITTED"` when the authenticated component is not on the analytics emitter list. `SERVICE_DEGRADED` with `cause:"AUDIT_APPEND_FAILED"`, `cause:"ANALYTICS_STORE_UNAVAILABLE"` or `cause:"ACCESS_LOG_UNAVAILABLE"`; a failed audit append fails the originating write, because an unaudited state change is not permitted, while a failed emit is buffered and retried by its caller and never fails the write that produced it.

---

## Domain 5 — Inference Gateway RPC

### C-078: Inference Gateway invocation envelope

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `inference.invoke`

**Spec anchors:** NFR-012, NFR-013, NFR-014, NFR-015, NFR-045, NFR-050, NFR-051, NFR-052, NFR-053, `architecture.md` Inference Gateway

**Authority:** The only component permitted to call a model provider. Strips identifiers before anything leaves the platform, enforces the pinned version, timeout and cost ceiling per capability, and returns nothing on timeout or refusal so the caller falls back. No call originates from a page read. It cannot publish, decide, hold or remove anything.

**Request:**
```json
{
  "capability": "similar_submission | ward_candidate | moderation_routing | budget_line_extraction",
  "modelVersion": "odp-sim-2026-08-1",
  "timeoutMs": 1500,
  "costCeilingMicrosPerThousand": 50000,
  "caller": { "component": "submission_service", "correlationId": "req_01J9Z6M2V4" },
  "payload": {}
}
```
The gateway rewrites `modelVersion`, `timeoutMs` and `costCeilingMicrosPerThousand` from its pinned configuration; a caller-supplied value that differs is ignored and recorded. Every payload is checked against the de-identification rule before dispatch: `fullName`, `telephoneNumber`, `displayName`, `memberId`, `authorId`, `moderatorId`, `reviewerId`, `requestedById`, `confirmedById` and any free-text field carrying an address are removed or replaced with a neutral token. A payload containing a telephone-number pattern is refused.

**De-identification rule:** the outbound payload contains no name, no telephone number, no member identifier, and no ward description beyond the `wardId` needed to scope a ranking. Preferred removal is omission; where a field is structurally required, the gateway substitutes a constant. The gateway reports `removedFields` on every response so payload inspection required by `NFR-045` is reproducible.

**Response 200:**
```json
{
  "capability": "similar_submission",
  "modelVersion": "odp-sim-2026-08-1",
  "outcome": "ok",
  "latencyMs": 412,
  "costMicros": 38,
  "removedFields": ["memberId", "displayName"],
  "result": {}
}
```
`outcome` is `ok`, `timeout`, `refused`, `disabled` or `error`. `result` carries the shape defined in `C-079` to `C-082`, and is `null` on every outcome other than `ok`. There is no partial result.

**Errors:** `CAPABILITY_UNAVAILABLE` with `cause:"CAPABILITY_DISABLED"` or `cause:"PROVIDER_UNAVAILABLE"`, and `result:null`. `POLICY_VIOLATION` with `cause:"IDENTIFIER_PRESENT"` and `fields` naming the offending payload paths; the call is not dispatched and an audit event is appended. `VALIDATION_FAILED` for an unknown capability, a payload that is not an object, or a missing `correlationId`. `RATE_LIMITED` when the capability's spend ceiling for the current window is reached, with `retryAfterSeconds`. `SERVICE_DEGRADED` when the gateway itself is unreachable; the caller's deterministic path runs.

---

### C-079: `similar_submission` capability

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `inference.invoke` with `capability:"similar_submission"`

**Spec anchors:** FEAT-003, NFR-050, NFR-012, EVT-011, EVT-038, EVT-039, EVT-040, EVT-041, `screens/06-submission-form.md`

**Authority:** Ranks existing published submissions in the same ward against a draft. Returns at most three. Never merges, hides, blocks or edits a submission.

**Request:**
```json
{
  "capability": "similar_submission",
  "modelVersion": "odp-sim-2026-08-1",
  "timeoutMs": 1500,
  "costCeilingMicrosPerThousand": 50000,
  "payload": {
    "draftBody": "The borehole at Agbowo market has been dry since March and the women selling there buy water from vendors.",
    "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
    "type": "proposal",
    "pillar": "infrastructure",
    "candidateLimit": 3
  }
}
```

**Response 200:**
```json
{
  "capability": "similar_submission",
  "modelVersion": "odp-sim-2026-08-1",
  "outcome": "ok",
  "latencyMs": 412,
  "costMicros": 38,
  "removedFields": ["memberId", "displayName"],
  "result": {
    "candidates": [
      { "submissionId": "sub_01J9Z4P1Q2R3S4T5V6W7X8Y9ZA", "similarityScore": 0.91, "rank": 1 },
      { "submissionId": "sub_01J9Z4Q2R3S4T5V6W7X8Y9ZAB", "similarityScore": 0.74, "rank": 2 }
    ]
  }
}
```

**Errors:** `CAPABILITY_UNAVAILABLE` with `cause:"CAPABILITY_DISABLED"` or `cause:"TIMEOUT"`, `result:null`, and the caller uses exact and near-string matching. `POLICY_VIOLATION` with `cause:"IDENTIFIER_PRESENT"`. `VALIDATION_FAILED` when `draftBody` is missing or `candidateLimit` exceeds 3. `RATE_LIMITED` at the spend ceiling.

---

### C-080: `ward_candidate` capability

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `inference.invoke` with `capability:"ward_candidate"`

**Spec anchors:** FEAT-002, NFR-051, NFR-014, EVT-006, EVT-038, EVT-039, EVT-041, `screens/05-ward-confirmation.md`

**Authority:** Returns up to three candidate wards with a confidence ordering. Never assigns a ward; an unconfirmed candidate changes nothing.

**Request:**
```json
{
  "capability": "ward_candidate",
  "modelVersion": "odp-ward-2026-08-1",
  "timeoutMs": 1500,
  "costCeilingMicrosPerThousand": 50000,
  "payload": {
    "description": "Behind Agbowo market, near the express",
    "localGovernmentArea": "Ibadan North",
    "candidateLimit": 3
  }
}
```

**Response 200:**
```json
{
  "capability": "ward_candidate",
  "modelVersion": "odp-ward-2026-08-1",
  "outcome": "ok",
  "latencyMs": 268,
  "costMicros": 21,
  "removedFields": ["memberId", "fullName", "telephoneNumber"],
  "result": {
    "candidates": [
      { "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM", "confidence": 0.88, "rank": 1 },
      { "wardId": "wrd_01J9Z5B2C3D4E5F6G7H8J9KMP", "confidence": 0.42, "rank": 2 }
    ]
  }
}
```

**Errors:** `CAPABILITY_UNAVAILABLE` with `result:null`; the caller falls back to alias and exact matching and then to the review queue. `POLICY_VIOLATION` with `cause:"IDENTIFIER_PRESENT"`; a description containing a telephone-number pattern is refused. `VALIDATION_FAILED` when `description` is missing or exceeds 500 characters. `RATE_LIMITED`.

---

### C-081: `moderation_routing` capability

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `inference.invoke` with `capability:"moderation_routing"`

**Spec anchors:** FEAT-011, NFR-052, NFR-015, EVT-020, EVT-022, EVT-038, EVT-041, `screens/17-moderation-log.md`

**Authority:** Returns exactly one advisory label from `ordinary`, `abuse_or_threat`, `named_allegation`, `spam`. The label orders the moderator's queue. It never removes, holds, publishes or changes a comment's status, and criticism of the candidate is never a label it may produce.

**Request:**
```json
{
  "capability": "moderation_routing",
  "modelVersion": "odp-mod-2026-08-1",
  "timeoutMs": 30000,
  "costCeilingMicrosPerThousand": 100000,
  "payload": {
    "commentBody": "The tender was never advertised in this ward, so how did the contractor get chosen?"
  }
}
```

**Response 200:**
```json
{
  "capability": "moderation_routing",
  "modelVersion": "odp-mod-2026-08-1",
  "outcome": "ok",
  "latencyMs": 1904,
  "costMicros": 74,
  "removedFields": ["memberId", "displayName"],
  "result": { "routingFlag": "ordinary", "confidence": 0.93 }
}
```
A response whose `routingFlag` is anything other than the four enum values is discarded and reported as `outcome:"error"`.

**Errors:** `CAPABILITY_UNAVAILABLE` with `result:null`; the queue falls back to chronological order with no flag. `POLICY_VIOLATION` with `cause:"IDENTIFIER_PRESENT"`. `VALIDATION_FAILED` when `commentBody` is missing or empty. `RATE_LIMITED`.

---

### C-082: `budget_line_extraction` capability

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `inference.invoke` with `capability:"budget_line_extraction"`

**Spec anchors:** FEAT-009, NFR-053, NFR-013, EVT-029, EVT-030, EVT-038, EVT-041, `screens/20-report-card-workbench.md`

**Authority:** Extracts candidate appropriation lines for a commitment. Returns candidates with a confidence score; nothing is published until a named staff member confirms it in `C-048`.

**Request:**
```json
{
  "capability": "budget_line_extraction",
  "modelVersion": "odp-budget-2026-08-1",
  "timeoutMs": 60000,
  "costCeilingMicrosPerThousand": 500000,
  "payload": {
    "commitmentText": "Rehabilitate the borehole at Agbowo market and keep it running.",
    "wardId": "wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM",
    "pillar": "infrastructure",
    "appropriationExcerpt": "…"
  }
}
```

**Response 200:**
```json
{
  "capability": "budget_line_extraction",
  "modelVersion": "odp-budget-2026-08-1",
  "outcome": "ok",
  "latencyMs": 8210,
  "costMicros": 430,
  "removedFields": ["owner", "memberId", "displayName"],
  "result": {
    "candidates": [
      { "lineReference": "IB-N/WS/2027/014", "lineDescription": "Rehabilitation of community boreholes, Ibadan North", "amount": 12000000, "confidence": 0.93 }
    ]
  }
}
```

**Errors:** `CAPABILITY_UNAVAILABLE` with `result:null`; the workbench switches to manual reconciliation and every commitment shows as unmatched. `POLICY_VIOLATION` with `cause:"IDENTIFIER_PRESENT"`; an owner name in the payload is refused rather than silently used. `VALIDATION_FAILED` when `commitmentText` or `appropriationExcerpt` is missing. `RATE_LIMITED`.

---

## Domain 6 — Background Worker Jobs

### C-083: Twenty-one-day overdue check job

**Status:** Frozen

**Auth:** Worker secret

**Surface:** Scheduled job `overdue-check`, daily at 06:00 Africa/Lagos

**Spec anchors:** FEAT-007, FEAT-008, EVT-027, `screens/09-public-ledger.md`

**Authority:** Finds every in-state submission with `status:"awaiting_decision"` whose `submittedAt` is more than twenty-one days before the run, emits `submission_overdue` once per submission per day, and invalidates the ledger and register cache so the entries appear without anyone adding them. Never publishes a decision and never edits a submission.

**Request:**
```json
{
  "job": "overdue-check",
  "runKey": "overdue-check:2026-11-19",
  "asOf": "2026-11-19T06:00:00Z",
  "dryRun": false
}
```

**Response 200:**
```json
{
  "job": "overdue-check",
  "runKey": "overdue-check:2026-11-19",
  "outcome": "completed",
  "overdueFound": 7,
  "newlyOverdue": 2,
  "eventsEmitted": 2,
  "cacheInvalidated": ["ledger", "commitment-register"],
  "durationMs": 4210
}
```

**Errors:** `CONFLICT_ALREADY_DECIDED` with `cause:"RUN_KEY_ALREADY_COMPLETED"`, which returns the prior result unchanged. `SERVICE_DEGRADED` with `cause:"PRIMARY_STORE_UNAVAILABLE"`; the run is retried on the next scheduled tick and no partial invalidation is applied. `VALIDATION_FAILED` for a missing `runKey` or `asOf`.

---

### C-084: Quarterly report card generation job

**Status:** Frozen

**Auth:** Worker secret

**Surface:** Scheduled job `report-card-generation`, at 05:00 Africa/Lagos on the first day after a quarter closes

**Spec anchors:** FEAT-009, NFR-013, `screens/20-report-card-workbench.md`, `screens/11-quarterly-report-card.md`

**Authority:** Computes the quarter's figures and ward and pillar snapshots and stages them for the workbench. Does not publish: publication is `C-061`. Applies suppression below five in a ward-pillar cell and sets `suppressionApplied`.

**Request:**
```json
{ "job": "report-card-generation", "runKey": "report-card:2026-Q4", "quarter": "2026-Q4", "cutOffAt": "2026-12-31T23:59:59Z" }
```

**Response 200:**
```json
{
  "job": "report-card-generation",
  "runKey": "report-card:2026-Q4",
  "outcome": "completed",
  "stagedSnapshots": { "wards": 33, "wardPillars": 231 },
  "suppressedCells": 4,
  "budgetLineCandidates": 118,
  "figures": { "answerRate": 0.86, "deliveryRate": 0.71, "committedCount": 214, "deliveredCount": 61, "slippedCount": 12, "droppedCount": 7 },
  "published": false
}
```

**Errors:** `CONFLICT_ALREADY_DECIDED` with `cause:"QUARTER_ALREADY_STAGED"`; the run returns the staged result rather than recomputing. `POLICY_VIOLATION` with `cause:"QUARTER_NOT_CLOSED"`. `SERVICE_DEGRADED` with `cause:"REPORTING_SERVICE_UNAVAILABLE"`; the previous card stays readable and the job retries. `VALIDATION_FAILED` for a malformed quarter.

---

### C-085: Backing anomaly review job

**Status:** Frozen

**Auth:** Worker secret

**Surface:** Scheduled job `backing-anomaly-review`, hourly at :15

**Spec anchors:** FEAT-005, NFR-027, EVT-017, `screens/07-submission-detail.md`

**Authority:** Detects concentrated backing and voids individual backings when the pattern is confirmed. Holds the published count as `under_review` while a case is open. Never rejects the members and never removes a submission. The concentrated-backing rule: more than fifty backings from accounts created in the last seven days on one submission in one day holds the count pending review; sudden concentrated backing from one ward marks the submission for anomaly review.

**Request:**
```json
{ "job": "backing-anomaly-review", "runKey": "backing-anomaly:2026-11-19T10:15", "window": "PT1H", "asOf": "2026-11-19T10:15:00Z" }
```

**Response 200:**
```json
{
  "job": "backing-anomaly-review",
  "runKey": "backing-anomaly:2026-11-19T10:15",
  "outcome": "completed",
  "submissionsFlagged": 2,
  "countsHeld": 2,
  "backingsVoided": 0,
  "casesOpened": 2,
  "eventsEmitted": 0
}
```
A voided backing sets `Backing.state:"voided"`, emits `backing_voided` with a `reasonCode`, and requires a recorded reviewer. Holding a count never changes any backing's state.

**Errors:** `CONFLICT_ALREADY_DECIDED` with `cause:"WINDOW_ALREADY_PROCESSED"`. `SERVICE_DEGRADED` with `cause:"SUBMISSION_STORE_UNAVAILABLE"`; the window is retried and no count is released. `VALIDATION_FAILED` for a missing window or run key.

---

### C-086: Cache pre-warming job

**Status:** Frozen

**Auth:** Worker secret

**Surface:** Scheduled job `cache-prewarm`, every ten minutes

**Spec anchors:** NFR-001, NFR-002, NFR-003, NFR-010, `architecture.md` Reporting Service

**Authority:** Renders and caches the public record pages most likely to be read, so a resident reads a commitment without waiting on an application bundle and the record stays readable during degradation. Never writes public content and never changes a figure; it only re-renders what the reporting boundary already produces.

**Request:**
```json
{ "job": "cache-prewarm", "runKey": "cache-prewarm:2026-11-19T10:10", "targets": ["record-home", "commitment-register:page:1", "ledger:2026-11", "ward-report:top-20", "report-card:latest"] }
```

**Response 200:**
```json
{
  "job": "cache-prewarm",
  "runKey": "cache-prewarm:2026-11-19T10:10",
  "outcome": "completed",
  "pagesRendered": 27,
  "pagesFailed": 0,
  "oldestRenderedAt": "2026-11-19T10:10:04Z",
  "bytesWritten": 1843200
}
```

**Errors:** `SERVICE_DEGRADED` with `cause:"PRIMARY_STORE_UNAVAILABLE"`; the job leaves the existing cache untouched so the last good pages keep serving, and reports `pagesSkipped`. `POLICY_VIOLATION` when a target would render a suppressed figure unsuppressed; that target is skipped and reported. `VALIDATION_FAILED` for an unknown target.

---

### C-087: Backup verification job

**Status:** Frozen

**Auth:** Worker secret

**Surface:** Scheduled job `backup-verify`, daily at 03:30 Africa/Lagos, with a quarterly restore rehearsal

**Spec anchors:** NFR-010, NFR-011, `architecture.md` Backup & Recovery

**Authority:** Verifies that a backup exists within the fifteen-minute recovery point, that its retention is thirty-five days, and that a restore reconciles commitment counts before and after. Never restores over production.

**Request:**
```json
{ "job": "backup-verify", "runKey": "backup-verify:2026-11-19", "rehearsal": false, "restoreTarget": "verification-instance" }
```

**Response 200:**
```json
{
  "job": "backup-verify",
  "runKey": "backup-verify:2026-11-19",
  "outcome": "completed",
  "latestBackupAt": "2026-11-19T03:15:00Z",
  "recoveryPointMinutes": 15,
  "retentionDays": 35,
  "restoreReconciled": true,
  "commitmentCountBefore": 214,
  "commitmentCountAfter": 214,
  "rehearsal": false
}
```

**Errors:** `SERVICE_DEGRADED` with `cause:"BACKUP_MISSING"` or `cause:"RECONCILIATION_MISMATCH"`; the job raises a SEV-2 alert and reports the differing counts. `CONFLICT_ALREADY_DECIDED` with `cause:"RUN_KEY_ALREADY_COMPLETED"`. `LEGAL_HOLD` when a rehearsal would touch a store under a preservation instruction; the rehearsal is skipped and reported.

---

### C-088: Handover and archive job

**Status:** Frozen

**Auth:** Worker secret

**Surface:** Single scheduled job `handover-archive`, run once at the fixed transfer date 2027-02-06T00:00:00Z, retried until it succeeds

**Spec anchors:** FEAT-013, FEAT-012, NFR-011, `release.md` Go-Live Checklist

**Authority:** Transfers the register and ledger to the named custodian, or, when no custodian is in place, makes the record a read-only archive. Removes direct identifiers. Excludes the personal data of a member who withheld `record_transfer` consent while keeping their submissions anonymised. On partial failure the record stays read-only at its original address, the failure is published, and the job retries. Never improvises a custodian.

**Request:**
```json
{ "job": "handover-archive", "runKey": "handover:2027-02-06", "custodianId": "cus_01J9ZP1Q3R5S7T9V1W3X5Y7ZA", "mode": "transfer | archive" }
```

**Response 200:**
```json
{
  "job": "handover-archive",
  "runKey": "handover:2027-02-06",
  "outcome": "completed",
  "mode": "archive",
  "recordAddress": "https://oyodigitalparliament.ng",
  "readOnly": true,
  "directIdentifiersRemoved": 2004,
  "transferConsentExcluded": 61,
  "submissionsRetained": 5921,
  "decisionsRetained": 4810,
  "commitmentsRetained": 903,
  "publicNoticeId": "ntc_01J9ZP2R4S6T8V1W3X5Y7Z9AB"
}
```
The job writes the handover snapshot to object storage, publishes the public notice naming who holds the record and what they may do with it, and records the outcome for `C-090`. A member whose account was already anonymised keeps their submission under the non-identifying author reference.

**Errors:** `POLICY_VIOLATION` with `cause:"CUSTODIAN_TERMS_UNPUBLISHED"` or `cause:"NO_CUSTODIAN_AND_NO_ARCHIVE_DECISION"`; the job does not proceed. `CONFLICT_ALREADY_DECIDED` with `cause:"TRANSFER_ALREADY_COMPLETED"`, returning the completed result. `SERVICE_DEGRADED` with `cause:"TRANSFER_PARTIAL_FAILURE"`; the record is left read-only and the run is retried with the same `runKey`. `LEGAL_HOLD` when a preservation instruction covers a data class; the job proceeds with the classes not held and reports the held ones.

---

## Domain 7 — Event Envelopes

### C-089: Analytics event envelope

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `analytics.emit`

**Spec anchors:** EVT-001–EVT-048, `analytics.md`, NFR-040, NFR-045

**Authority:** Carries product events to the analytics platform. No event carries a name, a telephone number, a ward description or any free text. `user_id` is pseudonymous and absent before registration. No optional analytics exists, so no event is consent-gated, and the privacy notice says so in those words. Raw events are retained 26 months and then aggregated; a deletion request replaces `user_id` with a non-reversible token so historical counts survive.

**Request:**
```json
{
  "event_name": "decision_published",
  "event_id": "evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AB",
  "occurred_at": "2026-11-25T12:00:00Z",
  "user_id": "usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA",
  "anonymous_id": null,
  "session_id": "ses_01J9ZQ2S4T6V8W1X3Y5Z7AB",
  "platform": "web",
  "app_version": "2026.11.3",
  "locale": "en-NG",
  "correlation_id": "req_01J9Z6M2V4",
  "properties": { "decision_type": "commit", "days_since_submission": 7, "version": 1 }
}
```
Common properties on every event are exactly `event_id`, `occurred_at`, `user_id`, `anonymous_id`, `session_id`, `platform`, `app_version`, `locale`, with `correlation_id` required on the four model events and on any failure event. Each `event_name` is one of the EVT-### names and carries only the key properties tabulated for it in `analytics.md`. Field names here are the `analytics.md` spelling in lower snake case throughout: `event_name`, `correlation_id`, `user_id`. `C-077`, the boundary that carries this envelope, accepts no other spelling and keeps no camel-case alias, so the tabulated name is the only name an emitter can send.

**Response 201:**
```json
{
  "accepted": true,
  "event_id": "evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AB",
  "storedAt": "2026-11-25T12:00:00Z"
}
```
`C-077` returns this shape as its `result` for `analytics.emit`; the two cannot drift apart because the boundary nests the envelope's answer rather than restating it.

**Errors:** `VALIDATION_FAILED` for a missing common property, an unknown `event_name`, or a key property outside the taxonomy (`fields` names each). `POLICY_VIOLATION` with `cause:"PERSONAL_DATA_IN_EVENT"` when a property carries a name, telephone number, ward description, submission text, comment text or extracted budget line; the event is rejected, not redacted. `SERVICE_DEGRADED` when the analytics platform is unreachable: the event is buffered and retried, and the originating write is not failed, because analytics is a low-criticality path.

---

### C-090: Audit event envelope

**Status:** Frozen

**Auth:** Internal only

**Surface:** Internal RPC `audit.append`

**Spec anchors:** NFR-028, `schema.md` AuditEvent, `operations.md` Admin & Governance, `analytics.md` Deletion propagation

**Authority:** Records every state change with actor, target, action, time and reason, in an append-only store. Retention is 24 months. The external reviewer and the operator may read it; no component may update or delete an entry. A deletion request is not complete until the analytics store and this log both confirm. A refused member-data read is recorded as a refusal.

**Request:**
```json
{
  "id": "aud_01J9ZN2Q4R6S8T1V3W5X7Y9ZA",
  "actorId": "stf_01J9Z4C8D1E2F3G4H5J6K7M8NP",
  "actorRole": "response_staff",
  "action": "decision.published",
  "entityType": "Decision",
  "entityId": "dec_01J9ZB1C3D5E7F9G1H3J5K7LMP",
  "reason": "Commit published against ODP-004821.",
  "occurredAt": "2026-11-25T12:00:00Z",
  "correlationId": "req_01J9Z6M2V4"
}
```
`actorId` references a Member or StaffUser; `actorRole` is one of `member`, `ward_organiser`, `response_staff`, `moderator`, `external_reviewer`, `legal_reviewer`, `operator`, `system`. `action` is a stable verb such as `member.registered`, `identity_state.changed`, `decision.published`, `decision.revised`, `comment.removed`, `comment.restored`, `legal.takedown`, `member_data.read`, `member_data.read_refused`, `member_data.export`, `member_data.deleted`, `ward.resolved`, `residence.reviewed`, `data_request.completed`, `flag.changed`, `role.changed`, `handover.completed`.

`correlationId` is the request identifier from `C-001` in its `req_` form, not a property of the record: `schema.md` declares no such field on `AuditEvent`, and adding one here would be a schema change rather than a contract change. The append therefore carries it beside the entity, the log stores it with the row, and no read returns it as part of the event. `actorId` and `entityId` take the `C-001` identifier form, each with the prefix of the entity it names (`mbr_`, `stf_`, `dec_`, `sub_`, `cmt_` and so on).

**Response 201:**
```json
{
  "id": "aud_01J9ZN2Q4R6S8T1V3W5X7Y9ZA",
  "appended": true,
  "sequence": 184223,
  "occurredAt": "2026-11-25T12:00:00Z"
}
```
`id` is the identifier of the record just written and `sequence` is its position in the append-only log. `C-077` returns this shape unchanged as its `result` for `audit.append`, so the field is `id` on both surfaces and there is no second spelling of it.

**Errors:** `VALIDATION_FAILED` with `fields` for `id`, `actorId`, `actorRole`, `action`, `entityType`, `entityId`, `occurredAt` or `correlationId` when missing or malformed, and for any key the envelope does not declare (`UNKNOWN_FIELD`). `POLICY_VIOLATION` with `cause:"PERSONAL_DATA_IN_AUDIT_REASON"` when `reason` reproduces a name, telephone number or the text of a held item; the append is refused so the log cannot become a second copy of the data it protects. There is no update and no delete operation: a caller that names one is refused at the boundary with `VALIDATION_FAILED` and `cause:"OPERATION_UNKNOWN"` (`C-077`), because no second verb exists to serve it. `SERVICE_DEGRADED`; a failed append fails the originating state change, and the change is not committed.

---

## Domain 8 — Operational Probes

### C-091: Operational health probes

**Status:** Frozen

**Auth:** Monitor only

**Surface:** Route handlers `GET /healthz` and `GET /readyz` on the web deployable, and the same two paths on the worker's own listener

**Spec anchors:** NFR-010, NFR-011, `operations.md` Incident & Escalation, `architecture.md` Logging & Monitoring, `nfr.md` Availability & Reliability

**Authority:** Reports whether the process is alive and whether it can serve traffic. The probes answer for the process only: they read no record, write nothing, create no session, take no cache entry and change no state. They are the origin of no audit event and no analytics event, because neither a liveness check nor a readiness check is a state change. The reverse proxy, not the application, is the access boundary: both paths are admitted only from the uptime monitor's address, and the application itself requires no credential. Recorded here because the contract set predates the probes; ADR-001 platform decision 9 establishes them.

**Request:**
```json
{ "method": "GET", "path": "/healthz", "query": {}, "headers": {}, "body": null }
```
```json
{ "method": "GET", "path": "/readyz", "query": {}, "headers": {}, "body": null }
```
Both take no query parameter, no request body, no cookie and no header. A request carrying a body is answered identically rather than refused, because the monitor sends none and a probe that parses input is a probe that can be made to fail. Any method other than `GET` is refused with `405` and `Allow: GET`.

**Response 200 (liveness):**
```json
{ "status": "alive" }
```
`/healthz` answers `200` whenever the process can answer at all. It consults no dependency, because a liveness probe that fails on a database outage restarts a healthy process and turns one degraded dependency into an outage. When the process cannot answer, the connection fails and the orchestrator observes that directly; there is no failure body to define.

**Response 200 (readiness):**
```json
{ "status": "ready" }
```

**Response 503 (not ready):**
```json
{ "status": "not_ready" }
```
`/readyz` answers `200` only when the process can accept traffic. The readiness decision is the process's own shutdown state plus one non-recording round trip against the store the process cannot serve without: the primary datastore for the web deployable, and the same store for the worker. The check confirms the process can serve and has not begun draining. It reads no record, names no dependency, and reports no reason — the body is constant, because a probe reachable from outside the hosting environment must not disclose the topology, the dependency that failed, a version or a hostname to whoever reaches it. During a graceful shutdown the answer turns `503` before the listener closes, so the proxy stops routing before the process stops serving, and an in-flight batch on the worker is allowed to finish. On the worker the same two paths report the worker's own process, and readiness there means the next scheduled batch can be taken.

**Probe response rules:** every probe response carries `Content-Type: application/json` and `Cache-Control: no-store`, and the body is byte-identical on every answer of the same status. A probe response carries no `meta`, no `correlationId`, no `asAt`, no rate-limit headers, no build identifier and no timestamp: the `C-001` envelope and its `RateLimit-*` headers apply to the `/api` surfaces, and a probe stays outside them deliberately. The probes are not rate-limited, because the limiter is state and a probe must add none. `/healthz` answers from memory alone. `/readyz`'s single datastore round trip is bounded by a fixed timeout shorter than the monitor's sampling interval, so a datastore that hangs produces `503` rather than a hanging probe, and neither path consults the cache, so a cache outage changes neither answer.

**Monitoring use:** the external uptime monitor samples `/readyz` once a minute from outside the hosting environment, which is how `NFR-010` is measured, and the same check runs against the archive address after handover for `NFR-011`. The container orchestrator uses `/healthz` for liveness and `/readyz` before it routes traffic to an instance. An alert fires at eighty percent of the monthly error budget consumed, per `operations.md` Incident & Escalation.

**Errors:** no `C-001` error envelope is used on either path. `/readyz` answers `503` with `{"status":"not_ready"}` and `/healthz` answers nothing when it cannot answer. A caller outside the monitor allowlist is refused at the reverse proxy before the request reaches the application; the deployment requirement is that both paths are reachable only from the monitor, and a test exercises that refusal. A `405` on a non-`GET` method is the only application-level refusal either path produces.

