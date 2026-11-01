export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type RequestHandler = (request: Request) => Promise<Response>;

export type ExchangeOutcome = "delivered" | "network-error" | "response-lost";

export interface NetworkExchange {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly outcome: ExchangeOutcome;
  readonly status: number | null;
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

function networkError(): TypeError {
  return new TypeError("Failed to fetch");
}

/**
 * An in-process transport that routes `fetch` calls to a Web Standard handler while letting
 * tests simulate going offline, failing requests, and losing responses after the server commits.
 */
export class TestNetwork {
  readonly #handler: RequestHandler;
  readonly #exchanges: NetworkExchange[] = [];
  #offline = false;
  #pendingFailures = 0;
  #pendingLostResponses = 0;

  constructor(handler: RequestHandler) {
    this.#handler = handler;
  }

  get exchanges(): ReadonlyArray<NetworkExchange> {
    return this.#exchanges;
  }

  get isOffline(): boolean {
    return this.#offline;
  }

  setOffline(offline: boolean): void {
    this.#offline = offline;
  }

  /** Fails the next requests before they reach the server. */
  failNextRequests(count = 1): void {
    this.#pendingFailures += count;
  }

  /** Lets the server process the next requests but drops their responses. */
  loseNextResponses(count = 1): void {
    this.#pendingLostResponses += count;
  }

  exchangesTo(pathSuffix: string): ReadonlyArray<NetworkExchange> {
    return this.#exchanges.filter((exchange) => exchange.path.endsWith(pathSuffix));
  }

  readonly fetch: FetchLike = async (input, init) => {
    const request = new Request(input, init);
    const body = await readBody(request);
    const base = {
      method: request.method,
      path: new URL(request.url).pathname,
      headers: Object.fromEntries(request.headers.entries()),
      body,
    };
    if (this.#offline || this.#pendingFailures > 0) {
      if (!this.#offline) this.#pendingFailures -= 1;
      this.#exchanges.push({ ...base, outcome: "network-error", status: null });
      throw networkError();
    }
    const response = await this.#handler(request);
    if (this.#pendingLostResponses > 0) {
      this.#pendingLostResponses -= 1;
      this.#exchanges.push({ ...base, outcome: "response-lost", status: response.status });
      throw networkError();
    }
    this.#exchanges.push({ ...base, outcome: "delivered", status: response.status });
    return response;
  };
}
