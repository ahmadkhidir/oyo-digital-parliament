/**
 * The SMS delivery double (`C-076`).
 *
 * It answers from a script: a test queues the outcomes a gateway would give, and the double records
 * what it was asked to send so an assertion can prove that a held message was retained rather than
 * reported delivered. It never reaches a network and never sends a real message.
 *
 * The recorded destination and body stay in memory for the duration of the test only; they are never
 * written to a fixture, a log or a snapshot.
 *
 * @module testing/fake-sms
 */
import type {
  SmsDeliveryPort,
  SmsDeliveryResult,
  SmsMessage,
} from '../../../domain/src/ports/notifications.ts';

/** One scripted answer. */
export type ScriptedSmsResult = SmsDeliveryResult;

/** A delivery double a test can script. */
export interface FakeSms extends SmsDeliveryPort {
  /** What the code under test asked to send, in order. */
  readonly sent: readonly SmsMessage[];
  /** Queue the next answers. An empty script falls back to the default outcome. */
  queue(...results: readonly ScriptedSmsResult[]): void;
  /** Forget the recorded messages and the script. */
  reset(): void;
}

/**
 * Create the double.
 *
 * @param defaultResult - The answer when the script is empty. Defaults to a delivery with a
 *   deterministic message reference, which is what a healthy gateway would return.
 */
export function createFakeSms(
  defaultResult: ScriptedSmsResult = { outcome: 'delivered', messageRef: 'fake-1', cause: null },
): FakeSms {
  let script: ScriptedSmsResult[] = [];
  const sent: SmsMessage[] = [];

  const fake: FakeSms = {
    get sent() {
      return sent;
    },
    queue(...results) {
      script = [...script, ...results];
    },
    reset() {
      script = [];
      sent.length = 0;
    },
    async deliver(message: SmsMessage): Promise<SmsDeliveryResult> {
      sent.push(message);
      return script.shift() ?? defaultResult;
    },
  };

  return fake;
}
