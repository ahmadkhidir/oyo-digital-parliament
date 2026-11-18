/**
 * A minimal HTTP seam, so every adapter that speaks HTTP can be tested offline.
 *
 * The vendor clients in `src/adapters/` receive this instead of calling the global `fetch` directly.
 * A test supplies a scripted transport and asserts the request the adapter built — including the
 * headers — without a socket, and no test can accidentally reach a gateway (`packages/platform`
 * Definition of Done: adapter tests run offline).
 *
 * @module ports/http
 */
export type HttpMethod = 'GET' | 'HEAD' | 'PUT' | 'POST' | 'DELETE';

/** One outbound request. */
export interface HttpRequest {
  readonly method: HttpMethod;
  readonly url: string;
  /** Headers the caller sets. The transport adds nothing and reorders nothing. */
  readonly headers?: Readonly<Record<string, string>>;
  /** The request body, already encoded. Absent on a bodyless method. */
  readonly body?: Uint8Array;
  /** How long the whole exchange may take before it is reported as a timeout. */
  readonly timeoutMs: number;
}

/** One response, with the body read in full. */
export interface HttpResponse {
  readonly status: number;
  /** Lower-cased header names. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

/** The request did not complete inside its timeout. */
export class HttpTimeoutError extends Error {
  constructor() {
    super('the request timed out');
    this.name = 'HttpTimeoutError';
  }
}

/** The request never reached a server, or the connection failed mid-response. */
export class HttpTransportError extends Error {
  constructor() {
    super('the request could not be completed');
    this.name = 'HttpTransportError';
  }
}

/** Sends one request and returns the full response. */
export interface HttpClient {
  /**
   * @throws HttpTimeoutError on timeout and HttpTransportError on a transport failure. A non-2xx
   *   response is a response, not an error: the adapter decides what the status means.
   */
  send(request: HttpRequest): Promise<HttpResponse>;
}
