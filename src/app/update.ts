// The button "get the newest version" in the settings (operator, 2026-09-27). The app updates by itself at the
// second start after a release. The button does it now: it drops the offline copy of the app (service worker and
// caches, the ML files too) and loads the app again from the network. Photos and videos are not in these caches.
import { FELL_KEY } from '../tracking/health';

export type UpdateEnv = {
  reach: () => Promise<boolean>; // true when the server of the app answers
  workers: () => Promise<{ unregister(): Promise<boolean> }[]>;
  cacheKeys: () => Promise<string[]>;
  dropCache: (key: string) => Promise<boolean>;
  forget: () => void; // what the device keeps about the old version and the new one must find out again
  reload: () => void;
};

export async function forceUpdate(env: UpdateEnv): Promise<'done' | 'offline'> {
  if (!(await env.reach().catch(() => false))) return 'offline';
  try {
    for (const w of await env.workers()) await w.unregister();
    for (const k of await env.cacheKeys()) await env.dropCache(k);
  } catch (e) {
    console.warn('update', e); // the new load repairs a half step: the service worker builds its caches again
  }
  try { env.forget(); } catch { /* storage unavailable */ }
  env.reload();
  return 'done';
}

export const REACH_LIMIT_MS = 8000;
export const reachAddress = (nowMs: number) => `/index.html?u=${nowMs}`;

export const browserEnv = (): UpdateEnv => ({
  // The service worker answers /index.html from its cache, with no network too. An address with a word that the
  // cache does not know goes to the network. The time limit: a network that hangs must not run the update later,
  // at a moment that nobody chose.
  reach: () => fetch(reachAddress(Date.now()), { cache: 'no-store', signal: AbortSignal.timeout(REACH_LIMIT_MS) }).then((r) => r.ok),
  workers: async () => [...((await navigator.serviceWorker?.getRegistrations()) ?? [])],
  cacheKeys: () => caches.keys(),
  dropCache: (k) => caches.delete(k),
  // The mark of a GPU that failed (src/tracking/health.ts): a release that repairs the GPU path reaches a marked
  // device at once, not after the days of the mark. A tracker that somebody forced stays forced.
  forget: () => localStorage.removeItem(FELL_KEY),
  reload: () => location.replace('/?u=' + Date.now()), // a new address: the page does not come from the HTTP cache
});
