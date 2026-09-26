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

- Mode tabs on the main screen: faces (warps), stickers, text. A warp preset and a sticker pack can be active at the same time.
- Sticker packs from Twemoji SVGs (graphics CC-BY 4.0, code MIT), copied at install time, served from the app origin. Full-face animal masks (cat, dog, lion, frog, monkey, pig, panda, koala, ghost, disguise) scaled to the face oval, and props anchored to landmarks (sunglasses, glasses, crown, top hat, bow, flower, stars on cheeks, hearts on eyes, tongue). Scale with face width, rotate with head roll (eye line). Every tracked face gets the stickers.
- Text overlay: one line, typed in a native input, six colours, two fonts, drag to move, pinch to scale. Rendered in the WebGL scene so it is baked into photos and later videos. Serbian diacritics must render.
- Themes: neutral (default), girl, boy, cyberpunk. CSS custom properties on `data-theme`, persisted in localStorage, applied before first paint. Theme button on the main screen. No feature differences.
- i18n: `sr` (Latin script) and `en` JSON string tables, `t(key)`, auto-detect from `navigator.language` (any `sr`, `hr`, `bs` locale is Serbian), switch in settings, persisted.
- Settings sheet (gear): language, theme, restart tutorial, About.
- About sheet: plain-language privacy page first (camera stays on the device, nothing is sent, a photo leaves only via share, no accounts, no tracking) with a three-box data-flow picture, then attributions for every shipped dependency and asset with licence and link, generated from `package.json` plus a manual asset list.
- First-launch tutorial: 3 to 4 steps, icon plus one line, skip, shown once after the camera is live, restart from settings.
- New warp presets: no nose, big ears, double chin, fat face, upside-down face (constant rotation inside the face oval, feathered rim).

### M2b: Tools (gallery, parametric sliders, photo editor)

- Gallery: OPFS files under `photos/` and `thumbs/`; metadata from the file name (created, type) and the file handle (size); a sidecar `.json` for video duration when M3 needs it. No IndexedDB (decided 2026-09-26). Grid, tap to view, share, save, delete (two taps), clear all (two taps), storage usage in settings. `navigator.storage.persist()` requested once.
- Parametric morph sliders (advanced panel): nose, mouth, each eye, forehead, chin, ears. Modes: scale, wobble (sine-animated displacement), swirl (rotation inside radius).
- Post-capture sticker editor on a saved photo: moustache, pimples, sunglasses, googly eyes, party hats, caps. Move, resize, rotate. Saves a new photo to the gallery.

### M3: Video + voice

- Record: `canvas.captureStream(30)` + Web Audio `MediaStreamDestination` into `MediaRecorder`. mimeType order: `video/mp4;codecs=avc1,mp4a.40.2`, `video/mp4`, `video/webm;codecs=vp9,opus`, `video/webm`. `start()` in try/catch. Timeslice 1000 ms. Max 60 s per clip (advanced: configurable).
- Voice effects: SoundTouchJS worklets for pitch (chipmunk, deep, with formant correction), native nodes for robot (ring modulator), echo (delay + feedback), telephone (band-pass + bitcrush), monster (pitch down + distortion). Mic constraints: `echoCancellation`, `noiseSuppression`, `autoGainControl` all on by default (kids, speakers), off in advanced. Live monitoring off by default on phones.
- Audio-reactive scale: AnalyserNode volume drives a chosen sticker or warp handle.
- Gallery plays videos. WebM duration fix if webm was used.

### M4: Makeup, face-onto-image, backgrounds

- Makeup: lipstick, blush, eyeliner, skin smoothing (frequency separation). Mask texture from landmark rings.
- Face-onto-image: pick a target image (bundled set: orange, apple, cat, dog, lion, plus user photo). Detect landmarks in the target once (IMAGE mode). Live face mesh (468 vertices, tfjs triangulation) textured with the camera, positioned on the target's landmarks, feathered edge. Annoying-orange style.
- Animated backgrounds: ImageSegmenter selfie model (square 256), mask blur + sigmoid + 3-frame temporal smoothing, person over looping video or procedural shader. Sets: underwater, grasslands, spooky, space.

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
