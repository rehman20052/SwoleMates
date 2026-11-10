export const ACCOUNT_REQUEST_TIMEOUT = 8000;

export function withDeadline<T>(operation: PromiseLike<T>, ms = ACCOUNT_REQUEST_TIMEOUT): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Account connection timed out. Check your connection and retry; saved device data is preserved.")), ms);
    Promise.resolve(operation).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

export function deadlineFetch(fetcher: typeof fetch = fetch, ms = ACCOUNT_REQUEST_TIMEOUT): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const signal = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
    const cancel = () => controller.abort(signal?.reason);
    if (signal?.aborted) cancel(); else signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => controller.abort(new Error("Account request timed out. Your local changes are preserved.")), ms);
    try { return await fetcher(input, { ...init, signal: controller.signal }); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
  };
}
