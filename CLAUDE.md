# facemaker

Camera toy PWA for kids (ages 6 to 12). Face warps, stickers, voice effects, photo and video share. Local-only: zero third-party requests at runtime.

## Read first

1. `docs/SPEC.md`: agreed feature spec, 7 milestones, hard constraints, M1 acceptance.
2. `docs/superpowers/plans/2026-09-26-m1-warp-snapshot-share.md`: M1 implementation plan, 11 tasks with code. Execute with `superpowers:executing-plans`.
3. `TODO.md`: backlog and every decision from grill-me. Add operator requests here as they arrive.
4. `research/01-tech-stack-2026-09-26.md`, `02-filters-2026-09-26.md`, `03-mediapipe-telemetry-audit-2026-09-26.md`: verified research with sources.

## State (2026-09-26)

M2b (gallery, photo editor, face lab) merged, tag `m2b`, live. Next: M3 plan (video + voice), see docs/SPEC.md M3 and TODO.md. M2a merged, tag `m2a`. M1 merged to main, tag `m1`, live at https://face.mxa.sh (HTTPS enforced). Verified headless with `scripts/smoke.mjs`; with `FACE=test/face.jpg` (operator selfie, gitignored) it tracks a real face and checks warp placement. Phone acceptance passed 2026-09-26 (operator: every filter and share work). M2 split: M2a look (stickers, text, themes, i18n, About + privacy, tutorial, new warp presets), then M2b tools (gallery, parametric sliders, post-capture sticker editor).

## Decisions (do not re-ask)

- Stack: Vite 8 + Preact + TypeScript, Three.js, `@mediapipe/tasks-vision` 1.0.1, vite-plugin-pwa, Vitest.
- MediaPipe telemetry: two fences. Meta CSP `connect-src 'self'` in the production index.html covers the document. The face worker wraps `fetch` and `XMLHttpRequest` with a same-origin check, because a meta CSP does not reach a same-origin worker script and Pages cannot set headers. Verified 2026-09-26 headless: the worker's POST to odml.pa.googleapis.com is rejected before any request. Re-run `scripts/smoke.mjs` (README recipe) after every dependency change. See research/03.
- Hosting: public repo `github.com/mixashin/facemaker`, GitHub Pages, custom domain `face.mxa.sh`, base `/`. DNS via Njal.la API (see `~/.claude/context/domains.md`).
- Branch flow: `main` is live. Feature branches, merge when it works on the phone.
- Faces: up to 2, own One Euro smoothing.
- Language: Serbian + English, icon-first, JSON string tables. Serbian Latin script assumed, confirm with operator.
- Voice (M3): `@soundtouchjs/*` scoped packages (MPL-2.0), audit before install. Unscoped `soundtouchjs` is LGPL, never use it.
- Effects dock (2026-09-26 operator): all effects live in a left slide-in dock with a ✨ pull tab (rail: faces, stickers, text, face lab). No bottom tabs or strips. Tap on the video closes it. Preset warps and face-lab sliders are mutually exclusive. The app starts with no effect. Saved photos are cropped to the visible cover region of the stage (`coverCrop`), so they match the screen.
- Capture flow (2026-09-26 operator): the shutter saves to the gallery with a fly-to-gallery animation, no share sheet; share and save live in the viewer; the share sheet is only the fallback when saving to the device fails. Camera screen holds only gear, tabs, strip, flip, shutter, gallery.
- Gallery: OPFS only (`photos/`, `thumbs/`), metadata in file names, no IndexedDB. Destructive actions need two taps.
- Recording (M3): mp4 first, webm fallback, `start()` in try/catch.
- Licenses allowed: MIT, Apache-2.0, BSD, MPL-2.0, Unlicense, CC0, CC-BY. No GPL.

## Conventions

- Commit messages: plain conventional commits. No `Co-Authored-By` trailer, no "Generated with" line. Operator instruction.
- Subagents: pass `model: "fable"` on every `Agent` call. Operator instruction.
- Phone dev loop: `adb reverse tcp:5173 tcp:5173`, then `http://localhost:5173` in Chrome on the phone. `localhost` is a secure context, no HTTPS needed.
- Windows 11 host, Git Bash for scripts. Node 24, npm 11, gh logged in as mixashin, adb and ffmpeg on PATH.
- Kid UI: icons, 64 px tap targets, no reading required. Advanced panel behind a gear.
- Deferred, do not propose: cloud AI photo edits, iOS, accounts.

## Commands

    npm i            # postinstall copies mediapipe wasm to public/mediapipe/wasm
    npm run dev      # vite --host, http://localhost:5173
    npm test         # vitest
    npm run build && npm run preview   # http://localhost:4173, production CSP active
    FACE=test/face.jpg SMOKE_WAIT_MS=20000 node scripts/smoke.mjs [url]   # headless check, needs dev or preview server; SMOKE_OUT/SMOKE_SHOTS/SMOKE_PAGE/SMOKE_TEXT save screenshots
    node scripts/attributions.mjs   # after dependency changes (About screen list)
