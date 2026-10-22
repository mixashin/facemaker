import { describe, it, expect } from 'vitest';
import { ownPages } from './phone-pages.mjs';

// The tool reads a family phone. It must take the pages of the app and no other page, whatever their address holds.
describe('ownPages', () => {
  const page = (url, type = 'page') => ({ type, url, title: 'x', webSocketDebuggerUrl: 'ws://x' });
  it('takes the pages of the app', () => {
    expect(ownPages([page('https://face.lazarevic.me/'), page('https://face.lazarevic.me/?u=1790000000000')], 'face.lazarevic.me')).toHaveLength(2);
  });
  it('takes no other page that has the name of the app in its address', () => {
    const others = [
      'https://www.google.com/search?q=face.lazarevic.me+not+working',
      'https://mail.example/inbox?next=https%3A%2F%2Fface.lazarevic.me',
      'https://interface.lazarevic.me/',
      'https://face.lazarevic.me.example.com/',
      'https://example.com/face.lazarevic.me',
    ];
    expect(ownPages(others.map((u) => page(u)), 'face.lazarevic.me')).toEqual([]);
  });
  it('takes pages only: no worker, no frame of another page', () => {
    expect(ownPages([page('https://face.lazarevic.me/sw.js', 'service_worker'), page('https://face.lazarevic.me/', 'iframe')], 'face.lazarevic.me')).toEqual([]);
  });
  it('the dev build over USB: host with its port', () => {
    expect(ownPages([page('http://localhost:5173/'), page('http://localhost:8080/')], 'localhost:5173')).toHaveLength(1);
  });
  it('no host asked for: no page. A page with no host (a file, a blob, an empty tab) is never a page of the app', () => {
    const others = ['about:blank', 'data:text/html,x', 'file:///sdcard/Download/letter.pdf', 'blob:https://bank.example/1234'];
    for (const host of ['', undefined, null]) expect(ownPages(others.map((u) => page(u)), host)).toEqual([]);
  });
  it('an address that is no address is no page of the app', () => {
    expect(ownPages([page(''), page('about:blank'), { type: 'page' }], 'face.lazarevic.me')).toEqual([]);
  });
});
