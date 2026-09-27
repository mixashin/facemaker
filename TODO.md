# facemaker backlog

Items added during planning. Not yet triaged into spec. Triage happens in grill-me.

## From operator (2026-09-26)

- [ ] UI: simple by default. Target user is a child.
- [ ] UI: advanced settings panel, hidden by default. For tech-savvy child or parent.
- [ ] UI: themes. Candidates: girl, boy, neutral, cyberpunk. Theme switcher.
- [ ] Stickers: kid-safe sticker pack. Emoji and animal masks. Landmark-anchored.
- [ ] Text overlay: Snapchat style. Type, drag, resize, color. Baked into recording.
- [ ] Snapshot: capture still image (PNG/JPEG) in addition to video. Same save and share path.

### Filters (operator list, 2026-09-26)

- [ ] Warp face filters.
- [ ] Makeup filters and beauty filters.
- [ ] Funny geometry: big eyes, big smile, small face, big head, big mouth, similar.
- [ ] Animated background filters: underwater, grasslands, spooky, etc. Needs person segmentation.
- [ ] 3D cute avatar (VTuber style). Blink, mouth open, slight head movement drive the model. Keep minimal.
- [ ] Animated body overlays over skeleton: half body mermaid, in water, on the surface of the sun. Needs pose landmarks.
- [ ] Costume overlays: clown suit, gala dress, princess dress, similar. Needs pose landmarks.
- [ ] Parametric face morph: sliders per region (nose, mouth, eyes, ears, forehead, etc.). Modes: smaller, bigger, wobbly, swirly. Advanced panel candidate.
- [x] Research: phone built-in AI for prompt photo edits. Result 2026-09-26: not reachable from web. Chrome built-in AI is desktop only, no image output. Samsung Generative Edit is cloud + Gallery app only. ML Kit GenAI is native only. DEFERRED. Revisit when Chrome ships Prompt API on Android with image output. Local substitutes: cartoon shader, LUTs.

## Decisions so far (grill-me)

- Users: ages 6 to 12. Icon-first UI, optional labels, simple mode default.
- Device: mid-range Android 2022+. Target 720p at 24 to 30 fps.
- Milestone 1: warp filters + snapshot + save + share. 1 to 2 weeks.
- UI: Preact + TypeScript. Render: Three.js.
- MediaPipe: @mediapipe/tasks-vision 1.0.x. Telemetry blocked by meta CSP connect-src 'self'. Audit in research/03. Re-check CSP in DevTools on every upgrade.
- Hosting: public repo github.com/mixashin/facemaker. GitHub Pages with custom domain face.mxa.sh. base '/'.
- Commits: no Co-Authored-By trailer.
- Faces: up to 2. numFaces 2, own One Euro smoothing per face.
- Language: Serbian + English, icon-first UI. i18n as JSON string tables so others can add languages. Assumption: Serbian Latin script, confirm.
- Deploy: main = live at face.mxa.sh. Feature branches, PR build check, merge when it works on phone.
- Pace: sprint. M1 as soon as possible.
- Voice: native-node delay-line pitch shifter (Tone.js method), no worklet (decided 2026-09-27, research/05; SoundTouchJS stays the upgrade path, MPL-2.0, audit first). Robot, echo, telephone, monster from native Web Audio nodes.
- Gallery: in-app. OPFS files only, metadata in file names (IndexedDB dropped 2026-09-26). Save to device and share buttons. persist() once.
- Defaults set without asking: recording mp4 first then webm fallback, snapshot JPEG 0.92, front and back camera switch, live voice monitoring off by default on phone, sticker assets from a permissive emoji set (Noto or Twemoji, attribution in About).

## From operator (2026-09-26, during M1 dev)

- [ ] 3D characters: use Opus 5.5 + Blender MCP to build cute characters (concept art from an AI image generator with the kids), rig in Blender, export for the avatar mode (M6). Read `~/.claude/skills/diy/blender/characters.md` when this starts.
- [ ] Post-processing stickers on photos: fake moustache, pimples, sunglasses, googly eyes, party hats, caps. Resize, move, rotate (basic transforms). Photo editor step after capture (M2 sticker layer, editor mode).
- [ ] Research: basic hairstyle change on device (after the on-phone AI research). Candidates: hair segmentation (MediaPipe hair category in multiclass selfie model) + recolor, or hair sprite overlays anchored to the forehead/head matrix.
- [ ] Warp presets: no nose, big ears.
- [ ] Research: AR pests and animated 3D props: annoying fly, mosquitoes, spider on head. 3D models rigged and animated in Blender with Opus 5.5, exported glTF, anchored to the head matrix in Three.js.
- [ ] Puking rainbow (mouth-open trigger, particle stream from the mouth landmarks). M7 trigger candidate.
- [ ] Ambient atmosphere overlays: rain, snow, wind (leaves), scorching heat (heat haze shader + sun glare). Full-frame particle and shader layers, independent of face tracking.
- [ ] Time-slice scan photo: a scanline sweeps top-to-bottom (or bottom-to-top) and freezes each row as it passes (slit-scan). Capture mode, produces a still. Row-by-row copy from the live canvas into an accumulating canvas.
- [ ] Warp presets: double chin, fat face, and similar (chin/jaw scale handles, cheek bulge).
- [ ] Upside-down face: flip the face region 180° (rotate inside the face oval, feathered), rest of the frame unchanged.
- [ ] Beauty mask: green face tint over the face mask region plus cucumber slice stickers on the eyes (sticker pack + landmark-region tint).
- Decided 2026-09-26 (operator): Serbian Latin script. Stickers from Twemoji (graphics CC-BY 4.0, code MIT; attribution in About). Both apply to M2.
- [ ] About screen (M2): attribution for every dependency and asset (Preact, Three.js, MediaPipe tasks-vision + models, vite-plugin-pwa/Workbox, Twemoji, fonts, SoundTouchJS later, avatars later) with license names and links. Generate the list from package.json at build time where possible.
- [ ] About screen (M2): plain-language privacy page for parents and kids. What the camera and mic feed does (stays in the browser), what is stored (gallery in the browser's own storage on the device), what leaves the device (nothing, except photos and videos the user shares on purpose), no accounts, no analytics, how to delete everything (clear all button). One simple data-flow diagram: camera → this device → your share button. Serbian and English.
- [ ] First-launch tutorial (M2): kid-friendly, icon and animation driven, 3 to 5 steps (pick a filter, tap the shutter, hold for video later, share, gallery). Skippable. Seen flag in localStorage. Button in the settings panel to restart the tutorial.
- [x] Tutorial step for M3: hold the shutter to record video, release to stop. Added to the tutorial when video ships. (2026-09-27)
- M1 phone acceptance 2026-09-26: operator tested every filter and share on the phone, all good.

## Deferred from the M2a review (2026-09-26)

- [ ] `<html lang>` follows the active language (setLang + init).
- [ ] Theme popover closes after a pick (one statement in ThemePicker).
- [ ] Text: ✖ chip to clear the text (a typed word stays on every photo until backspaced).
- [ ] Per-frame allocations: sprite transform object, text key string, `getBoundingClientRect` per frame (cache via ResizeObserver). Profile on the phone first.
- [ ] Icon-only button labels: swatches labelled with hex codes, TopBar labels untranslated (smoke keys on them; add `data-id` for the smoke before translating).
- [ ] `t` shadowed by the tracker variable inside the App effect; rename to `tracker`.
- [ ] Tests: every `t('key')` literal exists in en.json; attributions versions match installed versions; SpriteLayer pool visibility with a stubbed scene.
- [ ] Bundle one Apache-2.0 display font (woff2, font-src 'self', precached) for font B instead of the serif fallback; add to attributions; `document.fonts.load` before first draw.
- [ ] Theme flash on slow phones before `initTheme()`: inline pre-paint script needs a CSP hash. All themes are dark, low priority.

## Deferred from the M2b review (2026-09-26)

- [ ] Editor palette chips: dark SVGs (moustache) on a dark chip have low contrast; lighter chip background in the palette.
- [ ] Shader handle budget: presets (up to 3) + sliders (up to 8) per face exceed MAX_H 16 with two faces; raise MAX_H or prioritise sliders.
- [ ] Editor: highlight the selected sticker.

## Handoff 2026-09-26 late (next session starts here)

Decisions from the sticker research (research/04-sticker-art-alternatives-2026-09-26.md):
- Keep Twemoji and every current pack and prop. Nothing is removed.
- Add Microsoft Fluent Emoji Color SVGs (MIT) as a second sticker source: copy script from a pinned commit of github.com/microsoft/fluentui-emoji (no npm package; layout assets/<Name>/Color/<name>_color.svg), new packs for more animal masks (tiger, bear, fox, cow, rabbit, hamster, unicorn, dragon, alien, robot, pumpkin) and props (nerd glasses, monocle, cowboy hat, graduation cap, woman's hat, bow, stars, rainbow, butterfly), MIT entry in the About attributions and a LICENSE-ASSETS.md at the repo root listing every asset source.
- Custom props with no emoji (eyepatch, pirate hat, moustache, googly eyes, pimples, braces, freckles, clown nose, bow tie, halo, horns): the operator generates a consistent set on Piranesi (FLUX schnell, FLUX.2 Klein or SD; transparent PNG), committed CC0 under public/editor/. Not now; Claude writes the prompt list and file spec when asked. Hand-drawn SVGs stay.

Order for the next session:
- [x] Fluent Emoji Color packs (branch fluent-emoji, 2026-09-26): 14 masks + 6 props, 6 editor props, LICENSE-ASSETS.md, chips show real art.
- [x] M3 plan (video + voice), built 2026-09-27 on branch m3-video-voice, plan docs/superpowers/plans/2026-09-27-m3-video-voice.md: docs/SPEC.md M3, grill only new questions, then execute Native + Fable subagents like M2a/M2b. Grilled 2026-09-27: mic at first need, voice mirror, one shout preset; pitch engine: native-node Jungle graph (research/05, 2026-09-27).
- [x] Prompt list + spec for the Piranesi prop set: docs/piranesi-props.json (2026-09-27). Asset sources: research/06-asset-sources-2026-09-27.md.

## Handoff 2026-09-27 (M3 plan next)

State: Fluent packs live (PR #11). research/05 done. All M3 questions answered (SPEC M3 revised, CLAUDE.md Decisions). Nothing in flight, tree clean.

Next: write `docs/superpowers/plans/2026-09-27-m3-video-voice.md` (superpowers:writing-plans, TDD tasks), then execute Native + Fable worktree subagents, one fresh Fable reviewer, PR, merge, tag m3. Design worked out on 2026-09-27 (code already read: App.tsx capture flow, CaptureButton, state.ts, Dock rail, gallery.ts stores, Viewer, tutorialState STEPS, presets.ts handlesFor, renderer, csp.ts media-src blob:, smoke.mjs fake camera args, i18n parity test, tutorialState test expects 4 steps):

- `src/audio/voice.ts` (pure, tested): `VOICE_PRESETS` none/chipmunk(+8 st)/deep(-6)/monster(-8 + distortion + reverb)/robot(ring mod 30 Hz)/echo(delay 0.25 s, feedback 0.4)/telephone(2x LP 2 kHz + 2x HP 500 Hz); `voiceParams(id)`; delay-line shifter math `shiftParams(semitones, window=0.08)` -> `{ rate: |r-1|/window, amp: -window*sign(r-1), base: r>1 ? window : 0 }` with r = 2^(st/12); `rampTable(n)` 0..1 linear, `fadeTable(n)` = sin^2(pi t) (fade(t) + fade(t+0.5) = 1); `distortionCurve(k)`; `impulse(sampleRate, seconds, decay)`; `rmsToLevel(rms)` 0..1 smoothed.
- `src/audio/engine.ts` (browser): `PitchShifter` = two DelayNodes, delayTime = base + amp * looping ramp AudioBufferSource (1 s buffer, playbackRate = rate, second source offset 0.5 s), crossfade gains from looping fade buffers (same playbackRate, offsets 0 and 0.5); `buildChain(ctx, source, params)` native nodes only; `VoiceEngine` lazy AudioContext on first need, `MediaStreamAudioSourceNode` -> chain -> `MediaStreamDestination` (recording) + `AnalyserNode` (shout level); `setPreset(id)` rebuilds; never connects to `ctx.destination`. Test the wiring with a small fake AudioContext (node kinds and params per preset).
- `src/audio/mic.ts`: `getMic()` at first need (first hold or first voice preset / shout), constraints echoCancellation, noiseSuppression, autoGainControl on; `micState` signal idle/asking/live/denied; denied -> video without audio, 🔒🎤 hint.
- `src/capture/recorder.ts` (tested with an injected fake MediaRecorder): `pickMimeType(isSupported)` order `video/mp4;codecs="avc1.424028,mp4a.40.2"`, `video/mp4`, `video/webm;codecs=vp9,opus`, `video/webm`; `extFor(mime)`; `recordName(ext)` matches gallery `parseName`; `evenSize(w,h)`; `Recorder.start(stream, mime)` no timeslice, `videoBitsPerSecond: 4e6`, `start()` in try/catch, `MAX_MS` 60000 auto stop, `stop(): Promise<File>`.
- `src/capture/recordCanvas.ts`: offscreen canvas at the `coverCrop` size (even dims) of the stage, `draw(stage)` each render frame while recording, `captureStream(30)` + audio track from the engine when the mic is live.
- Hold gesture: `holdGesture(thresholdMs=350)` pure state machine (down/up -> 'photo' | 'recordStart' | 'recordStop'), used by the shutter and by the voice mirror. CaptureButton gets pointer handlers; `recording` signal (start ms) drives a conic progress ring on the shutter (`.shutter.rec`, red), 60 s cap. Stop -> `safePut` -> fly animation with the video thumb -> gallery refresh.
- Gallery: `mimeForName(name)` (.mp4/.webm/.jpg, OPFS files carry no type); `makeThumb` branches on video/* -> first frame via `<video>` seek 0.1 s -> canvas -> jpeg (browser only, MemoryStore keeps the injected fn); Viewer renders `<video class="full" controls playsInline>` for videos, Edit hidden for videos; share/save/delete unchanged.
- Dock: rail tab `voice` 🎤 (DockTab union + TABS + i18n `tabs.voice` Voice/Glas) -> `Strip items={VOICE_PRESETS}` + voice mirror button (hold 🎤, talk, release: audio-only MediaRecorder on the engine stream, then `new Audio(url).play()`; i18n `voice.try` "Hold and talk"/"Drži i pričaj"). Picking a preset other than none requests the mic.
- Shout: `PRESETS` add `{ id: 'shout', icon: '📣' }`; `handlesFor(preset, faces, aspect, level = 1)`; shout = mouth handle strength 0.9*level + head handle 0.5*level; level from `engine.level()` in the render loop; selecting shout requests the mic.
- Tutorial: STEPS add `{ icon: '🎥', key: 'tutorial.record' }` after the shutter step (update the 4-step test to 5); strings en "Hold the big button to make a video" / sr "Drži veliko dugme da snimiš video". Privacy page `privacy.p5` about the microphone (used only while recording or trying a voice, stays on the device).
- Smoke: `SMOKE_RECORD=1`: mouse down on the shutter, 2500 ms, up; gallery +1; open, Save -> ffprobe streams (video + audio from the fake mic) and duration >= 1.5 s; log `isTypeSupported` results; grant microphone permission in the context. Headless Chromium likely lacks H.264, so the webm fallback gets exercised there; mp4 on the Fold.
- Subagent split: Fable worktree agent A = audio pure math + engine + mic; agent B = recorder + recordCanvas + gallery video support; native = hold gesture, App wiring, dock voice tab, mirror, shout, tutorial, strings, smoke, docs. Then reviewer, PR, merge, tag m3.

## Noted from the parallel session (2026-09-27, asset research)

Commits de5e176 and 1ed0d55 by a second session. Report: research/06-asset-sources-2026-09-27.md (renumbered from 05, because 05 is the voice-effects report). Prop spec: docs/piranesi-props.json (33 items: moustache-handlebar, moustache-walrus, beard-pirate, googly-eye, eyepatch, pirate-hat, party-hat, baseball-cap, chef-hat, witch-hat, viking-helmet, tiara, halo, devil-horns, bunny-ears, cat-ears, clown-nose, pig-nose, pimple, freckles, blush, braces, bow-tie, cucumber-slice, band-aid, kiss-mark, tear-drop, sweat-drop, gum-bubble, headphones, mosquito, fly, spider).

Findings to keep in mind:
- Etsy and other paid packs (Creative Market, Envato Elements, Creative Fabrica, Lusi Art) forbid free redistribution or extractable embedding. A public repo that serves raw files fails all of them. No paid pack under $30 works. Only a commission with a written CC0 release or rights transfer would.
- Allowed sources: Kenney.nl (CC0: particles, UI sounds, 2D, 3D), FreeSVG.org (CC0, check each file), Quaternius (CC0 animated 3D, FBX/OBJ/Blend, needs a glTF export in Blender), Freesound with the CC0/CC-BY filter, BlendSwap CC0/CC-BY items. Excluded: Sonniss GDC bundle, Pixabay and Pexels raw loops (standalone clause), SVG Repo unless the icon page shows an allowed licence.
- AR pests (M7 backlog): Quaternius bee and spider. No licensed mosquito exists: model one or generate a 2D sprite.
- Custom face props: generate on Piranesi (FLUX.1 schnell or FLUX.2 Klein), release CC0 under public/editor/gen/. Operator runs the generation.

Open question for the operator:
- [ ] Allow SIL OFL fonts? No Apache-2.0 playful display font covers the Serbian letter đ (Chewy, Luckiest Guy and Fontdiner Swanky are latin only). OFL fonts with latin-ext: Fredoka, Baloo 2 (both confirmed), Lilita One, Titan One, Bangers, Bubblegum Sans, Sniglet, Chango. If yes: bundle Fredoka or Baloo 2 with its OFL.txt as text font B, add OFL-1.1 to the allowed list (CLAUDE.md, attributions test regex, LICENSE-ASSETS.md). If no: keep the system fallback font. Relates to the deferred M2a minor "bundled font B".

## M3 phone checks owed by the operator (2026-09-27)

Headless Chromium cannot answer these. Check on the Fold before the merge:
- [x] Hold the big button: red button with ring, dock and gear hidden, release saves, the clip flies to the gallery.
- [x] First hold asks for the microphone. After the grant, the next hold records with sound.
- [ ] Which file type the phone makes (gallery, save, look at the extension): mp4 expected. Headless Chromium fell back to vp9 + opus inside mp4, because it has no AAC encoder.
- [x] Voice quality of chipmunk, deep, monster, robot, echo, telephone in a saved clip. Flutter on long vowels is the known limit of the delay-line method.
- [ ] Voice mirror in the 🎤 tab: hold, talk, release, hear it back.
- [x] Shout preset (📣 in the faces strip): mouth and head grow when the kid shouts.
- [x] Share a clip to Viber or WhatsApp and play it there.
- [ ] Recording at the real camera resolution runs to the end (a 2018 Android bug stopped 1280x720 canvas recording silently).
- [ ] Denied microphone: the hold still records a silent video, the voice tab shows the lock hint.

## Deferred from the M3 review (2026-09-27)

Fixed in the review pass: microphone released 3 s after the last use (leases), dead mic stream detected, slow tap gives a photo, voice panel cleans up on close, engine start errors no longer reject, privacy and delete texts cover videos.

Minor, not done:
- [ ] Shutter and mirror use `disabled` while pressed: a cap that fires with the finger down can swallow the next press once (use `aria-disabled` or cancel the hold).
- [ ] Recorder treats every error as a type failure: an error late in a clip discards the clip and blacklists the type. Restart only within about 1 s of the start.
- [ ] Video thumbnail load has no timeout (the seek has one); a load that never answers would keep the shutter busy.
- [ ] Rotation or Fold open during a recording: the crop is fixed at the start. End the clip when the stage size changes.
- [ ] Shout preset with a denied mic shows no hint in the faces strip.
- [ ] All mic failures show the "allow it in settings" hint, also a computer with no microphone.
- [ ] Shutter aria-label says "take photo" while recording; keyboard cannot record; the mirror button has no keyboard activation.
- [ ] Gallery title and empty text still say photos only.
- [ ] Capture stream video track is not stopped after a clip.
- [ ] No unit test for the App record flow (startRec, stopRec, endHold); covered by the smoke only.
- [ ] Smoke checks the video thumbnail by element count, not by `naturalWidth`.
- [ ] The bare `video/mp4` fallback gave vp9 + opus inside mp4 in headless Chromium: decide after the phone check whether to skip it and go to webm.
- [ ] Commit 6f3149d is red in history (one count test), fixed by the next commit.

## Operator phone check of M3 (2026-09-27): passed

Hold to record with the mic prompt, clip playback, voice effects in the clip, shout preset, share to a messenger: all passed on the Fold. One request: no playback in the background. Done: the viewer video and the voice mirror stop when the app goes to the background (`src/app/background.ts`).

## Several filters at once (operator, 2026-09-27): done

Up to 5 face filters together (big head + big eyes + big mouth and so on). One constant, `MAX_ACTIVE` in `src/filters/presets.ts`, changes the limit; 10 also fits the handle budget of 32 for one face, and for two faces only when the picks are small ones. Several sticker packs at once: done 2026-09-27 (up to 5, props combine, one mask at a time, `MAX_STICKERS` in `src/filters/stickers.ts`).

## Stickers follow the warp (operator, 2026-09-27): done

Two render passes: stickers are drawn into the camera picture, then the whole picture is warped. Verified against baseline pictures: plain picture identical, sticker pictures without a warp at 49 dB and 52 dB PSNR, heart area grows with big head and big eyes. Phone check owed: frame rate on the Fold with several filters and stickers on (one more full-size pass per frame).

## Handoff 2026-09-27 late (next session starts here)

State: everything is merged and live. `main` at the merge of PR #16, tags m1, m2a, m2b, m3, no other branch, tree clean. 214 unit tests, type check clean, full smoke OK.

Done on 2026-09-27:
- Fluent Emoji Color packs (PR #11).
- research/05 (voice-effects engine, Opus researchers) and, by a parallel session, research/06 (asset sources) plus docs/piranesi-props.json (33 props for the Piranesi generator).
- M3 video + voice (PR #12), review fix pass, no playback in the background (PR #13), tag m3.
- Several face filters at once (PR #14), several sticker packs at once (PR #15), stickers follow the warp (PR #16).

Open, operator side:
- [x] Frame rate with several filters and several stickers on (one more full-size render pass per frame since PR #16). Operator, 2026-09-27: tested on a tablet with 5 to 6 effects and stickers together, no drops, no lag.
- [ ] M3 checks still open: file extension of a saved clip (mp4 expected), a long recording at full camera resolution, denied microphone gives a silent video and the lock hint.
- [ ] Fluent mask sizes on the Fold.
- [ ] Decide: allow SIL OFL fonts (Fredoka or Baloo 2) for the Serbian letter đ. Needs OFL-1.1 on the allowed list.
- [ ] Decide: pin `effort: high` in `~/projects/web-research/agents/deep-researcher.md` and `claim-verifier.md` (they pin only the model, Opus 5.5), then run install.sh.
- [ ] Custom props: now request R3 in `astra/BRIEF.md` (Astra makes them, same 33 items as docs/piranesi-props.json). Then Claude wires them into the editor palette and the sticker packs.

Open, code side (none blocks M4):
- "Deferred from the M3 review" in this file (12 minors). The two with the most user impact: rotation or Fold open during a recording keeps the old crop; a recorder error late in a clip loses the clip.
- "Deferred from the M2a review" and "Deferred from the M2b review".

Next milestone: M4 (docs/SPEC.md "M4: Makeup, face-onto-image, backgrounds"). Backgrounds need the MediaPipe ImageSegmenter: new model file, new worker or a second task in the face worker, the same two privacy fences (meta CSP and the worker fetch guard), smoke egress check after the dependency change. research/02 has the filter research, research/06 the asset sources for background loops (Pixabay and Pexels raw loops are excluded, use procedural shaders or CC0).

Process rules that cost time when forgotten:
- Coding, review, explore and plan agents: `model: "fable"`. Research agents (`deep-researcher`, `claim-verifier`): never pass `model`, they run on their own definition (Opus 5.5).
- Worktree coding agents: start from the plan commit with `git reset --hard <commit>`, link `node_modules` with a junction, never `npm install`. In their sandbox `git` and `cmd` fail in Bash (rtk hook): they use the PowerShell tool. Remove the junction with PowerShell (`cmd /c rmdir <path>` after a `LinkType -eq 'Junction'` check) before `git worktree remove`.
- `tsc -b --force` after cherry-picks: the build info file lives in `node_modules/.tmp` and is shared through the junction.
- Gate every commit on the vitest exit code (`npx vitest run > log; S=$?`), not on a grep of the output. Commit 6f3149d went in red because of that.
- Long shell heredocs with backticks or `${` break. Write a script file with the Write tool and run it.
- Renderer colour: the render target and the sprite textures carry no colour space. After a change there, compare pictures with a baseline from the old build: `ffmpeg -i old.png -i new.png -lavfi psnr -f null -`.
- Smoke: `SMOKE_RECORD=1 SMOKE_GALLERY=1 SMOKE_VIEWPORT=380x860 FACE=test/face.jpg SMOKE_WAIT_MS=20000 node scripts/smoke.mjs http://localhost:4173` against `npm run build && npx vite preview --port 4173 --strictPort`. A label `-` in `SMOKE_SHOTS` closes the dock before the shot. Headless Chromium has no AAC encoder: the recorder falls back, the warning in the console is expected.
- The installed PWA takes a new version on the launch after it downloaded it: open, close fully, open again.

## M4 decisions (grill, 2026-09-27)

- Order: makeup (M4a), face on a picture (M4b), backgrounds (M4c). Three pull requests, a phone check for each.
- Makeup: one-tap looks, and they must work together with filters, stickers and the rest.
- Face on a picture: eyes and mouth only, on every target.
- Backgrounds and all other art: from Astra. See the next section.

## Art workflow with Astra (operator, 2026-09-27)

Astra is OpenAI Codex with image generation and Blender, run by the operator. Astra makes art. Claude writes code. One file holds what the app needs: `astra/BRIEF.md` (requests R1 to R6, formats, folders, rules). The start prompt for Astra is `astra/PROMPT.md`. The folder `astra/` is not in git.

- [ ] R1 face-on targets (for M4b): open.
- [ ] R2 background scenes (for M4c): open.
- [ ] R3 sticker props (33): open.
- [ ] R4 face paint on the flat face layout (experiment): open. When the first two files arrive: add image looks to the makeup engine (load a PNG into the look canvas, then erase the openings) and check the fit on the face.
- [ ] R5 3D props, R6 3D avatars: wait for the operator.
- [ ] After each delivery: check the files (size, transparency, names, no text), import into `public/`, add the row to LICENSE-ASSETS.md and the entry to scripts/attributions.mjs (CC0, released by the operator).

## M4a makeup: phone checks owed by the operator

- [ ] Every look on a real face: paint sits on lips, lids, cheeks. No paint on eyes or teeth with the mouth open.
- [ ] A look with two or three filters and stickers.
- [ ] A recording with a look on.
- [ ] Frame rate with a look, filters and stickers together.
- [ ] Head turned far to the side: note artefacts at the edge of the face (no depth buffer yet).
