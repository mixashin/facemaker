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
