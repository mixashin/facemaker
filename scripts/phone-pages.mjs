// Which pages of the browser of a phone belong to the app. For scripts/phone-inspect.mjs.
// The host of the address must be the host of the app. A search for the name in the address is not enough: a web
// search for the app, a mail link to it, and a site with a longer name all have the name in their address, and the
// tool would read a page of the owner of the phone.
// host: with the port when the address has one (localhost:5173)
export function ownPages(targets, host) {
  return targets.filter((t) => {
    if (t.type !== 'page') return false;
    try { return new URL(t.url).host === host; } catch { return false; }
  });
}
