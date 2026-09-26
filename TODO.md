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
- Voice: @soundtouchjs/audio-worklet + formant-correction-worklet (MPL-2.0), audit before install. Robot, echo, telephone from native Web Audio nodes.
- Gallery: in-app. OPFS files + IndexedDB metadata. Save to device and share buttons. persist() once.
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
- [ ] Tutorial step for M3: hold the shutter to record video, release to stop. Added to the tutorial when video ships.
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
