type Clock = {
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (timer: unknown) => void;
};

// Keep individual increments precise; accelerate their frequency, not their size.
export function createPressRepeater(step: () => boolean, clock: Clock) {
  let timer: unknown;
  let active = false;
  let elapsed = 0;
  function stop() {
    active = false;
    if (timer !== undefined) clock.cancel(timer);
    timer = undefined;
  }
  function schedule(delay: number) {
    timer = clock.schedule(() => {
      if (!active) return;
      elapsed += delay;
      if (!step()) { stop(); return; }
      schedule(elapsed < 1200 ? 180 : elapsed < 2500 ? 100 : 55);
    }, delay);
  }
  return {
    stop,
    start() {
      stop();
      elapsed = 0;
      active = true;
      if (!step()) { stop(); return; }
      schedule(450);
    },
  };
}
