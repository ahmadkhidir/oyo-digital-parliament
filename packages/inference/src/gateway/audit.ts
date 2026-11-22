/**
 * The audit seam (`C-078`, `NFR-045`, `architecture.md` Inference Gateway).
 *
 * `C-078` requires an audit event when a payload is refused, and the architecture makes the gateway
 * report the payload shape it sent. This package does not store audit rows — that is the audit
 * writer's job — so it hands both records to an injected port. Neither record carries a value the
 * resident wrote: paths, field names, a shape digest, an outcome and a correlation identifier only.
 *
 * @module gateway/audit
 */
import type { CapabilityName } from './contract.ts';

/** One audit record the gateway asks its caller to append. */
export type InferenceAuditEvent =
  | {
      readonly kind: 'payload_shape';
      readonly capability: CapabilityName;
      readonly correlationId: string;
      readonly modelVersion: string;
      /** `sha256:` and the digest of the assembled payload's fields and types. */
      readonly payloadShapeDigest: string;
      readonly removedFields: readonly string[];
      /** Envelope fields the caller supplied that the pinned configuration replaced (`C-078`). */
      readonly rewrittenFields: readonly string[];
    }
  | {
      readonly kind: 'policy_violation';
      readonly capability: CapabilityName;
      readonly correlationId: string;
      readonly cause: 'IDENTIFIER_PRESENT' | 'UNSAFE_PAYLOAD_VALUE';
      /** Payload paths, never the values at them. */
      readonly offendingFields: readonly string[];
      readonly removedFields: readonly string[];
      readonly payloadShapeDigest: string;
    };

/** The writer the composition root supplies. */
export interface InferenceAuditPort {
  record(event: InferenceAuditEvent): void | Promise<void>;
}
