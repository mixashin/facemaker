precision highp float;
uniform sampler2D uTex;    // the camera picture
uniform sampler2D uMask;   // person mask, red channel, small. Row 0 is the top of the picture
uniform sampler2D uPlate;  // the scene
uniform sampler2D uFar;    // layer behind the person, drifts
uniform sampler2D uNear;   // layer in front of the person, sways
uniform vec2 uTexel;       // one texel of the mask
uniform vec2 uFit;         // scene uv = (uv - 0.5) * uFit + 0.5
uniform float uOn;         // 0: the camera picture as it is
uniform float uHasFar;
uniform float uHasNear;
uniform float uTime;       // seconds
uniform float uDrift;      // how far the far layer moves, in scene widths
uniform float uSway;       // how far the near layer moves
varying vec2 vUv;

// First pass, camera quad. No scene: the camera picture, unchanged. With a scene: the person over the scene.
// Makeup and stickers draw after this, the warp bends all of it.
void main() {
  vec4 cam = texture2D(uTex, vUv);
  if (uOn < 0.5) { gl_FragColor = cam; return; }
  // The mask has far fewer pixels than the picture: read it soft, then make the edge steep.
  vec2 mu = vec2(vUv.x, 1.0 - vUv.y);
  vec2 dx = vec2(uTexel.x * 1.5, 0.0), dy = vec2(0.0, uTexel.y * 1.5);
  float m = texture2D(uMask, mu).r * 0.4
    + (texture2D(uMask, mu + dx).r + texture2D(uMask, mu - dx).r + texture2D(uMask, mu + dy).r + texture2D(uMask, mu - dy).r) * 0.15;
  float person = smoothstep(0.35, 0.65, m);
  vec2 s = (vUv - 0.5) * uFit + 0.5;
  vec3 col = texture2D(uPlate, s).rgb;
  if (uHasFar > 0.5) {
    vec4 f = texture2D(uFar, s + vec2(uDrift * sin(uTime * 0.25), 0.0));
    col = mix(col, f.rgb, f.a);
  }
  col = mix(col, cam.rgb, person);
  if (uHasNear > 0.5) {
    vec4 n = texture2D(uNear, s + vec2(uSway * sin(uTime * 0.9 + s.y * 4.0), 0.0));
    col = mix(col, n.rgb, n.a);
  }
  gl_FragColor = vec4(col, 1.0);
}
