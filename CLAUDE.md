# facemaker

Camera toy PWA for kids (ages 6 to 12). Face warps, stickers, voice effects, photo and video share. Local-only: zero third-party requests at runtime.

## Read first

1. `docs/SPEC.md`: agreed feature spec, 7 milestones, hard constraints, M1 acceptance.
2. `docs/superpowers/plans/2026-09-26-m1-warp-snapshot-share.md`: M1 implementation plan, 11 tasks with code. Execute with `superpowers:executing-plans`.
3. `TODO.md`: backlog and every decision from grill-me. Add operator requests here as they arrive.
4. `research/01-tech-stack-2026-09-26.md`, `02-filters-2026-09-26.md`, `03-mediapipe-telemetry-audit-2026-09-26.md`, `04-sticker-art-alternatives-2026-09-26.md`, `06-asset-sources-2026-09-27.md` (Etsy and paid packs fail: no free redistribution; use Kenney CC0, FreeSVG, Quaternius, Piranesi set in `docs/piranesi-props.json`): verified research with sources.

## State (2026-09-27, night)

Live at https://face.mxa.sh (main = live, tags m1, m2a, m2b, m3).

Shipped and live: M1 warps + snapshot + share; M2a stickers, text, themes, sr/en, About + privacy, tutorial, more warps; M2b gallery (OPFS), photo editor, face lab; UI iterations; Fluent Emoji Color packs (PR #11); M3 video + voice (PR #12, #13); several face filters at once (PR #14), several sticker packs at once (PR #15), stickers follow the warp (PR #16).

In progress: M4, as three pull requests (grill 2026-09-27). M4a makeup is built and reviewed on branch `m4a-makeup` (PR #17, plan: `docs/superpowers/plans/2026-09-27-m4a-makeup.md`). It waits for the operator's phone check, then merge. M4b face on a picture is built on branch `m4b-face-on`, stacked on `m4a-makeup` (plan: `docs/superpowers/plans/2026-09-27-m4b-face-on-picture.md`). It waits for its phone check too. M4b is PR #18 (base `m4a-makeup`). M4c backgrounds: the core is built on branch `m4c-backgrounds`, stacked on `m4b-face-on`, not pushed (plan: `docs/superpowers/plans/2026-09-27-m4c-backgrounds.md`). It has no scene yet: the places tab stays hidden until the art of request R2 arrives and `SCENES` in `src/filters/scenes.ts` is filled.

Headless verification: `scripts/smoke.mjs` with the operator selfie (test/face.jpg, gitignored), every verdict OK on the branch.

Next session: read `TODO.md` from "M4 decisions" to the end. Check `astra/out` for new deliveries (`DELIVERY.md` per request).

## Decisions (do not re-ask)

- Stack: Vite 8 + Preact + TypeScript, Three.js, `@mediapipe/tasks-vision` 1.0.1, vite-plugin-pwa, Vitest.
- MediaPipe telemetry: two fences. Meta CSP `connect-src 'self'` in the production index.html covers the document. The face worker wraps `fetch` and `XMLHttpRequest` with a same-origin check, because a meta CSP does not reach a same-origin worker script and Pages cannot set headers. Verified 2026-09-26 headless: the worker's POST to odml.pa.googleapis.com is rejected before any request. Re-run `scripts/smoke.mjs` (README recipe) after every dependency change. See research/03.
- Hosting: public repo `github.com/mixashin/facemaker`, GitHub Pages, custom domain `face.mxa.sh`, base `/`. DNS via Njal.la API (see `~/.claude/context/domains.md`).
- Branch flow: `main` is live. Feature branches, merge when it works on the phone.
- Faces: up to 2, own One Euro smoothing.
- Language: Serbian + English, icon-first, JSON string tables. Serbian Latin script assumed, confirm with operator.
- Voice (M3, decided 2026-09-27 after research/05): pitch shift with native Web Audio nodes only (Tone.js PitchShift delay-line method, MIT, reimplemented), no AudioWorklet, no audio dependency. Other effects are native node graphs. Upgrade path only if the phone test disappoints: `@soundtouchjs/*` (MPL-2.0, maintained, full audit first, read the monorepo LICENSE) or Signalsmith Stretch (MIT). Unscoped `soundtouchjs` is LGPL, never use it. Mic permission at first need, voice mirror (record then play), one `shout` warp preset driven by mic volume, no live monitoring. Mic lifecycle: users take a lease from `src/audio/session.ts` (`acquireVoice`), the mic and the AudioContext close 3 s after the last lease; never keep the mic open without a user. The privacy page states this. A hold shorter than 700 ms is a photo.
- Effects dock (2026-09-26 operator): all effects live in a left slide-in dock with a ✨ pull tab (rail: faces, stickers, makeup, funny faces, text, voice, face lab). No bottom tabs or strips. Tap on the video closes it. The photo editor uses the same dock for its sticker palette (open on entry, tap on the photo hides it). Editor gestures: tap a sticker to select (glow, display only), one finger drags it, two fingers anywhere scale and rotate it, two-finger double tap mirrors it, tap on empty space deselects. Floating button bottom-right: one tap turns it into 💾 with 🧹 (remove selected, or all). The photo fills the screen (object-fit contain). Preset warps and face-lab sliders are mutually exclusive. Up to 5 preset warps can be on at once (2026-09-27 operator): chips toggle, the oldest pick makes room, handles are sorted largest region first (`handlesForAll`), handle budget 32 in the shader and the renderer. Up to 5 sticker packs at once too: props combine, a full-face mask replaces the mask that is on, the mask draws below the props (`toggleSticker`, `spritesForAll`). Stickers follow the warp: two render passes in `src/render/renderer.ts` (camera picture plus stickers into a render target with no colour space, then the warp shader on that texture, then the text on top). Sprite textures carry no colour space either, so colours pass through unchanged; check a colour change with a baseline picture and `ffmpeg -lavfi psnr`. The app starts with no effect. Saved photos are cropped to the visible cover region of the stage (`coverCrop`), so they match the screen.
- Capture flow (2026-09-26 operator): the shutter saves to the gallery with a fly-to-gallery animation, no share sheet; share and save live in the viewer; the share sheet is only the fallback when saving to the device fails. Camera screen holds only gear, tabs, strip, flip, shutter, gallery.
- Gallery: OPFS only (`photos/`, `thumbs/`), metadata in file names, no IndexedDB. Destructive actions need two taps.
- Recording (M3): mp4 first (`avc1.424028, mp4a.40.2`), webm fallback, no timeslice, explicit bitrate, cropped second canvas for `captureStream`, `start()` in try/catch. Hold the shutter to record. `isTypeSupported` is not trusted: when the encoder fails after start (seen: mp4 with AAC in a Chromium without an AAC encoder), the recorder restarts with the next type and remembers the failed one for the session.
- Sticker art: Twemoji (CC-BY 4.0) stays. Fluent Emoji Color (MIT) is added as a second source (research/04). OpenMoji (BY-SA) and JoyPixels excluded. Custom props come from the operator's Piranesi generator later, committed CC0.
- M4 (grill 2026-09-27, operator): three pull requests in the order makeup (M4a), face on a picture (M4b), backgrounds (M4c), each with a phone check. Face on a picture uses the live eyes and mouth only, on every target.
- Makeup (M4a): one-tap looks, one at a time, a second tap turns the look off, works together with every other effect. Looks are data in `src/filters/makeup.ts`: shapes in the flat face layout, painted once per look on a canvas. The face mesh is MediaPipe's canonical face model (Apache-2.0, `src/render/faceMesh.json`, built by `scripts/fetch-facemesh.mjs`). The mesh draws in the first render pass, over the camera picture and under the stickers, with an opaque shader that reads the camera picture under each fragment (skin smoothing, then paint). The layer draws the mesh without the triangles that fill the mouth and the eyes (`trianglesOutside`), so paint has no surface on teeth and eyeballs. A look that covers the eyes on purpose (cucumber) keeps the eye triangles. The paint texture is premultiplied. A look can ask for flat paint (`flat`), which ignores the light of the face. No depth buffer: back faces are culled.
- Art comes from Astra (2026-09-27, operator): OpenAI Codex with image generation and Blender, run by the operator. Astra makes pictures, props, 3D models and animation. Claude writes code. Claude states what the app needs in `astra/BRIEF.md` (formats, sizes, names, limits, never design advice) and keeps the start prompt in `astra/PROMPT.md`. The folder `astra/` is not in git. Astra writes only in `astra/work` and `astra/out`, never code, never git. Claude checks the finished files in `astra/out`, imports them into `public/`, sets position data, and keeps the licence records. Claude does not read `astra/work`. The Piranesi prop list (`docs/piranesi-props.json`) is request R3 of the brief now.
- Face on a picture (M4b): `src/filters/faceon.ts` holds the geometry (face frame, face units, windows, targets), `src/render/faceOnLayer.ts` draws the picture and one face quad in the second render pass, in place of the warped camera view. The handle chain lives in `src/render/warpChain.glsl`, shared by `warp.frag` and `faceon.frag`. `src/filters/warpMath.ts` holds the same chain in TypeScript with its reverse: change both together. The face quad spans 2.4 face widths (`SPAN`), so eyes and mouth stay inside with every filter on. The picture slides toward the face place (`coverOffset`). The face search for a device photo keeps one landmarker in the worker: each landmarker takes a WebGL context that `close()` does not give back. Target places (`TARGETS`) are tuned with true face proportions: `FACE_FIT=crop` in the smoke script, because the default test picture is stretched. Art is converted by `scripts/import-art.mjs` (ffmpeg, WebP, committed under `public/targets`).
- Backgrounds (M4c): `src/tracking/seg.worker.ts` and `segTracker.ts` (selfie segmenter, own worker, CPU delegate on purpose: the mask is needed as bytes, the face tracker keeps the GPU, and the GPU path leaks in tasks-vision 1.0.1), `src/filters/mask.ts` (sizes, smoothing over time), `src/render/backdropLayer.ts` with `backdrop.frag` on the camera quad of the first pass. With no scene that shader returns the camera picture unchanged (checked pixel by pixel). Both workers carry the same network fence in front of `importScripts`: a test compares them. Spike numbers (headless desktop): 24 ms per mask, one mask per result, mask size equals input size. `TextureBank` (`src/render/textureBank.ts`) loads pictures for both layers. The smoke check brings its own scene through `__fm.scene(...)`.
- Licenses allowed: MIT, Apache-2.0, BSD, MPL-2.0, Unlicense, CC0, CC-BY. No GPL.

## Conventions

- Commit messages: plain conventional commits. No `Co-Authored-By` trailer, no "Generated with" line. Operator instruction.
- Subagents: pass `model: "fable"` on dev, review, explore and plan `Agent` calls. Research agents (`deep-researcher`, `claim-verifier`) keep their own definition (Opus 5.5 high): never pass a model to them. Operator instruction.
- Phone dev loop: `adb reverse tcp:5173 tcp:5173`, then `http://localhost:5173` in Chrome on the phone. `localhost` is a secure context, no HTTPS needed.
- Windows 11 host, Git Bash for scripts. Node 24, npm 11, gh logged in as mixashin, adb and ffmpeg on PATH.
- Kid UI: icons, 64 px tap targets, no reading required. Advanced panel behind a gear.
- Deferred, do not propose: cloud AI photo edits, iOS, accounts.

## Commands

    npm i            # postinstall copies mediapipe wasm to public/mediapipe/wasm
    npm run dev      # vite --host, http://localhost:5173
    npm test         # vitest
    npm run build && npm run preview   # http://localhost:4173, production CSP active
    FACE=test/face.jpg SMOKE_WAIT_MS=20000 node scripts/smoke.mjs [url]   # headless check, needs dev or preview server; SMOKE_OUT/SMOKE_SHOTS/SMOKE_PAGE/SMOKE_TEXT save screenshots; SMOKE_GALLERY=1 and SMOKE_RECORD=1 run the gallery and the hold-to-record checks; FACE_FIT=crop feeds the face with true proportions
    node scripts/attributions.mjs   # after dependency changes (About screen list)
    node scripts/fetch-fluent.mjs   # only when the Fluent sticker list changes; files are committed under public/stickers/fluent
    node scripts/fetch-facemesh.mjs # only when the face mesh source changes; writes src/render/faceMesh.json (committed)
    node scripts/import-art.mjs targets   # after an art delivery in astra/out: converts to public/targets (committed)
