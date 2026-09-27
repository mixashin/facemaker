// Needs warpChain.glsl in front. The quad shows the live face in face units, cut down to eyes and mouth.
uniform vec2 uNose;    // nose tip in the camera picture
uniform float uWidth;  // face width in x units
uniform float uRoll;   // roll of the head, radians
uniform float uSpan;   // face widths that the quad shows
uniform vec4 uWin[3];  // windows in face units: cx, cy, rx, ry

void main() {
  vec2 q = (vec2(vUv.x, 1.0 - vUv.y) - 0.5) * uSpan;   // face units, y down
  if (uMirror) q.x = -q.x;                             // the front camera shows a mirror
  float a = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 e = (q - uWin[i].xy) / uWin[i].zw;
    a = max(a, 1.0 - smoothstep(0.55, 1.0, length(e)));
  }
  if (a <= 0.0) discard;
  float c = cos(uRoll), s = sin(uRoll);
  vec2 d = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * uWidth;
  vec2 uv = warp(uNose + vec2(d.x, d.y * uAspect));
  gl_FragColor = vec4(texture2D(uTex, vec2(uv.x, 1.0 - uv.y)).rgb, a);
}
