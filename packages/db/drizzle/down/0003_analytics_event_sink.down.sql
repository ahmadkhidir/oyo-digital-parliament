-- Reverse of 0003_analytics_event_sink.sql
-- (packages/db/AGENTS.md: every migration ships a tested down path).
--
-- The down path drops the analytics sink outright. Nothing in the public record references
-- `analytics_event`: no other table keeps a foreign key into it, and no published figure is derived
-- from it at read time (report cards and ward snapshots have their own tables). A rollback therefore
-- leaves the product's record intact.
--
-- Two consequences are deliberate, and they are why this path needs a written decision before it runs
-- in a shared environment:
--
-- 1. Every raw event held at the moment of the rollback is lost, including any that had not yet been
--    aggregated. The 26-month retention in nfr.md is a maximum, not a guarantee, and a rollback is an
--    explicit operator act.
-- 2. A deletion request that had propagated into this table loses its confirmation. The request is
--    only complete when the analytics store and the audit log both confirm (C-077), so a rollback
--    during an open request must be followed by the analytics half being confirmed afresh once the
--    sink is restored.
--
-- The down path creates no replacement store: reintroducing the sink is the forward migration, not a
-- second table written by hand.

DROP INDEX IF EXISTS "analytics_event_expiry_idx";

DROP INDEX IF EXISTS "analytics_event_user_idx";

DROP INDEX IF EXISTS "analytics_event_name_occurred_idx";

DROP TABLE IF EXISTS "analytics_event";
