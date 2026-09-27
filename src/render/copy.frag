precision highp float;
uniform sampler2D uTex;
varying vec2 vUv;

// First pass: the camera picture as it is. The stickers are drawn over it, then warp.frag bends both.
void main() {
  gl_FragColor = texture2D(uTex, vUv);
}
