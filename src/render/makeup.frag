precision highp float;
uniform sampler2D uCam;   // the camera picture
uniform sampler2D uLook;  // the paint, in the flat face layout
uniform sampler2D uSkin;  // alpha: where skin is smoothed
uniform vec2 uSize;       // size of the render target in pixels
uniform float uRadius;    // blur radius in pixels, follows the size of the face
uniform float uSmooth;    // 0..1
varying vec2 vUv;

// Drawn on the face mesh, over the camera picture, before the stickers and before the warp.
// The output is opaque: the picture under this fragment, smoothed and painted.
void main() {
  vec2 p = gl_FragCoord.xy / uSize;
  vec3 col = texture2D(uCam, p).rgb;
  float k = uSmooth * texture2D(uSkin, vUv).a;
  if (k > 0.01) {
    // Frequency separation in one pass: blur, then put back only the strong detail (edges), not the fine (pores).
    vec3 sum = col;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 2.399963;                 // golden angle: an even spiral
      float r = sqrt((float(i) + 0.5) / 12.0) * uRadius;
      sum += texture2D(uCam, p + vec2(cos(a), sin(a)) * r / uSize).rgb;
    }
    vec3 blur = sum / 13.0;
    vec3 detail = col - blur;
    float edge = smoothstep(0.04, 0.14, length(detail));
    col = blur + detail * mix(1.0 - k, 1.0, edge);
  }
  vec4 m = texture2D(uLook, vUv);
  float light = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 paint = m.rgb * clamp(0.45 + light, 0.0, 1.25); // the paint keeps the light and the shadow of the face
  gl_FragColor = vec4(mix(col, paint, m.a), 1.0);
}
