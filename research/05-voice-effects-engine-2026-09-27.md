# Research: real-time voice effects engine for the browser (M3)

Date: 2026-09-27. Method: /deepresearch, 5 angle agents (libraries, algorithms, effects catalogue, recording pipeline, pitfalls) plus 1 claim verifier, all on Opus 5.5 per the research agent definitions; web-research skill routing. One extra recording-pipeline report from an earlier Fable run was merged in.

Question: best real-time voice effect implementation (pitch up and down, optional formant preservation, robot, echo, telephone, monster) for a local-only kids camera PWA on Android Chrome and desktop Chrome, live mic through Web Audio, recorded together with the WebGL canvas via MediaRecorder. Licenses: MIT, Apache-2.0, BSD, MPL-2.0, Unlicense, CC0 only. Is SoundTouchJS maintained, and what are the alternatives?

## TL;DR

SoundTouchJS is not abandoned: the scoped `@soundtouchjs/*` packages had 16 releases between 2026-03 and 2026-08 (latest 2.1.1, MPL-2.0), the monorepo was updated in September 2026, and a formant-correction worklet exists. It stays a valid option, but it needs the full audit (five packages, a LICENSE file GitHub reports as "NOASSERTION", AI-assisted development). The smaller answer for a kids toy is the delay-line ("Jungle") pitch shifter built from native Web Audio nodes only, as Tone.js PitchShift does (MIT): two DelayNodes with sawtooth LFOs and a crossfade, about 60 lines, no AudioWorklet, no bundling or Android worklet-glitch traps, 30 to 100 ms latency, mild flutter, no formant preservation. Formant-preserving quality needs a spectral engine (SoundTouch formant worklet or Signalsmith Stretch, MIT WASM) and can come later. Robot, echo, telephone, monster, reverb, tremolo and chorus are native-node graphs. Recording: MP4 (H.264 + AAC) is on by default since Chrome 126 on Android, so record mp4 first without a timeslice, set the bitrate explicitly, and record a cropped second canvas.

## Key findings

- **[high]** SoundTouchJS scoped packages are maintained: `@soundtouchjs/audio-worklet` 0.5.0 (2026-03-09) through 2.1.1 (2026-08-03), 16 releases, MPL-2.0 (the rewrite moved off LGPL); monorepo `cutterbl/SoundTouchJS` pushed 2026-08-03, updated 2026-09-20; the old `soundtouchjs-audio-worklet` repo is archived (2026-03-09, still LGPL-2.1). `@soundtouchjs/formant-correction-worklet` 2.1.1 (MPL-2.0, LPC formant preservation) exists. Caveats for the audit: GitHub reports the monorepo license as NOASSERTION (LICENSE file is not a clean single MPL text), issue creation is restricted, the repo carries AI-assistant config files. [1, 2, 3, 10, V1, V2]
- **[high]** `SoundTouchNode` "works with any Web Audio source node", but the docs show only AudioBufferSourceNode and media-element examples, none for a live mic. WSOLA sequence window 50 to 125 ms bounds live latency. Pitch range 0.1 to 8 (±24 semitones); far-from-1 values give artifacts and buffer starvation. The processor file is self-contained (about 23 KB) and loads through a Vite `?url` import. [2, V3]
- **[high]** The delay-line two-tap crossfade shifter (Jungle, Tone.js PitchShift, `@audio/shift` delay) is the only surveyed method with bounded state and no frame latency. Tone.js builds it from native nodes only: two DelayNodes driven by sawtooth LFOs plus a crossfade LFO, default window 0.1 s, recommended 0.03 to 0.1 s (smaller = less delay, larger = smoother big intervals). Artifact: flutter at the crossfade rate. No formant preservation. Tone.js is MIT (LICENSE.md 2014-2025). [4, 5, 11, V6, V7]
- **[high]** Formant preservation needs a spectral method: cepstral envelope over a peak-locked phase vocoder (best formant score in the `@audio/shift` synthetic suite), or LPC residual excitation. Both add FFT frame latency (phaze 2048 samples, about 43 ms at 48 kHz; stftPitchShift 1024 default) and FFT CPU. PSOLA or WSOLA followed by resampling moves formants with f0; classic TD-PSOLA preserves them, but no permissive real-time TD-PSOLA worklet with pitch detection was found. stftPitchShift's author reports cepstral preservation works poorly at small shift factors. [4, 6, 7, 8, V7]
- **[medium]** Signalsmith Stretch is MIT, has an officially supported Web Audio release (WASM + AudioWorkletProcessor) on npm, offers formant compensation and formant shift with a rough f0 estimate, and a `splitComputation` flag that trades one interval of latency for even CPU. npm version, size and live-input support were not fetched. [9, V4]
- **[medium]** Phaze (`olvb/phaze`) is an Unlicense phase-vocoder AudioWorkletProcessor (Laroche-Dolson, 2048-sample blocks, shift quantized to FFT bins), effectively unmaintained since 2021 with 11 open PRs; its `fft.js` dependency license is unverified. Reference implementation only. [6, 7, V5]
- **[high]** Excluded by license: `rubberband-web` (GPL-2.0), unscoped `soundtouchjs` (LGPL-2.1), `pitch-shift-buffer-source` (Rubber Band based). Reported but not fetched: essentia.js (AGPL), Superpowered and elastique (commercial). [12, 1]
- **[high]** Native-node recipes, MIT (Chris Wilson, Audio-Input-Effects): telephone = two lowpass biquads at 2000 Hz plus two highpass at 500 Hz in series; robot ring modulator = OscillatorNode into a GainNode's `gain` AudioParam with base gain 0 (BBC Dalek uses a 30 Hz sine, its full diode model uses only native nodes plus a compressor); echo = DelayNode in a feedback loop with a GainNode; reverb = ConvolverNode with a generated impulse; distortion = WaveShaperNode; tremolo = gain LFO; vibrato and chorus = modulated DelayNode; bitcrusher. Speaker monitoring in that demo needs echoCancellation off and a 2048 Hz input low-pass against feedback (legacy constraint syntax; use `{ audio: { echoCancellation: false } }`). [13, 14, V15]
- **[medium]** Effect catalogue consensus in 2026 products: chipmunk and helium (pitch up 8 to 12 semitones), deep, bear or giant (pitch down), robot (ring mod about 30 Hz plus bitcrush or distortion), alien (+3 to 4 semitones plus ring mod or vibrato), monster or demon (−8 semitones plus distortion, reverb, tremolo), echo, radio, telephone, megaphone (band-pass plus bitcrush or distortion), ghost or cave (reverb). Snapchat applies effects after recording with tap-to-preview (record-then-play, no live monitoring). Shifts of 8 to 12 semitones produce audible artifacts in every product. No source on which effects children aged 6 to 12 prefer. [15, 16]
- **[high]** MediaRecorder MP4 (`video/mp4`, `avc1` + `mp4a.40.2`) is enabled by default from Chrome 126 on desktop, Android and WebView. The same chromestatus entry carries a stray "The feature does not support Android." risk text, a form artifact. Addpipe recorded MP4 H.264 on Chrome 147, Android 15, Galaxy S21 FE (video-only test). Firefox has no mp4, Safari no webm. Mobile-friendly string: `video/mp4; codecs="avc1.424028, mp4a.40.2"`. [17, 18, 19, V8]
- **[medium]** Chrome 147 MP4 output is fragmented MP4 with the `moov` atom first but duration 0: Windows 11 Media Player shows no duration and cannot seek, VLC plays it. WebM: from Chrome 140 a recording without timeslice or `requestData()` has a Duration element, a chunked one does not, and Cues are never written, so seeking in Chrome waits for a full parse. Chunk boundaries follow MP4 fragments, not the timeslice value. [20, 21, V9, V10]
- **[high]** `fix-webm-duration` is MIT, published as `@fix-webm-duration/fix` 1.0.1, needs the caller-measured duration in ms, and is a no-op when Duration is present. The ts-ebml based alternatives had their last release in 2022. [22, V11]
- **[medium]** Chrome's default `videoBitsPerSecond` is 2.5 Mbps at every resolution; at 720p and above that shows artifacts; Android Chrome often ignores the requested bitrate (1080p default measured 9.52 Mbps, a 1.5 Mbps request gave 2.02 Mbps). Set it explicitly and test. Addpipe also reports desktop Chrome 147 defaulting to H.264 inside WebM (single source, conflicts with the usual VP8 default). [23]
- **[high]** `canvas.captureStream()`: without a frameRate a frame is captured on every canvas change, `0` means `requestFrame()` only, `fps` is a cap, nothing is captured when nothing is painted, and the output size equals the canvas size, so a cropped recording needs a second canvas of the crop size; the canvas must be origin-clean. A 2018 Android bug stopped MediaRecorder silently on a 1280x720 canvas while 640x480 worked (current status unknown, test on the target phone). [24, 25, 26]
- **[medium]** Android AudioWorklet glitches: Chromium 40133762 (2020) was fixed in April 2021 with an adaptive PushPullFIFO for irregular AAudio callbacks (20 ms buffers firing every 40 ms); a non-default `latencyHint` triggered it; a Redmi 7A could not render three sine waves in a worklet. A 2025 report (web-audio-api issue 2632, one developer) says the fixed 128-frame quantum still crackles on mobile including Chrome Android recordings. Framework cost per quantum scales with the number of AudioParams. [27, 28, 29, V12]
- **[high]** AudioWorklet processes 128 frames per call (about 2.7 ms at 48 kHz, a 3 ms budget at 44.1 kHz); other block sizes need a ring buffer. WASM loads inside the worklet through Emscripten `SINGLE_FILE=1` synchronous compile in `addModule`, or a compiled module passed through `processorOptions`; `addModule()` does not await promises in the worklet scope. `latencyHint: 'interactive'` is the default and `baseLatency` reports the result. [30, 31]
- **[high]** Vite traps: a TypeScript worklet imported with `?url` is not transpiled (issue 9952, closed as duplicate, Stack Overflow 71078428 same); small assets under `build.assetsInlineLimit` become `data:` URLs (discussion 3804), which a strict CSP blocks; `AudioWorkletGlobalScope` has no `URL` (issue 9606 snippet). Ship the worklet as a plain `.js` in `public/` or as a separate build entry. [32, V13]

## Recommendation for facemaker M3

1. Pitch engine: native-node delay-line shifter (Tone.js PitchShift graph, MIT, reimplemented: two DelayNodes, two sawtooth LFOs, two crossfade LFOs, window 0.05 to 0.1 s). No AudioWorklet, no dependency, no audit, no Android worklet budget, no Vite bundling trap. Chipmunk +8, deep −6, monster −8 semitones plus distortion and reverb. Flutter is audible on long vowels and accepted for a toy. Formant preservation is not the mass-market baseline.
2. Upgrade path, only if the phone test disappoints: `@soundtouchjs/audio-worklet` plus `formant-correction-worklet` (MPL-2.0, maintained; full audit, read the monorepo LICENSE file first) or Signalsmith Stretch web build (MIT WASM). Both add 40 to 125 ms and a served worklet script.
3. Other effects: native node graphs from the MIT recipes (telephone, ring-mod robot, echo, reverb, distortion, tremolo, chorus). Keep AudioParam count low, `latencyHint` default, echoCancellation and noiseSuppression on for recording.
4. Voice mirror: record-then-play, the Snapchat pattern. No speaker monitoring.
5. Recording: `MediaRecorder.isTypeSupported` order mp4 (`avc1.424028, mp4a.40.2`) then webm; no timeslice for clips up to 60 s (WebM then carries Duration on Chrome 140+, fMP4 duration 0 only troubles Windows Media Player); `videoBitsPerSecond` set explicitly (4 Mbps); a second canvas at the cover-crop size feeds `captureStream(30)` and is drawn each render frame; test a 720p-class canvas on the Fold. Skip `fix-webm-duration` unless timeslice recording is added.

## Sources

| # | URL | Type | Quality | Angle | Tier |
|---|-----|------|---------|-------|------|
| 1 | https://github.com/cutterbl/SoundTouchJS | maintained repo | primary | libraries | t1 |
| 2 | https://registry.npmjs.org/@soundtouchjs/audio-worklet | npm registry JSON (readme, times) | primary | libraries | curl |
| 3 | https://github.com/cutterbl/SoundTouchJS/issues | repo issue list | primary | pitfalls | t1 |
| 4 | https://github.com/audiojs/shift (pitch-shift redirect) | repo README | primary | libraries, algorithms | t1 |
| 5 | https://raw.githubusercontent.com/Tonejs/Tone.js/dev/Tone/effect/PitchShift.ts | source code | primary | algorithms | curl |
| 6 | https://github.com/olvb/phaze | repo README | primary | libraries, algorithms | t1 |
| 7 | https://raw.githubusercontent.com/olvb/phaze/master/src/phase-vocoder.js | source code | primary | algorithms | curl |
| 8 | https://github.com/jurihock/stftPitchShift | repo README | primary | algorithms | t1 |
| 9 | https://github.com/Signalsmith-Audio/signalsmith-stretch | maintained repo | primary | libraries | t1 |
| 10 | https://github.com/cwilso/Audio-Input-Effects | repo | primary | libraries | t1 |
| 11 | https://cprimozic.net/blog/webaudio-audioworklet-optimization/ | blog | blog | pitfalls | t1 |
| 12 | https://github.com/delude88/rubberband-web | repo (GPL-2.0) | primary | libraries | t1 |
| 13 | https://raw.githubusercontent.com/cwilso/Audio-Input-Effects/master/js/effects.js | source code | primary | effects | t1 |
| 14 | https://github.com/bbc/webaudio.prototyping.bbc.co.uk/blob/master/src/ring-modulator.coffee | annotated source | primary | effects | t1 |
| 15 | https://soundtools.io/voice-changer/ | product page | blog | effects | t1 |
| 16 | https://voxbooster.com/blog/snapchat-voice-effects-2026/ | vendor blog | blog | effects | t1 |
| 17 | https://chromestatus.com/api/v0/features/5163469011943424 | official status JSON | primary | recording | curl |
| 18 | https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/mimeType | reference docs | secondary | recording | t1 |
| 19 | https://blog.addpipe.com/mediarecorder-video-bitrates/ | vendor blog, tested | blog | recording | t1 |
| 20 | https://blog.addpipe.com/duration-in-webm-videos-produced-by-chrome/ | vendor blog, tested | blog | recording | t1 |
| 21 | https://blog.addpipe.com/duration-in-mp4-files-produced-by-chrome-safari/ | vendor blog, tested | blog | recording | t1 |
| 22 | https://github.com/yusitnikov/fix-webm-duration | maintained repo | primary | recording | t1 |
| 23 | https://blog.addpipe.com/mediarecorder-video-bitrates/ | vendor blog, tested | blog | recording | t1 |
| 24 | https://developer.chrome.com/blog/capture-stream | official blog | primary | recording | t1 |
| 25 | https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream | official docs | primary | recording | t1 |
| 26 | https://paul.kinlan.me/chrome-bug-897727mediarecorder-using-canvas-capturestreamfails-for-large-canvas-elements-on-android/ | blog (Chrome DevRel) | blog | recording | t1 |
| 27 | https://issues.chromium.org/issues/40133762 | Chromium bug tracker | primary | pitfalls | t2 |
| 28 | https://github.com/WebAudio/web-audio-api/issues/2632 | spec repo issue | forum | pitfalls | t1 |
| 29 | https://github.com/GoogleChromeLabs/web-audio-samples/issues/189 | repo issue | forum | pitfalls | t1 |
| 30 | https://developer.chrome.com/blog/audio-worklet-design-pattern | official docs | primary | algorithms | t1 |
| 31 | https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext | official docs | primary | algorithms | t1 |
| 32 | https://github.com/vitejs/vite/issues/9952 | repo issue | primary | pitfalls | t1 |
| 33 | https://repository.gatech.edu/bitstreams/f4b1290d-061f-45ab-8016-dfa8240b024e/download | paper PDF (WAC 2016) | primary | algorithms | curl + pdftotext |
| 34 | https://tonejs.github.io/docs/PitchShift | official docs | unreliable | libraries | fail (0 chars) |
| 35 | https://stackoverflow.com/questions/66768989/glitchy-microphone-recording-in-audioworklet-on-android | Q&A | unreliable | pitfalls | fail |
| 36 | https://kanejaku.org/posts/2021/02/reducing-audio-glitches-on-chrome-for-android/ | blog | unreliable | pitfalls | fail |
| 37 | https://github.com/josephrocca/voicechanger.io | repo | unreliable | effects | fail (404) |
| 38 | https://webaudio.prototyping.bbc.co.uk/ring-modulator/ | demo page | unreliable | effects | fail (empty) |
| 39 | https://github.com/jaz303/ring-modulator | repo (no license) | unreliable | effects | t1 |
| 40 | https://issuetracker.google.com/issues/40127044 | bug tracker | unreliable | recording | fail (JS app) |
| 41 | https://chromestatus.com/feature/5163469011943424 | official status (HTML shell) | unreliable | recording | fail (22 chars) |
| V | Verifier extras: api.github.com repos for soundtouchjs-audio-worklet, SoundTouchJS, cwilso/Audio-Input-Effects; registry.npmjs.org/@soundtouchjs/formant-correction-worklet; signalsmith-audio.co.uk/code/stretch/web-audio/; Tone.js LICENSE.md; tonejs.github.io/docs/14.7.58/PitchShift; jsdelivr @fix-webm-duration/fix; stackoverflow 71078428; github.com/bluenviron/mediamtx/discussions/2831; github.com/WebAudio/web-audio-api/issues/2450; filmora.wondershare.com Snapchat voice page | primary, secondary | verify | curl, t1 |

## Contradictions / open questions

- chromestatus [17] gives Android 126 for MP4 recording and, in the same record, "The feature does not support Android." in `webview_risks`. The verifier reads the risk text as a form artifact. Confirm on the Fold with `MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')`, because Addpipe's Android test [19] recorded video only, not AAC audio.
- Addpipe [19] says desktop Chrome 147 records H.264 inside WebM by default. Common knowledge says VP8. Single source, platform-specific; irrelevant when mp4 is chosen first.
- `@audio/shift` [4] scores its cepstral formant method best on synthetic fixtures; stftPitchShift [8] says cepstral preservation works poorly at small shift factors. No measured speech comparison exists.
- `@audio/shift` labels `wsola` "speech, low-latency" but its own streaming wrapper buffers the whole input for wsola, psola, delay and lpc; those need a rewrite for live use.
- A 2026 ffmpeg-micro marketing post claims Chrome writes no WebM Duration at all; Addpipe's per-version test [20] says non-chunked recordings carry it since Chrome 140. The tested source wins.
- Unanswered: CPU cost of any pitch method on a mid-range Android phone; A/V sync when audio comes from a MediaStreamAudioDestinationNode; mic track behaviour when the tab goes to the background; Web Share of mp4 vs webm on Android messengers; battery cost of an idle AudioContext; whether SoundTouch's WSOLA stays balanced on a live source at tempo 1 (not tested by anyone fetched); which effects children prefer.

## Refuted claims

None found. One claim stayed unverified: the Snapchat 2026 effect list, "Deep Voice" name and "no formant correction" statement rest on vendor listicles only [16].

## Gotchas

- SoundTouchJS monorepo LICENSE reads as NOASSERTION on GitHub: read the file before any audit; the C++ SoundTouch original stays LGPL, only the JS rewrite is MPL-2.0; the unscoped `soundtouchjs` npm package is LGPL-2.1.
- Any AudioWorklet on Android: keep `latencyHint` at the default, keep per-quantum work small, use few AudioParams (control through `port.postMessage`), and test on a cheap phone.
- Vite: never import a `.ts` worklet with `?url`; watch `build.assetsInlineLimit` (data: URL vs CSP `script-src 'self'`); worklet scope has no `URL` or `window`.
- Recording without a timeslice gives one blob at stop; for a 60 s cap at 4 Mbps that is about 30 MB in memory, acceptable.
- fMP4 from Chrome has duration 0 in `moov`: Windows Media Player shows no seek bar; Chrome, Android and VLC play it. Not a blocker for share-to-messenger.
- A 1280x720 canvas killed MediaRecorder silently on Android in 2018 [26]; test the cropped recording canvas size on the Fold before trusting it.
- `cwilso/Audio-Input-Effects` LICENSE lives on branch `main` (the `master` URL 404s); jaz303/ring-modulator has no license, do not copy it; the BBC ring modulator source shows no license on the blob page, re-implement from the description.
- Prompt-injection hook false positives on MIT license text and JavaScript comments; treated as data.
- Fetch failures: Tone.js docs (0 chars at tier 1), one Stack Overflow page, kanejaku.org, voicechanger.io (404), the BBC demo page, the Google issue tracker and the chromestatus HTML shell (its JSON API works with curl, strip the `)]}'` prefix).

## Stats

angles 5 (plus 1 merged earlier report), sources fetched 41 (8 failed) plus 10 verifier fetches, claims extracted 111, verified 15 (confirmed 14, refuted 0, unverified 1), Firecrawl scrapes 0, SearXNG skipped yes (one angle used it for cross-check only), agents 6 on Opus 5.5 (5 earlier Fable angle agents stopped, 1 of them had completed).
