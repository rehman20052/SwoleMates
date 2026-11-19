// Collapse bursts without overlapping requests. An event during a request still
// causes one trailing read, so a committed change cannot be lost mid-refresh.
export function createRefreshQueue(task: () => Promise<unknown> | void, canRun = () => true, delay = 200) {
  let stopped = false, running = false, dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = () => {
    if (stopped || !canRun()) return;
    dirty = true;
    if (running || timer) return;
    timer = setTimeout(async () => {
      timer = undefined;
      if (stopped || !canRun()) return;
      dirty = false; running = true;
      try { await task(); } catch { /* Callers retain their last good data. */ }
      finally { running = false; if (dirty) request(); }
    }, delay);
  };
  return { request, stop() { stopped = true; dirty = false; if (timer) clearTimeout(timer); } };
}
