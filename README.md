# facemaker

Camera toy for kids. Face warps, stickers, voice effects, photos and videos to share. Runs fully on the device. No accounts, no servers, no tracking.

Live: https://face.mxa.sh

## Dev

    npm i
    npm run dev        # http://localhost:5173
    npm test

Phone loop: `adb reverse tcp:5173 tcp:5173`, then open http://localhost:5173 in Chrome on the phone.

Spec: docs/SPEC.md. Backlog: TODO.md. Research: research/.
