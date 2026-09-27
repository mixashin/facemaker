# facemaker: feature specification

Status: agreed in grill-me on 2026-09-26. Change by editing this file in a PR.

## 1. Purpose

A camera toy for children aged 6 to 12. It warps faces, adds masks and stickers, changes the voice, and records photos and videos to share with friends. It runs as a Progressive Web App on Android Chrome and desktop Chrome or Edge. Nothing leaves the device.

## 2. Hard constraints

| Constraint | Rule |
|---|---|
| Network | Zero runtime requests to third parties. Enforced by a meta CSP with `connect-src 'self'`. Assets (wasm, models, fonts, stickers) are served from the app origin. |
| Privacy | Camera frames, landmarks, audio, and recordings never leave the device. No analytics. No accounts. |
| Platform | Android Chrome (mid-range 2022+, target 720p at 24 to 30 fps) and desktop Chrome or Edge. iOS out of scope. |
| Install | Installable PWA. Works offline after first load. |
| Hosting | Public repo `github.com/mixashin/facemaker`. GitHub Pages at `https://face.mxa.sh`, base `/`. |
| Licenses | Dependencies must be MIT, Apache-2.0, BSD, MPL-2.0, Unlicense, CC0, CC-BY. No GPL. Attribution list in the About screen. |
| Kids | Simple mode by default: icons, big tap targets, no reading required. Advanced panel behind a gear icon. |
| Language | Serbian and English. Icon-first. String tables in JSON so others can add languages. |

## 3. Users and modes

- **Kid mode (default)**: full-screen camera, a filter strip, one big capture button (tap = photo, hold = video), a gallery button, a theme button. No text required.
- **Advanced panel** (gear icon): parametric morph sliders, voice effect parameters, camera resolution, fps cap, delegate CPU/GPU, storage usage, clear all, language, attribution.
- **Themes**: neutral (default), girl, boy, cyberpunk. CSS custom properties only. A theme changes colours, button shapes, and the capture button icon. No feature differences.

## 4. Feature list by milestone

### M1: Warp + snapshot + share

- Camera: front and back switch, mirror front camera.
- Face tracking: `@mediapipe/tasks-vision` FaceLandmarker in a Web Worker, `numFaces: 2`, One Euro smoothing per face, blendshapes and transformation matrix on.
- Render: Three.js full-screen quad, video texture, fragment shader with radial warp handles.
- Filters (each a preset of warp handles): Big Eyes, Big Mouth, Big Head, Small Face, Bulge, Swirl.
- Snapshot: JPEG 0.92 of the rendered canvas.
- Save to device: `<a download>`.
- Share: `navigator.share({files})` behind a tap, `canShare` check, fallback to download.
- PWA: manifest, icons, service worker with precached wasm and model, install prompt.
- CSP fence. DevTools network test documented.
- Deploy: GitHub Actions to Pages, custom domain, HTTPS.

### M2a: Look (stickers, text, themes, i18n, About, tutorial, more warps)

- Mode tabs on the main screen: faces (warps), stickers, text. Warp presets and sticker packs can be active at the same time. Several sticker packs at once (operator, 2026-09-27): chips toggle, 5 active at most (`MAX_STICKERS`), a sixth pick replaces the oldest, the first chip clears all. Props combine freely. A full-face mask replaces the mask that is on. Per face the mask is drawn first and the props on top. Stickers follow the warp (operator, 2026-09-27): the renderer draws the camera picture with the stickers into a texture (first pass, unmirrored, unwarped), then the warp shader bends and mirrors that texture (second pass). A sticker grows with a big head, bulges with big eyes and turns with the swirl or the upside-down face, like a real object on the face. The text overlay is drawn after the warp and stays straight.
- Sticker packs from Twemoji SVGs (graphics CC-BY 4.0, code MIT), copied at install time, served from the app origin. Full-face animal masks (cat, dog, lion, frog, monkey, pig, panda, koala, ghost, disguise) scaled to the face oval, and props anchored to landmarks (sunglasses, glasses, crown, top hat, bow, flower, stars on cheeks, hearts on eyes, tongue). Scale with face width, rotate with head roll (eye line). Every tracked face gets the stickers. A second art source, Microsoft Fluent Emoji Color SVGs (MIT, committed under `public/stickers/fluent/`, pinned commit in `scripts/fetch-fluent.mjs`), adds more masks (tiger, bear, fox, cow, rabbit, hamster, unicorn, dragon, alien, robot, pumpkin, nerd, monocle, cowboy) and props (graduation cap, sun hat, ribbon, glowing stars, rainbow, butterfly). Chips in the strip show the real art. All sources are listed in `LICENSE-ASSETS.md`.
- Text overlay: one line, typed in a native input, six colours, two fonts, drag to move, pinch to scale. Rendered in the WebGL scene so it is baked into photos and later videos. Serbian diacritics must render.
- Themes: neutral (default), girl, boy, cyberpunk. CSS custom properties on `data-theme`, persisted in localStorage, applied before first paint. Theme button on the main screen. No feature differences.
- i18n: `sr` (Latin script) and `en` JSON string tables, `t(key)`, auto-detect from `navigator.language` (any `sr`, `hr`, `bs` locale is Serbian), switch in settings, persisted.
- Settings sheet (gear): language, theme, restart tutorial, About.
- About sheet: plain-language privacy page first (camera stays on the device, nothing is sent, a photo leaves only via share, no accounts, no tracking) with a three-box data-flow picture, then attributions for every shipped dependency and asset with licence and link, generated from `package.json` plus a manual asset list.
- First-launch tutorial: 3 to 4 steps, icon plus one line, skip, shown once after the camera is live, restart from settings.
- New warp presets: no nose, big ears, double chin, fat face, upside-down face (constant rotation inside the face oval, feathered rim).
- Several warp presets at once (operator, 2026-09-27): chips in the faces strip toggle on and off, 5 active at most (`MAX_ACTIVE`), a sixth pick replaces the oldest, the first chip clears all. Handles of one face are sorted from the largest region to the smallest, so a big head is undone before the eyes and mouth inside it and every bulge sits on its feature. Handle budget 32 (`MAX_HANDLES`, equal to `MAX_H` in `warp.frag`): five presets on two faces need up to 20.

### M2b: Tools (gallery, parametric sliders, photo editor)

- Capture: the shutter saves the photo to the gallery (fly-to-gallery animation, newest photo on the gallery button); share, save and delete happen in the viewer; the share sheet opens directly only when saving to the device fails.
- Gallery: OPFS files under `photos/` and `thumbs/`; metadata from the file name (created, type) and the file handle (size); a sidecar `.json` for video duration when M3 needs it. No IndexedDB (decided 2026-09-26). Grid, tap to view, share, save, delete (two taps), clear all (two taps), storage usage in settings. `navigator.storage.persist()` requested once.
- Parametric morph sliders (advanced panel): nose, mouth, each eye, forehead, chin, ears. Modes: scale, wobble (sine-animated displacement), swirl (rotation inside radius).
- Post-capture sticker editor on a saved photo: moustache, pimples, sunglasses, googly eyes, party hats, caps. Move, resize, rotate. Saves a new photo to the gallery.

### M3: Video + voice

- Record (revised 2026-09-27, research/05): a second canvas at the cover-crop size is drawn from the stage each render frame and feeds `captureStream(30)`; Web Audio `MediaStreamDestination` supplies the processed mic track; `MediaRecorder` with mimeType order `video/mp4;codecs="avc1.424028,mp4a.40.2"`, `video/mp4`, `video/webm;codecs=vp9,opus`, `video/webm`, `videoBitsPerSecond` 4e6, no timeslice (one blob at stop; WebM then carries Duration on Chrome 140+), `start()` in try/catch. Run-time fallback (2026-09-27): a type that passes `isTypeSupported` and then fails with an encoder error restarts the clip on the same stream with the next type; the failed type is skipped for the rest of the session; when no type works the clip ends and nothing is saved. Max 60 s per clip. Hold the shutter to record, release to stop, progress ring on the shutter.
- Voice effects (revised 2026-09-27, research/05): pitch shift by the native-node delay-line method (Tone.js PitchShift graph: two DelayNodes, sawtooth LFOs, crossfade LFOs, window 0.05 to 0.1 s), no AudioWorklet, no dependency. Presets: chipmunk (+8 st), deep (-6 st), monster (-8 st + WaveShaper + reverb), robot (ring modulator 30 Hz + bitcrush-free WaveShaper), echo (DelayNode feedback), telephone (2x lowpass 2 kHz + 2x highpass 500 Hz). Mic constraints: `echoCancellation`, `noiseSuppression`, `autoGainControl` on. No live monitoring. Upgrade path if quality disappoints on the phone: `@soundtouchjs/*` worklets (MPL-2.0, maintained, audit first) or Signalsmith Stretch (MIT WASM).
- Audio-reactive scale: one `shout` warp preset in the faces strip; AnalyserNode volume scales its mouth and head handles (decided 2026-09-27).
- Mic permission at first need (2026-09-27): the first hold on the shutter or the first open of the voice tab requests the mic; a kid who only takes photos never sees the prompt. The first hold shows the prompt; the prompt takes the hold away, so recording starts with the next hold. Video records without audio when the mic is denied. Mic lifecycle (2026-09-27, review): the mic is on only while something uses it (a recording, the voice mirror while it records, the `shout` preset on the visible camera screen). Each user takes a lease (`src/audio/session.ts`); 3 s after the last lease the audio engine closes and the mic tracks stop, so the browser mic indicator goes off. A stream whose track ended is dropped and asked again. Slow tap (2026-09-27, review): a hold that ends less than 700 ms after it started gives a photo, not a clip.
- Voice mirror (2026-09-27): in the voice tab, hold 🎤, talk, release: the clip plays back on the speaker with the chosen effect already in it. The mic lease goes back when the recording stops, and nothing ever routes the mic to the speaker, so no feedback. No live monitoring on phones.
- Pitch engine decided 2026-09-27: native-node delay-line (see Voice effects above).
- Gallery plays videos (`<video controls playsinline>` in the viewer, first-frame thumbnail with a ▶ badge). No WebM duration fix: recordings have no timeslice, so Chrome 140+ writes Duration.

### M4: Makeup, face-onto-image, backgrounds

Ships as three pull requests, each with its own phone check (operator, 2026-09-27): M4a makeup, M4b face on a picture, M4c backgrounds.

**M4a Makeup.** One-tap looks in a dock tab (💄): glam, soft, rainbow, clown, zombie, vampire, tiger, butterfly, hero mask, cucumber mask. One look at a time. A second tap turns the look off. A look works together with warps, stickers, text and voice. A face mesh (468 vertices, 898 triangles, MediaPipe canonical face model, Apache-2.0) is drawn in the first render pass, over the camera picture and under the stickers, so the warp bends the makeup with the face. A look is a list of shapes (fill, blob, stroke, erase) in the flat face layout, painted once on a 512 px canvas (`src/filters/makeup.ts`). The mesh is drawn without the triangles that fill the mouth and the eyes, so paint has no surface on teeth and eyeballs, also with the mouth wide open. The cucumber look covers the eyes on purpose and keeps the eye triangles. Skin smoothing runs in the same shader: one pass, 12 taps, strong detail stays, skin only.

**M4b Face on a picture.** Dock tab 🍊. The target picture fills the screen. The live eyes and the live mouth of the first face go on it with a soft edge, on every target (operator: eyes and mouth always). Targets: orange, apple, cat, dog, lion, art by Astra (CC0, `public/targets`), and a photo from the device (📷, file picker). One quad shows the live face in face units (origin at the nose tip, one unit is the face width, roll removed), so eyes and mouth stay level and keep their size when the child tilts the head or moves. Three soft ellipses cut the quad down to eyes and mouth. The quad reads the first render pass through the same handle chain as the warp shader, so face filters and makeup work on the picture. Each ellipse stays at its place on the picture, takes the size that the filters give the eye or the mouth, and reads the picture where the filters show them (forward map of the landmark rings, `unwarpPoint`). So a big head filter makes eyes and mouth bigger on the orange, and they stay on the orange. Stickers show only where they overlap eyes or mouth. The face model finds human faces only: the place of the face on a bundled target is set by hand (`TARGETS`). For a device photo the face is found on the device by a second landmarker (IMAGE mode, CPU, made at the first photo and kept). The picture slides on the screen, as far as it still covers it, so that the face place is near the middle. Without a face in the photo, eyes and mouth go in the middle. A device photo is scaled to 1536 px at most and stays in memory for the session.

**M4c Animated backgrounds.** Dock tab 🏝️ (shown when scenes exist). The selfie segmenter (square model, float16, Apache-2.0) runs in its own worker on the CPU, on a copy of the camera frame with a long side of 256 px, and only while a scene is on. It gives one person mask per frame. The main thread smooths the mask over time (40 % of the mask before stays) and uploads it as a small texture. The camera quad of the first render pass reads the mask soft (5 taps) with a steep edge and mixes scene and camera picture, so makeup, stickers, filters, photos and recordings work as before. A scene has a plate (or a loop video in its place), a far layer that drifts behind the person, and a near layer that sways in front of the person. The scene covers the visible part of the stage and reads the right way round with the front camera. Until plate and first mask are there, the camera picture stays. The same holds after a return from the background, a camera flip, and a turn of the phone: the mask from before is dropped. A place and a face-on picture do not show together: the last pick wins. The model is in the precache, so a place works offline at its first use. Scenes: underwater, grassland, spooky, space. Art from Astra (request R2).

### M5: Body and costumes

- PoseLandmarker (Lite or Full) with `outputSegmentationMasks`, or HolisticLandmarker when face + pose both needed. Worker.
- Costume sprites: torso quad (shoulders to hips), limb sprites between joints. Sets: clown suit, princess dress, gala dress, superhero.
- Mermaid tail: legs masked out, tail sprite at hips, water background.
- "In water", "on the sun" scenes: background + foreground overlay + body overlay.

### M6: 3D avatar

- three-vrm v3. One or two bundled CC0 avatars (curated). Blendshape mapping: eyeBlink to blink, jawOpen to aa, mouthSmile to happy, browInnerUp to surprised. Head bone slerped from the transformation matrix with damping. Avatar replaces the camera image.

### M7: Triggers and games (backlog, unordered)

- Mouth-open, brow-raise, blink triggers for particles and sounds.
- Hand gestures (Gesture Recognizer): thumbs up, victory, open palm trigger effects.
- Two-face triggers: both smiling starts a celebration.
- "What X are you?" spinner, countdown, catch-the-falling-objects game.
- Y2K/VHS/pixelate/kaleidoscope/mirror/LUT post effects.
- Face swap between the two faces in frame (mesh texture swap).

## 5. Architecture

```
src/
  app/            Preact UI: screens, buttons, sliders, themes, i18n
  camera/         getUserMedia, device switch, resolution
  tracking/       worker: FaceLandmarker (later Pose, Segmenter), One Euro filter
  render/         Three.js scene, video texture, warp shader, sticker layer, text layer
  filters/        presets: warp handle sets, sticker packs, makeup, backgrounds
  capture/        snapshot, MediaRecorder, mimeType detect, share, download
  audio/          mic graph, worklets, effect presets, analyser
  storage/        OPFS files (photos/, thumbs/), names carry metadata, quota, persist
  i18n/           sr.json, en.json, t()
public/
  mediapipe/wasm/ copied from node_modules at build
  models/         face_landmarker.task (later pose, segmenter)
  stickers/ fonts/ backgrounds/ avatars/
```

Data flow per frame: camera `<video>` → `createImageBitmap` → transfer to worker → landmarks + blendshapes + matrix back → One Euro → uniforms and sprite transforms → Three.js render to canvas → (capture) `captureStream` or `toBlob`.

## 6. Non-goals

- iOS Safari.
- Cloud features of any kind.
- Generative AI edits (documented in TODO.md as deferred).
- Accounts, sync, multiplayer.
- App store packaging (a TWA wrapper can come later if wanted).

## 7. Acceptance for M1

1. Open `https://face.mxa.sh` on the target Android phone. Camera starts within 3 s after permission.
2. Face tracked at 24 fps or better at 720p with one warp active. Two faces both warped.
3. Tap Big Eyes: eyes grow, no fold artefacts, no jitter on a still face.
4. Tap capture: a JPEG appears, share sheet opens, WhatsApp or Viber receives it.
5. Airplane mode, reopen from the home screen icon: app loads and tracks.
6. DevTools network panel during 2 minutes of use: only same-origin requests.
7. Lighthouse PWA installable check passes.
