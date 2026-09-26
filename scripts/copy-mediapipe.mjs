import { cpSync, existsSync, mkdirSync } from 'node:fs';
const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dst = 'public/mediapipe/wasm';
if (!existsSync(src)) process.exit(0);
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log('copied mediapipe wasm to', dst);
