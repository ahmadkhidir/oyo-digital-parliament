# ADR-004: Staff authentication

- Status: Accepted
- Date: 2026-11-18

## Context

The admin console is role-scoped and its actions are frozen in `CONTRACTS.md`, but the specification
never says how a staff user signs in. `StaffUser` carries a name, a role, an external flag, authorised
wards and a `secondFactorEnrolled` boolean, and it carries no credential. The contract set covers member
one-time codes and member sessions, not staff sign-in, second-factor enrolment or a staff session. Phase 1
needs response staff to work the ward review queue and the operator to work the data request queue, so
the gap blocks the admin surface.

The product owner chose username plus password plus TOTP. The alternatives were a telephone one-time code
(which adds a staff telephone field and another SMS dependency), an email magic link (which needs an email
gateway the specification does not name), and external SSO (which adds a vendor outside the current
dependency list).

## Decision

1. **First factor.** A staff user signs in with a unique username and a password. The password is stored
   only as an Argon2id hash at cost 12 or above, in line with `NFR-021`. A username is a staff
   identifier; it is never a member identifier, a telephone number or an email address.
2. **Second factor.** TOTP is mandatory for every staff role. Enrolment must be completed before any
   admin route, other than the enrolment screen, is reachable. A staff member whose
   `secondFactorEnrolled` is false can complete enrolment and nothing else.
3. **Credential record.** A `StaffCredential` record linked one-to-one to `StaffUser` holds the unique
   username, the password hash, the TOTP secret encrypted at rest, the enrolment time, single-use
   recovery-code hashes, the failed-attempt count, the lock expiry and the last sign-in time. No member
   personal data is copied into it.
4. **Sessions.** Staff sessions use secure, HttpOnly, SameSite cookies in a namespace separate from member
   sessions, with absolute and idle timeouts. A session is cleared on sign-out, on a role change and on
   deactivation. Session material is opaque and stored hashed.
5. **Recovery and lockout.** Recovery codes are issued once at enrolment, hashed, and single-use. Five
   failed password or TOTP attempts within fifteen minutes lock the account for thirty minutes; an
   operator may reset the credential and the second factor, and the reset is audited.
6. **Audit.** Every sign-in attempt, failure, enrolment, recovery, reset and admin action records the
   actor, target, action, time and reason. A refused attempt is recorded, never silently dropped.
7. **No member data.** Staff authentication never reads a member's name, telephone number, ward
   description or member identifier. The external reviewer path remains free of member personal data.

## Consequences

- `schema.md` gains the `StaffCredential` record and `operations.md` states the second-factor, lockout and
  recovery policy. This is a specification change and runs as an isolated subagent.
- `CONTRACTS.md` gains `C-092` for staff sign-in, TOTP verification, enrolment, staff session read and
  sign-out, through a change request.
- `packages/domain/src/identity` owns the staff sign-in policy; `packages/platform` owns the session
  adapter; `apps/web` owns the admin shell and the TOTP screens.
- The first operator and response-staff accounts are seeded through a one-time setup that reads an initial
  credential from the environment; no credential is committed.
- `NFR-020`, `NFR-021` and `NFR-026` now have a surface that proves them.
- A staff member who loses both factors depends on an operator reset; that is the accepted cost of not
  adding an email or SSO dependency.
