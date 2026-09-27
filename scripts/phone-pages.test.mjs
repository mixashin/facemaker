import { describe, it, expect } from 'vitest';
import { ownPages, ownAddress, staleForwards, liveEntries } from './phone-pages.mjs';

// The tool reads a family phone. It must take the pages of the app and no other page, whatever their address holds.
describe('ownPages', () => {
  const page = (url, type = 'page') => ({ type, url, title: 'x', webSocketDebuggerUrl: 'ws://x' });
  it('takes the pages of the app', () => {
    expect(ownPages([page('https://face.mxa.sh/'), page('https://face.mxa.sh/?u=1790000000000')], 'face.mxa.sh')).toHaveLength(2);
  });
  it('takes no other page that has the name of the app in its address', () => {
    const others = [
      'https://www.google.com/search?q=face.mxa.sh+not+working',
      'https://mail.example/inbox?next=https%3A%2F%2Fface.mxa.sh',
      'https://interface.mxa.sh/',
      'https://face.mxa.sh.example.com/',
      'https://example.com/face.mxa.sh',
    ];
    expect(ownPages(others.map((u) => page(u)), 'face.mxa.sh')).toEqual([]);
  });
  it('takes pages only: no worker, no frame of another page', () => {
    expect(ownPages([page('https://face.mxa.sh/sw.js', 'service_worker'), page('https://face.mxa.sh/', 'iframe')], 'face.mxa.sh')).toEqual([]);
  });
  it('the dev build over USB: host with its port', () => {
    expect(ownPages([page('http://localhost:5173/'), page('http://localhost:8080/')], 'localhost:5173')).toHaveLength(1);
  });
  it('no host asked for: no page. A page with no host (a file, a blob, an empty tab) is never a page of the app', () => {
    const others = ['about:blank', 'data:text/html,x', 'file:///sdcard/Download/letter.pdf', 'blob:https://bank.example/1234'];
    for (const host of ['', undefined, null]) expect(ownPages(others.map((u) => page(u)), host)).toEqual([]);
  });
  it('takes the app over a safe link only, and the dev build of this computer', () => {
    const others = ['http://face.mxa.sh/', 'content://face.mxa.sh/x', 'ftp://face.mxa.sh/', 'chrome://face.mxa.sh/', 'view-source:https://face.mxa.sh/'];
    expect(ownPages(others.map((u) => page(u)), 'face.mxa.sh')).toEqual([]);
    expect(ownPages([page('https://localhost:5173/'), page('http://127.0.0.1:5173/')], 'localhost:5173')).toHaveLength(1);
    expect(ownPages([page('http://127.0.0.1:4173/')], '127.0.0.1:4173')).toHaveLength(1);
    expect(ownPages([page('http://192.168.1.20:5173/')], '192.168.1.20:5173')).toEqual([]); // plain http from another computer
  });
  it('an address that is no address is no page of the app', () => {
    expect(ownPages([page(''), page('about:blank'), { type: 'page' }], 'face.mxa.sh')).toEqual([]);
  });
});

describe('ownAddress (the same rule, for the page that the tool reads)', () => {
  it('says yes to the app and no to every other address', () => {
    expect(ownAddress('https:', 'face.mxa.sh', 'face.mxa.sh', 'face.mxa.sh')).toBe(true);
    expect(ownAddress('http:', 'localhost:5173', 'localhost', 'localhost:5173')).toBe(true);
    expect(ownAddress('http:', 'face.mxa.sh', 'face.mxa.sh', 'face.mxa.sh')).toBe(false);
    expect(ownAddress('https:', 'example.com', 'example.com', 'face.mxa.sh')).toBe(false);
    expect(ownAddress('https:', '', '', '')).toBe(false);
  });
});

// A tool that was killed leaves its port forward in adb. The next run removes it: while it is there, every
// program on the computer can reach the browser of the phone.
describe('staleForwards', () => {
  const list = [
    'R5CX123 tcp:51001 localabstract:chrome_devtools_remote',
    'R5CX123 tcp:51002 localabstract:chrome_devtools_remote',
    'R5CX123 tcp:9222 localabstract:chrome_devtools_remote',
    'R5CX123 tcp:51003 tcp:8080',
  ].join('\r\n');
  const gone = () => false, runs = (pid) => pid === 4242;
  const by = (port, pid = 1000) => ({ port, pid });
  it('gives the forwards that the tool made and that are still there', () => {
    expect(staleForwards(list, [by(51001), by(51002), by(60000)], gone)).toEqual([51001, 51002]);
  });
  it('leaves the forward of a run of the tool that still works', () => {
    expect(staleForwards(list, [by(51001, 4242), by(51002, 1000)], runs)).toEqual([51002]);
  });
  it('leaves the forwards of other tools, and a port of the tool that leads somewhere else now', () => {
    expect(staleForwards(list, [], gone)).toEqual([]);
    expect(staleForwards(list, [by(51003)], gone)).toEqual([]);
    expect(staleForwards(list, [by(9222)], gone)).toEqual([9222]); // only when the record of the tool holds it
  });
  it('takes a record that is no list as an empty record, and leaves out what is no entry', () => {
    for (const bad of [null, undefined, 'x', { a: 1 }, [51001, '51001', { port: 1.5, pid: 1 }, { port: -3, pid: 1 }, { port: 70000, pid: 1 }, { port: 51001 }, { port: 51001, pid: 'x' }, null]]) expect(staleForwards(list, bad, gone)).toEqual([]);
    expect(staleForwards('', [by(51001)], gone)).toEqual([]);
  });
  it('keeps the entries of the runs that work, for the new record', () => {
    expect(liveEntries([by(51001, 4242), by(51002, 1000), 'x', { port: 1 }], runs)).toEqual([by(51001, 4242)]);
    expect(liveEntries(null, runs)).toEqual([]);
  });
});
