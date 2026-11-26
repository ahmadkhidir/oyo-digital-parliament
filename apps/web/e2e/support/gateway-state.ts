/**
 * The capture gateway's lifetime across Playwright's setup and teardown hooks (`C-076`).
 *
 * `globalSetup` and `globalTeardown` are separate modules, and Playwright does not hand the former's
 * return value to the latter. The gateway therefore lives on `globalThis` under a registered
 * symbol: one process runs both hooks, and a symbol cannot collide with a name another library uses.
 */
import type { SmsGateway } from './sms-gateway';

/** The key the running gateway is filed under; `Symbol.for` makes it visible to both hooks. */
const GATEWAY_KEY = Symbol.for('odp.e2e.smsGateway');

/** Where `globalThis` is read and written through the symbol. */
type GatewayRegistry = Record<symbol, SmsGateway | undefined>;

/**
 * File the running gateway for `globalTeardown`.
 *
 * @param gateway - The capture gateway `globalSetup` started.
 */
export function setSmsGateway(gateway: SmsGateway): void {
  (globalThis as unknown as GatewayRegistry)[GATEWAY_KEY] = gateway;
}

/**
 * The gateway `globalSetup` started, when there is one.
 *
 * @returns The running gateway, or `undefined` outside a setup/teardown pair.
 */
export function getSmsGateway(): SmsGateway | undefined {
  return (globalThis as unknown as GatewayRegistry)[GATEWAY_KEY];
}
