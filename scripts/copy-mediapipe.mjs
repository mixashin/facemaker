import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
const pkg = 'node_modules/@mediapipe/tasks-vision';
if (!existsSync(pkg)) process.exit(0);
// Versioned path: the service worker caches wasm and models CacheFirst at their URL, so a new
// package version must live at a new URL or returning users pair new glue JS with an old wasm.
const ver = JSON.parse(readFileSync(`${pkg}/package.json`, 'utf8')).version;
rmSync('public/mediapipe', { recursive: true, force: true });
const dst = `public/mediapipe/${ver}`;
mkdirSync(`${dst}/wasm`, { recursive: true });
cpSync(`${pkg}/wasm`, `${dst}/wasm`, { recursive: true });
// Classic-script build (global `Vision`) for the face worker: importScripts works in classic workers, ES module workers cannot set the wasm loader's global ModuleFactory.
copyFileSync(`${pkg}/vision_bundle.js`, `${dst}/vision_bundle.js`);
console.log('copied mediapipe wasm + vision_bundle.js to', dst);
