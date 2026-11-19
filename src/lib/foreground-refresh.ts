import { AppState, Platform } from 'react-native';
import { createRefreshQueue } from './refresh-queue';

export function isAppForeground() {
  return Platform.OS === 'web'
    ? typeof document === 'undefined' || document.visibilityState !== 'hidden'
    : AppState.currentState === 'active';
}

// All network polling pauses in the background and catches up on return.
export function foregroundRefresh(task: () => Promise<unknown> | void, interval: number, shouldPoll = () => true) {
  const queue = createRefreshQueue(task, isAppForeground);
  const timer = setInterval(() => { if (shouldPoll()) queue.request(); }, interval);
  const appState = AppState.addEventListener('change', state => { if (state === 'active') queue.request(); });
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', queue.request);
    window.addEventListener('online', queue.request);
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', queue.request);
  return { request: queue.request, stop() {
    queue.stop(); clearInterval(timer); appState.remove();
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', queue.request);
      window.removeEventListener('online', queue.request);
    }
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', queue.request);
  } };
}
