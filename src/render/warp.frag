precision highp float;
#define MAX_H 16
uniform sampler2D uTex;
uniform float uAspect;        // width / height of the video
uniform bool uMirror;
uniform int uCount;
uniform vec4 uHandle[MAX_H];  // cx, cy, r, strength (normalized video coords, r in x units)
uniform float uType[MAX_H];   // 0 scale, 1 swirl, 2 flip
varying vec2 vUv;

void main() {
  // Work in unmirrored video space. Flip the *display* only.
  vec2 uv = uMirror ? vec2(1.0 - vUv.x, vUv.y) : vUv;
  uv.y = 1.0 - uv.y;                             // image space: y down, same as the landmarks
  for (int i = 0; i < MAX_H; i++) {
    if (i >= uCount) break;
    vec4 h = uHandle[i];
    vec2 c = h.xy;
    vec2 d = uv - c;
    vec2 da = vec2(d.x, d.y / uAspect);          // isotropic distance in x units
    float dist = length(da);
    float r = h.z;
    if (dist >= r || r <= 0.0) continue;
    float t = dist / r;
    float f = (1.0 - t * t);
    f = f * f;                                    // flat at centre and rim, no folding
    if (uType[i] < 0.5) {
      // scale: strength>0 samples closer to centre (magnify), <0 samples farther (shrink)
      uv = c + d * (1.0 - h.w * f);
    } else {
      // 1 swirl: angle grows toward the centre. 2 flip: constant angle inside, feathered over the outer 30 %.
      float ang = uType[i] < 1.5 ? h.w * f : h.w * (1.0 - smoothstep(0.7, 1.0, t));
      float s = sin(ang), co = cos(ang);
      vec2 rot = vec2(co * da.x - s * da.y, s * da.x + co * da.y);
      uv = c + vec2(rot.x, rot.y * uAspect);
    }
  }
  uv = clamp(uv, 0.0, 1.0);
  gl_FragColor = texture2D(uTex, vec2(uv.x, 1.0 - uv.y)); // back to texture space (flipY)
}
