/**
 * The production HTTP transport (`packages/platform` Discipline: vendor calls stay behind a seam).
 *
 * The only adapter file that touches the network, and the only place the global `fetch` is named. A
 * timeout becomes {@link HttpTimeoutError} and a connection failure becomes
 * {@link HttpTransportError}, so a vendor client can map the two to a stable cause without reading a
 * provider's error text. A non-2xx status is returned as a response, because only the client above
 * knows what a `429` means for its provider.
 *
 * @module adapters/http/fetch-client
 */
import {
  HttpTimeoutError,
  HttpTransportError,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
} from '../../ports/http.ts';

/** The subset of `fetch` this client uses, so a test can supply its own. */
export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: Uint8Array;
    signal: AbortSignal;
  },
) => Promise<{
  status: number;
  headers: { forEach(callback: (value: string, key: string) => void): void };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/**
 * Create the HTTP transport.
 *
 * @param fetchImpl - The fetch implementation. Defaults to the runtime's global `fetch`, narrowed
 *   here because the adapter's {@link FetchLike} states the subset it uses; the DOM and undici
 *   global declarations disagree about the `init` payload's body union, and the adapter consumes
 *   what it names and nothing else.
 */
export function createFetchHttpClient(fetchImpl: FetchLike = fetch as FetchLike): HttpClient {
  return {
    async send(request: HttpRequest): Promise<HttpResponse> {
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers ?? {})) {
        headers[name] = value;
      }

      const init: {
        method: string;
        headers: Record<string, string>;
        body?: Uint8Array;
        signal: AbortSignal;
      } = {
        method: request.method,
        headers,
        signal: AbortSignal.timeout(request.timeoutMs),
      };
      if (request.body !== undefined) init.body = request.body;

      let response: Awaited<ReturnType<FetchLike>>;
      try {
        response = await fetchImpl(request.url, init);
      } catch (error) {
        if (isAbort(error)) throw new HttpTimeoutError();
        throw new HttpTransportError();
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });

      return {
        status: response.status,
        headers: responseHeaders,
        body: new Uint8Array(await response.arrayBuffer()),
      };
    },
  };
}

/** Whether a fetch rejection was the timeout signal rather than a connection failure. */
function isAbort(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === 'TimeoutError' || name === 'AbortError';
}
