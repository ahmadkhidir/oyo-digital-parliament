/**
 * Release the capture gateway `globalSetup` started (`C-076`).
 *
 * Playwright runs this once after the last flow, whether the run passed or failed, so the loopback
 * port is free for the next run without killing a process somebody else started.
 */
import { getSmsGateway } from './support/gateway-state';

export default async function globalTeardown(): Promise<void> {
  await getSmsGateway()?.close();
}
