/**
 * SMS delivery as the notification boundary sees it (`C-076`).
 *
 * The port describes one delivery attempt, not a queue. The caller decides whether a second attempt
 * is safe, how long to wait, how many attempts are allowed and whether a message is held rather than
 * lost; the platform adapter only translates the gateway's answer. That split is what lets the
 * notification boundary retry with backoff without knowing which gateway is behind the seam, and it
 * is why a send never throws into the write that produced the notice.
 */
export interface SmsMessage {
  /**
   * The destination in E.164 form, supplied by the caller at call time from its own data.
   *
   * It is personal data: an adapter must not retain it, log it, put it in a cache key or include it in
   * an error message (`NFR-024`, `NFR-040`). The notification boundary resolves it from the member
   * record at the moment of the send; nothing else in the system holds it.
   */
  readonly destination: string;
  /** The rendered message body. Also never logged: it can quote a submission or a decision. */
  readonly body: string;
  /** The gateway's approved sender name, when the deployment configures one. */
  readonly senderId?: string;
  /** The caller's own reference for this message, echoed back where the provider supports it. */
  readonly reference?: string;
}

/**
 * The stable causes an adapter reports.
 *
 * These are the adapter's vocabulary, not the contract's: `C-076` turns a hold into
 * `SERVICE_DEGRADED` with `cause:"SMS_CHANNEL_UNAVAILABLE"`. Keeping the provider's raw payload out
 * of the result is deliberate — a gateway error can echo the destination number back.
 */
export type SmsDeliveryCause =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_REJECTED'
  | 'PROVIDER_AUTHENTICATION_FAILED'
  | 'PROVIDER_REQUEST_INVALID'
  | 'PROVIDER_ERROR_UNKNOWN';

/**
 * The three outcomes `C-076` distinguishes.
 *
 * `held` means the channel is unavailable and the message is retained for a later attempt; `failed`
 * means the gateway refused this message and retrying it unchanged will not help. An adapter never
 * reports `delivered` without a provider acceptance, because a fabricated success loses a one-time
 * code.
 */
export type SmsDeliveryOutcome = 'delivered' | 'held' | 'failed';

/** What one delivery attempt produced. */
export interface SmsDeliveryResult {
  readonly outcome: SmsDeliveryOutcome;
  /** The gateway's message reference, when it accepted the message. Never a telephone number. */
  readonly messageRef: string | null;
  /** Why the attempt was held or failed; `null` when it was delivered. */
  readonly cause: SmsDeliveryCause | null;
}

/** Delivers one SMS and reports what happened, without throwing into the caller's write. */
export interface SmsDeliveryPort {
  /**
   * Attempt delivery once.
   *
   * @param message - Destination and body, supplied by the caller for this attempt only.
   * @returns The outcome and its stable cause. A transport failure is reported as `held`, never as an
   *   empty success and never as an exception the caller has to guess about.
   */
  deliver(message: SmsMessage): Promise<SmsDeliveryResult>;
}
