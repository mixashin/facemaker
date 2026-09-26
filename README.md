# facemaker

Camera toy for kids. Face warps, stickers, voice effects, photos and videos to share. Runs fully on the device. No accounts, no servers, no tracking.

Live: https://face.mxa.sh

## Dev

    npm i
    npm run dev        # http://localhost:5173
    npm test

Phone loop: `adb reverse tcp:5173 tcp:5173`, then open http://localhost:5173 in Chrome on the phone.

Spec: docs/SPEC.md. Backlog: TODO.md. Research: research/.

## Verify privacy (do this after every dependency change)

1. `npm run build && npm run preview`
2. Chrome DevTools, Network, clear, use the app 2 minutes with a photo.
3. Every row must be `localhost`. A console line `blocked egress https://odml.pa.googleapis.com/v1/log` is the MediaPipe telemetry hitting the worker's fence. Any third-party row is a bug.
4. Airplane mode on the phone, reload: the app must still work.

Headless version of steps 1 to 3: `SMOKE_WAIT_MS=70000 node scripts/smoke.mjs http://localhost:4173` prints `third-party requests: none` and the blocked line.

Two fences, because GitHub Pages cannot set response headers: the production `index.html` carries a meta CSP with `connect-src 'self'` for the document, and `src/tracking/face.worker.ts` wraps `fetch` and `XMLHttpRequest` with a same-origin check for the worker (a meta CSP does not reach a same-origin worker script).

After changing `dependencies`: `node scripts/attributions.mjs` (the About screen list; a test fails when stale).

Screenshots from the headless smoke (needs a face image, see `FACE`): `SMOKE_OUT=<dir> SMOKE_SHOTS="sticker,cat;warp,upsideDown" SMOKE_PAGE="settings,about" SMOKE_TEXT="Čćžšđ 🐱" SMOKE_GALLERY=1 FACE=test/face.jpg SMOKE_WAIT_MS=20000 node scripts/smoke.mjs http://localhost:4173`
