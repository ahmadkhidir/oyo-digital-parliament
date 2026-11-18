-- Reverse of 0002_outbound_notification_queue.sql
-- (packages/db/AGENTS.md: every migration ships a tested down path).
--
-- The down path drops the outbound queue outright, because the record only ever holds messages that are
-- still owed or have just been delivered. Nothing else references the table and no other table keeps a
-- foreign key into it, so a rollback leaves no dangling reference.
--
-- Two consequences are deliberate and are the reason this path needs a written decision before it runs in
-- a shared environment, not a code change:
--
-- 1. A message held during an outage at the moment of the rollback is lost with the table. The spec's own
--    recovery plan (`operations.md` Registration code delivery failure) is a different one — a provider
--    switch, with the pending registrations preserved — so rolling the queue back is not that plan.
-- 2. A resident whose code was held is left with a code they never received. That is visible in the
--    pending registration, which is preserved here as everywhere else, and the resident can resend.

DROP INDEX IF EXISTS "outbound_notification_held_idx";

DROP INDEX IF EXISTS "outbound_notification_due_idx";

DROP INDEX IF EXISTS "outbound_notification_dedupe_key_key";

DROP TABLE IF EXISTS "outbound_notification" CASCADE;
