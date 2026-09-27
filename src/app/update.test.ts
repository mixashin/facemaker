import { describe, it, expect } from 'vitest';
import { forceUpdate, browserEnv, type UpdateEnv } from './update';
import { FELL_KEY, PREFER_KEY } from '../tracking/health';

function env(online: boolean) {
  const log: string[] = [];
  const e: UpdateEnv = {
    reach: async () => { log.push('reach'); if (!online) throw new Error('no network'); return online; },
    workers: async () => [{ unregister: async () => { log.push('unregister'); return true; } }],
    cacheKeys: async () => ['workbox-precache-v2', 'ml-assets'],
    dropCache: async (k) => { log.push('drop ' + k); return true; },
    forget: () => log.push('forget'),
    reload: () => log.push('reload'),
  };
  return { e, log };
}

describe('forceUpdate', () => {
  it('asks the network first, then drops the offline copy and loads the app again', async () => {
    const { e, log } = env(true);
    expect(await forceUpdate(e)).toBe('done');
    expect(log).toEqual(['reach', 'unregister', 'drop workbox-precache-v2', 'drop ml-assets', 'forget', 'reload']);
  });
  it('touches nothing with no network: the app must still start offline', async () => {
    const { e, log } = env(false);
    expect(await forceUpdate(e)).toBe('offline');
    expect(log).toEqual(['reach']);
  });
  it('a server that answers with an error counts as no network', async () => {
    const { e, log } = env(true);
    e.reach = async () => false;
    expect(await forceUpdate(e)).toBe('offline');
    expect(log).toEqual([]);
  });
  it('the new version gets a try on the GPU: the mark of a GPU that failed goes, also when a step before failed', async () => {
    const { e, log } = env(true);
    e.dropCache = async () => { throw new Error('quota'); };
    await forceUpdate(e);
    expect(log.slice(-2)).toEqual(['forget', 'reload']);
  });
  it('a device store that fails does not stop the update', async () => {
    const { e, log } = env(true);
    e.forget = () => { throw new Error('no storage'); };
    expect(await forceUpdate(e)).toBe('done');
    expect(log.at(-1)).toBe('reload');
  });
  it('loads the app again when one step fails after the check', async () => {
    const { e, log } = env(true);
    e.dropCache = async (k) => { log.push('drop ' + k); throw new Error('quota'); };
    expect(await forceUpdate(e)).toBe('done');
    expect(log.at(-1)).toBe('reload');
  });
});

describe('browserEnv', () => {
  it('forgets the mark of a failed GPU and nothing else: a tracker that somebody forced stays forced', () => {
    const kept = new Map<string, string>([[FELL_KEY, '1790000000000 agent'], [PREFER_KEY, 'CPU'], ['fm.tutorialSeen', '1']]);
    (globalThis as { localStorage?: unknown }).localStorage = { removeItem: (k: string) => kept.delete(k) };
    try {
      browserEnv().forget();
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
    expect([...kept.keys()].sort()).toEqual(['fm.tracker', 'fm.tutorialSeen']);
  });
});
