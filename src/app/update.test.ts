import { describe, it, expect } from 'vitest';
import { forceUpdate, type UpdateEnv } from './update';

function env(online: boolean) {
  const log: string[] = [];
  const e: UpdateEnv = {
    reach: async () => { log.push('reach'); if (!online) throw new Error('no network'); return online; },
    workers: async () => [{ unregister: async () => { log.push('unregister'); return true; } }],
    cacheKeys: async () => ['workbox-precache-v2', 'ml-assets'],
    dropCache: async (k) => { log.push('drop ' + k); return true; },
    reload: () => log.push('reload'),
  };
  return { e, log };
}

describe('forceUpdate', () => {
  it('asks the network first, then drops the offline copy and loads the app again', async () => {
    const { e, log } = env(true);
    expect(await forceUpdate(e)).toBe('done');
    expect(log).toEqual(['reach', 'unregister', 'drop workbox-precache-v2', 'drop ml-assets', 'reload']);
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
  it('loads the app again when one step fails after the check', async () => {
    const { e, log } = env(true);
    e.dropCache = async (k) => { log.push('drop ' + k); throw new Error('quota'); };
    expect(await forceUpdate(e)).toBe('done');
    expect(log.at(-1)).toBe('reload');
  });
});
