/**
 * The repository export surface (`packages/db/AGENTS.md` Structure).
 *
 * One repository per domain port. Only this barrel is exported from the package root; an entity
 * module is never a repository.
 */
export {
  createAuditEventRepository,
  readAuditEventsForEntity,
  type AuditEventRepository,
} from './audit-event.repository.ts';
