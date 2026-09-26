# facemaker

Camera toy PWA for kids (ages 6 to 12). Face warps, stickers, voice effects, photo and video share. Local-only: zero third-party requests at runtime.

## Read first

1. `docs/SPEC.md`: agreed feature spec, 7 milestones, hard constraints, M1 acceptance.
2. `docs/superpowers/plans/2026-09-26-m1-warp-snapshot-share.md`: M1 implementation plan, 11 tasks with code. Execute with `superpowers:executing-plans`.
3. `TODO.md`: backlog and every decision from grill-me. Add operator requests here as they arrive.
4. `research/01-tech-stack-2026-09-26.md`, `02-filters-2026-09-26.md`, `03-mediapipe-telemetry-audit-2026-09-26.md`: verified research with sources.

## State (2026-09-26)

M1 implemented on branch `m1` (Tasks 1 to 11), headless-verified with `scripts/smoke.mjs`. Owed to the operator: phone acceptance (SPEC section 7) on https://face.mxa.sh. Next: M2 plan (stickers, text, gallery, themes, i18n).

## Decisions (do not re-ask)

- Stack: Vite 8 + Preact + TypeScript, Three.js, `@mediapipe/tasks-vision` 1.0.1, vite-plugin-pwa, Vitest.
- MediaPipe telemetry: two fences. Meta CSP `connect-src 'self'` in the production index.html covers the document. The face worker wraps `fetch` and `XMLHttpRequest` with a same-origin check, because a meta CSP does not reach a same-origin worker script and Pages cannot set headers. Verified 2026-09-26 headless: the worker's POST to odml.pa.googleapis.com is rejected before any request. Re-run `scripts/smoke.mjs` (README recipe) after every dependency change. See research/03.
- Hosting: public repo `github.com/mixashin/facemaker`, GitHub Pages, custom domain `face.mxa.sh`, base `/`. DNS via Njal.la API (see `~/.claude/context/domains.md`).
- Branch flow: `main` is live. Feature branches, merge when it works on the phone.
- Faces: up to 2, own One Euro smoothing.
- Language: Serbian + English, icon-first, JSON string tables. Serbian Latin script assumed, confirm with operator.
- Voice (M3): `@soundtouchjs/*` scoped packages (MPL-2.0), audit before install. Unscoped `soundtouchjs` is LGPL, never use it.
- Gallery (M2): OPFS files + IndexedDB metadata.
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
