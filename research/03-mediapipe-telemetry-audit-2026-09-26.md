# Audit: @mediapipe/tasks-vision telemetry (1.0.1 vs 0.10.35)

Date: 2026-09-26. Method: static read of the npm tarballs, no execution. Audit agent report, lightly edited. Companion: `01-tech-stack-2026-09-26.md` (blocker finding), `/research` pass on the Privacy Notice and ToS (same day).

## Summary

Every vision task created in 1.0.1 starts a JS logger. No opt-in, no opt-out, no consent gate. It POSTs a Clearcut-format protobuf to `https://odml.pa.googleapis.com/v1/log` every 60 s and on `close()`, authenticated with a Google API key embedded in the wasm. Cookies are not sent. The payload holds task type, running mode, delegate, SDK version, a coarse OS enum, and latency and count statistics. It holds no identifiers, no timestamps, no URLs, no model names, and no user content (no frames, landmarks, blendshapes, masks, audio). The HTTP request itself still exposes client IP, User-Agent, Origin and Referer, which is why Google puts consent on the integrator. 0.10.35 has no logger, no endpoint, no key blob.

## Files and license

| File | Bytes |
|---|---|
| package.json | 1192 |
| README.md | 9259 |
| vision.d.ts | 130545 |
| vision_bundle.cjs / .js / .mjs | about 155 KB each |
| wasm/vision_wasm_internal.wasm | 11756954 |
| wasm/vision_wasm_module_internal.wasm | 11756972 |
| wasm/vision_wasm_nosimd_internal.wasm | 10960242 |

No LICENSE file, no NOTICE file. package.json: `"license": "Apache-2.0"`, description "See the privacy notice at https://goo.gle/mediapipe-privacy". The 0.10.35 description has no privacy pointer.

## Privacy notice (README.md, verbatim)

```
### Privacy Notice

Last modified: June 5, 2026

When you use MediaPipe Tasks, processing of the input data (e.g. images, video,
text) takes place on device, and MediaPipe does not send that input data to
Google servers. As a result, you can use our MediaPipe Tasks APIs for
processing data that should not leave the device.

MediaPipe Tasks APIs send metrics about the performance and utilization of the
APIs in your app to Google. Google uses this metrics data to measure
performance, usage, debug, maintain and improve the MediaPipe Tasks, as further
described in our [Privacy Policy](https://policies.google.com/privacy).

**You are responsible for obtaining informed consent from your app users about
Google's processing of MediaPipe metrics data as required by applicable law.**
```

## Logger location and trigger

Four minified parts in `vision_bundle.mjs` near offsets 50600 to 55600: `Eh` (fetch transport), `Fh` (queue and 60 s flusher), `Dh` (metrics collector), `Nh`/`Mh`/`Oh` (event builders).

The logger starts unconditionally in the common factory used by `createFromOptions`, `createFromModelPath`, and `createFromModelBuffer`, right after the wasm module loads:

```
function(t,e){e=e.runningMode??"";var r=t.g.Sa();t.m=new Dh(t.C(),e,r)}(t,n),await t.v(n),t}
```

`t.C()` returns the task class name (for example `"FaceLandmarker"`). `Sa()` reads the API key from wasm:

```
Sa(){if("function"==typeof this.pa._mediapipeLoggerGetEncodedApiKey){let t=this.pa._mediapipeLoggerGetEncodedApiKey();return this.pa._decodeBase64(t)}}
```

Hooks in the TaskRunner base class: `setGraph` emits an init event (runs on creation and on every `setOptions`), `finishProcessing` emits a stats event at the first inference after 30 s since the last one, `close()` emits two final events and flushes. Per-inference start stamps are recorded with `performance.now()` before each detect call.

```
Fh=class{constructor(t){this.h=[],this.m=new Eh,this.j=t??"",this.g=setInterval(()=>{this.flush()},6e4)}close(){...clearInterval(this.g)...this.flush()}
```

## Endpoint and transport

```
this.m.send({url:"https://odml.pa.googleapis.com/v1/log",bb:"POST",la:1e4,body:r,hb:2,ab:{"Content-Type":"application/x-protobuf","x-goog-api-key":this.j},withCredentials:!1},...)
```

```
let i=await fetch(t.url,{method:t.bb,headers:{...t.ab},...t.body&&{body:t.body},...t.withCredentials&&{credentials:"include"},signal:t.la&&n?n.signal:null});200===i.status?e?.(await i.text()):r?.(i.status)
```

- `POST https://odml.pa.googleapis.com/v1/log`
- Headers: `Content-Type: application/x-protobuf`, `x-goog-api-key: <AIza... key decoded from a 52-char base64 blob in the wasm>`
- Timeout 10 s via AbortController. `withCredentials: false`, no cookies.
- Custom header plus protobuf content type make it a non-simple CORS request, so a preflight OPTIONS goes first.
- Browser adds client IP, User-Agent, Origin, Referer. The code does not set these.

Envelope: Clearcut LogRequest, field 2 (log source) = `1786`, field 3 = repeated LogEvent. Each LogEvent sets only field 6 with the serialized metrics proto. No request time, no event time, no client_info.

## Payload fields

Proto names inferred from minified code. Field numbers exact.

| Field | Source | User content? |
|---|---|---|
| LogRequest.2 log source | constant `1786` | No |
| ClientInfo.1 OS enum | `navigator.userAgent` regex: Android=1, iOS=2, Linux=3, Mac=4, Windows=5, else 0 (0 inside a Worker, no `window`) | No, enum only |
| ClientInfo.2, .3, .5 | always empty strings | No |
| ClientInfo.4 SDK version | constant `"1.0.1"` | No |
| ClientInfo.6 platform | constant `4` | No |
| Event.1 task enum | class name to int: FaceLandmarker=16, FaceDetector=15, HandLandmarker=10, PoseLandmarker=23, HolisticLandmarker=20, GestureRecognizer=8, ImageSegmenter=13, InteractiveSegmenter=18, ObjectDetector=14, ImageClassifier=11, ImageEmbedder=12 | No |
| Event.2 event type | 0 init, 1 periodic stats, 2 final on close | No |
| Init.1 running mode | IMAGE=11, VIDEO=12, LIVE_STREAM=13, AUDIO=14/15, else 10 | No |
| Init.3 init latency ms | logger construction to setGraph | No |
| Stats.1 running mode | as above | No |
| Stats.4 mean latency ms | total latency / completed inferences | No |
| Stats.5 max latency ms | | No |
| Stats.6 window duration ms | | No |
| Stats.7 dropped count | pending inferences older than current, plus unfinished at close | No |
| Stats.8 repeated {delegate, count} | 3 = CPU, 4 = GPU, with counts | No |

Not in the payload: model name or hash, wasm variant, error text, device model, screen, memory, core count, timestamps, any stable or random ID, cookies, page URL, host, images, landmarks, blendshapes, masks, embeddings, audio.

## Failure behavior

On any non-200, network error, or abort:

```
t=>{this.error=Error(`Logging failed with HTTP error: ${t}`),this.h=[],void 0!==this.g&&(clearInterval(this.g),this.g=void 0),e?.("net-send-failed",t)}
```

Queue discarded, interval cleared, all later events dropped, no retry. Per task instance: the next task created starts a fresh logger that tries once more.

## Disable path

- No option, env var, global, or flag. `TaskRunnerOptions` has only `baseOptions`.
- `enableLogging(options)` is declared in `vision.d.ts` line 2826 but has no implementation in any bundle. Calling it throws TypeError.
- No consent gate. Construction is unconditional.
- A missing wasm key does not stop sending. The POST goes out with an empty key header.

Workable blocks from outside the library:

1. CSP `connect-src` that excludes `odml.pa.googleapis.com`. The fetch throws, the logger self-disables after the first attempt.
2. Wrap `globalThis.fetch` (also inside the Worker) to reject that URL.
3. Service Worker, DNS, or firewall block.
4. Patch the bundle: remove the `setInterval` or make `flush` a no-op.
5. Pin 0.10.35.

## 0.10.35 comparison

Zero hits in bundles, d.ts, and wasm loader for `odml.pa`, `/v1/log`, `x-goog-api-key`, `application/x-protobuf`, `setInterval`, `_mediapipeLoggerGetEncodedApiKey`, `enableLogging`. README has no Privacy Notice. No `QUl6YV` key blob in any .wasm. Only fetches: model fetch and `initializeGraph`. License Apache-2.0, again no LICENSE file. The logger and endpoint are new in 1.0.x.

## Wasm check (1.0.1)

None of the three .wasm files contains `odml.pa`, `/v1/log`, `AIza`, `clearcut`, or `firebaselogging`. Their `googleapis` hits are `type.googleapis.com/...` proto Any URLs. Their `odml` hits are build paths and calculator names. Each holds one base64 API key blob read by JS. HTTP sending is JS-only. Loader network calls are standard Emscripten runtime code (wasm fetch with same-origin credentials, lazy-file XHR).

## Consequence for facemaker

- Pin `@mediapipe/tasks-vision@0.10.35`. No logger exists to block.
- Ship a meta CSP with `connect-src 'self'` anyway. It fences every library, present and future, and also blocks the ToS-described inbound "contact Google servers" channel.
- Before any future upgrade past 0.10.35: re-run this grep set on the new tarball and confirm the CSP still holds in a DevTools network test.
- Relevant upstream threads to watch: issues 6291, 6306, 6355, 4991.
