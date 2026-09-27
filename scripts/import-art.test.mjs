import { describe, it, expect } from 'vitest';
import { inspectGlb } from './import-art.mjs';

// A glTF 2.0 binary with a JSON chunk only: enough for the checks that read the JSON
function glb(json) {
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const body = Buffer.from(text, 'utf8'), head = Buffer.alloc(20);
  head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + body.length, 8);
  head.writeUInt32LE(body.length, 12); head.write('JSON', 16, 'ascii');
  return Buffer.concat([head, body]);
}
const plain = (more = {}) => ({
  asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [{ count: 4, min: [-0.5, 0, -0.25], max: [0.5, 0.5, 0.25] }, { count: 6 }],
  animations: [{ name: 'fly' }],
  ...more,
});

describe('inspectGlb', () => {
  it('gives the facts of a plain file', () => {
    expect(inspectGlb(glb(plain()))).toEqual({ triangles: 2, size: [1, 0.5, 0.5], centre: [0, 0.25, 0], clips: ['fly'] });
  });
  it('refuses a file that is not a glTF 2.0 binary', () => {
    expect(() => inspectGlb(Buffer.from('not a model, only text'))).toThrow(/not a glTF/);
  });
  it('refuses a file that names a file outside itself', () => {
    expect(() => inspectGlb(glb(plain({ buffers: [{ uri: 'https://example.com/a.bin' }] })))).toThrow(/outside itself/);
    expect(() => inspectGlb(glb(plain({ images: [{ uri: 'skin.png' }] })))).toThrow(/outside itself/);
  });
  it('refuses extensions', () => {
    expect(() => inspectGlb(glb(plain({ extensionsUsed: ['KHR_draco_mesh_compression'] })))).toThrow(/extensions/);
  });
  it('refuses a root with a scale', () => {
    expect(() => inspectGlb(glb(plain({ nodes: [{ mesh: 0, scale: [2, 2, 2] }] })))).toThrow(/apply the transforms/);
  });
  // The loader reads a picture in the file with fetch from a blob: address. The CSP of the app
  // (connect-src 'self') stops that in the production build only: the prop has no colours there.
  it('refuses pictures in the file, until the app can load them under its CSP', () => {
    expect(() => inspectGlb(glb(plain({ images: [{ bufferView: 0, mimeType: 'image/png' }] })))).toThrow(/pictures in the file/);
  });
});
