import { cpSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
const pkg = 'node_modules/@mediapipe/tasks-vision';
const dst = 'public/mediapipe';
if (!existsSync(pkg)) process.exit(0);
mkdirSync(`${dst}/wasm`, { recursive: true });
cpSync(`${pkg}/wasm`, `${dst}/wasm`, { recursive: true });
// Classic-script build (global `Vision`) for the face worker: importScripts works in classic workers, ES module workers cannot set the wasm loader's global ModuleFactory.
copyFileSync(`${pkg}/vision_bundle.js`, `${dst}/vision_bundle.js`);
console.log('copied mediapipe wasm + vision_bundle.js to', dst);
