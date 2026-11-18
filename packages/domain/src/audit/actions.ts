/**
 * The stable verbs an audit record names as its action (`C-090`).
 *
 * `C-090` lists the verbs the launched features use and calls them "such as", because a later feature
 * adds one. The list below is therefore the known set typed for call sites, while validation accepts
 * any well-formed dotted verb: the rule that matters is that the action is a stable machine token and
 * never a sentence a person typed. A free-text action could not pass the pattern.
 */

/** The verbs `C-090` names, plus the identity and content verbs the launched features use. */
export const KNOWN_AUDIT_ACTIONS = [
  'member.registered',
  'identity_state.changed',
  'decision.published',
  'decision.revised',
  'comment.removed',
  'comment.restored',
  'legal.takedown',
  'member_data.read',
  'member_data.read_refused',
  'member_data.export',
  'member_data.deleted',
  'ward.resolved',
  'residence.reviewed',
  'data_request.completed',
  'flag.changed',
  'role.changed',
  'handover.completed',
] as const;

/** One of the verbs `C-090` names. */
export type KnownAuditAction = (typeof KNOWN_AUDIT_ACTIONS)[number];

/**
 * A stable verb: one or more lower-case segments joined by dots, at most the 80 characters
 * `schema.md` allows. `member.registered` and `decision.revised` are the shape; `Removed a thing`
 * is not.
 */
export const AUDIT_ACTION_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/** The longest action `schema.md` allows. */
export const AUDIT_ACTION_MAX_LENGTH = 80;

/** Whether a value is one of the verbs `C-090` names. */
export function isKnownAuditAction(value: string): value is KnownAuditAction {
  return (KNOWN_AUDIT_ACTIONS as readonly string[]).includes(value);
}
