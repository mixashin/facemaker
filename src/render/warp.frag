// Needs warpChain.glsl in front (renderer.ts joins the two).
void main() {
  // Work in unmirrored video space. Flip the *display* only.
  vec2 uv = uMirror ? vec2(1.0 - vUv.x, vUv.y) : vUv;
  uv.y = 1.0 - uv.y;                             // image space: y down, same as the landmarks
  uv = warp(uv);
  gl_FragColor = texture2D(uTex, vec2(uv.x, 1.0 - uv.y)); // back to texture space (flipY)
}
