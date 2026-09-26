// Writes src/about/attributions.json: every runtime dependency (from package.json) plus shipped assets.
// Run after any change to dependencies. The test src/about/attributions.test.ts fails when the list is stale.
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const url = (p) => p.homepage ?? (typeof p.repository === 'string' ? p.repository : p.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '');
// Packages whose package.json has no usable https homepage or repository.
const HOMEPAGE = { '@mediapipe/tasks-vision': 'https://www.npmjs.com/package/@mediapipe/tasks-vision' };

const deps = Object.keys(pkg.dependencies).sort().map((name) => {
  const p = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'));
  return { name, version: p.version, license: p.license, url: HOMEPAGE[name] ?? url(p) };
});

const assets = [
  { name: 'Twemoji graphics', version: JSON.parse(readFileSync('node_modules/@twemoji/svg/package.json', 'utf8')).version, license: 'CC-BY-4.0', url: 'https://github.com/jdecked/twemoji' },
  { name: 'MediaPipe Face Landmarker model', version: 'float16/1', license: 'Apache-2.0', url: 'https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker' },
  { name: 'Workbox', version: JSON.parse(readFileSync('node_modules/workbox-build/package.json', 'utf8')).version, license: 'MIT', url: 'https://github.com/GoogleChrome/workbox' },
];

writeFileSync('src/about/attributions.json', JSON.stringify([...deps, ...assets], null, 2) + '\n');
console.log('wrote', deps.length + assets.length, 'attributions');
