// Which pages of the browser of a phone belong to the app. For scripts/phone-inspect.mjs.
// The host of the address must be the host of the app. A search for the name in the address is not enough: a web
// search for the app, a mail link to it, and a site with a longer name all have the name in their address, and the
// tool would read a page of the owner of the phone.
// The scheme counts too: the app runs over https, and over plain http on this computer only (the dev build
// over USB). Another scheme with the host of the app (content:, plain http from the network) is not the app.
// host: with the port when the address has one (localhost:5173)
export function ownAddress(protocol, host, hostname, want) {
  if (!want || host !== want) return false; // an address with no host (a file, a blob, an empty tab) has the host ""
  return protocol === 'https:' || (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1'));
}

export function ownPages(targets, host) {
  return targets.filter((t) => {
    if (t.type !== 'page') return false;
    try { const u = new URL(t.url); return ownAddress(u.protocol, u.host, u.hostname, host); } catch { return false; }
  });
}

// Port forwards that an earlier run of the tool made and did not remove (the tool was killed).
// list: the text of `adb forward --list`. record: the ports that the tool wrote down. A forward of another tool
// is not in the record, and a port of the record that leads somewhere else now belongs to somebody else.
export function staleForwards(list, record) {
  const ports = Array.isArray(record) ? record.filter((p) => Number.isInteger(p) && p > 0 && p < 65536) : [];
  const open = new Set(String(list ?? '').split(/\r?\n/).map((l) => /\stcp:(\d+)\s+localabstract:chrome_devtools_remote\s*$/.exec(l)?.[1]).filter(Boolean).map(Number));
  return ports.filter((p) => open.has(p));
}
