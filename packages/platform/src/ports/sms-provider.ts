/**
 * The SMS gateway seam (`C-076`).
 *
 * Narrower than the domain's delivery port on purpose: a vendor can accept a message, refuse it, or
 * fail to answer, and that is the whole vocabulary. The adapter above it decides whether an answer
 * means delivered, held or failed, and the notification boundary decides whether to retry. Keeping
 * the seam this small is what lets the gateway be replaced without touching a use case.
 *
 * @module ports/sms-provider
 */
export interface SmsProviderMessage {
  /** The destination in E.164 form. Personal data: never logged and never retained. */
  readonly to: string;
  /** The rendered body. Never logged. */
  readonly body: string;
  /** The sender name approved for this deployment. */
  readonly senderId: string;
  /** The caller's reference, where the gateway echoes one. */
  readonly reference?: string;
}

/** What the gateway said. */
export type SmsProviderOutcome = 'accepted' | 'rejected' | 'unavailable' | 'timeout';

/** The gateway's answer, stripped of its raw payload. */
export interface SmsProviderResponse {
  readonly outcome: SmsProviderOutcome;
  /** The gateway's message id, when it accepted the message. */
  readonly messageId: string | null;
  /** The HTTP status, when there was one; `null` for a transport failure. */
  readonly statusCode: number | null;
}

/** A gateway that can send one message. */
export interface SmsProvider {
  /**
   * Send one message.
   *
   * @returns What the gateway said. A transport failure is reported as `unavailable` or `timeout`;
   *   this method does not throw for a delivery problem, so the caller never loses a write to an
   *   exception it cannot classify.
   */
  send(message: SmsProviderMessage): Promise<SmsProviderResponse>;
}
