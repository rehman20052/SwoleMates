export const ACCOUNT_REQUEST_TIMEOUT = 8000;
export const ACCOUNT_WRITE_TIMEOUT = 15000;
export const MEDIA_UPLOAD_TIMEOUT = 120000;

export class RequestTimeoutError extends Error {
  readonly code = "REQUEST_TIMEOUT";
  constructor() { super("The request timed out. Your edits have been kept; try again."); this.name = "RequestTimeoutError"; }
}

export function requestTimeout(input: string, method = "GET") {
  if (method === "GET" || method === "HEAD") return ACCOUNT_REQUEST_TIMEOUT;
  if (/\/storage\/v1\/object(?:\/|$)/.test(input) && ["POST", "PUT", "PATCH"].includes(method)) return MEDIA_UPLOAD_TIMEOUT;
  if (/\/auth\/v1\/(?!user(?:\?|$))/.test(input) || /\/rpc\/(?:my_|get_|list_|read_|blocked_|account_read_)/.test(input)) return ACCOUNT_REQUEST_TIMEOUT;
  return ACCOUNT_WRITE_TIMEOUT;
}

export function withDeadline<T>(operation: PromiseLike<T>, ms = ACCOUNT_REQUEST_TIMEOUT): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new RequestTimeoutError()), ms);
    Promise.resolve(operation).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

export function deadlineFetch(fetcher: typeof fetch = fetch, ms?: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const signal = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
    const cancel = () => controller.abort(signal?.reason);
    if (signal?.aborted) cancel(); else signal?.addEventListener("abort", cancel, { once: true });
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
    const timer = setTimeout(() => controller.abort(new RequestTimeoutError()), ms ?? requestTimeout(url, method));
    try { return await fetcher(input, { ...init, signal: controller.signal }); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
  };
}
