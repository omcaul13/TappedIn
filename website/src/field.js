// The floodlit field behind every page: one WebGL2 fragment shader draws a football field seen from the stands
// (mowing stripes, chalk yard lines and hash marks, light pools, haze and two banks of floodlights). Scrolling
// carries the camera down the field and the pointer moves it a little; the lights dim once you're past the top
// and come back up at the bottom of the page. With reduced motion it draws one still frame (and redraws only
// on resize). Without WebGL2 the .field element keeps its CSS gradient.

const VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uZ, uGlow, uWarm;
uniform vec2 uPtr;
out vec4 o;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { return noise(p) * .55 + noise(p * 2.03 + 7.1) * .3 + noise(p * 4.07 + 3.3) * .15; }
// Anti-aliased line: d is the distance to the line, w its half width, fw one pixel's footprint.
float line(float d, float w, float fw) { return 1. - smoothstep(w, w + fw, d); }

void main() {
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  vec3 ink = vec3(.043, .102, .071);
  vec3 cream = vec3(.914, .851, .69);
  vec3 lamp = mix(vec3(1., .95, .84), vec3(1., .74, .33), uWarm);

  // Camera in the stands: 11 yards up, looking down the field.
  vec3 ro = vec3(uPtr.x * 2.4, 11. + uPtr.y * 1.2, uZ);
  vec3 rd = normalize(vec3(uv.x, uv.y, 1.35));
  float pc = cos(.4), ps = sin(.4);
  rd = vec3(rd.x, rd.y * pc - rd.z * ps, rd.y * ps + rd.z * pc);

  vec3 col = ink * .7;
  float glow = .3 + .7 * uGlow;
  if (rd.y < -.001) {
    float t = -ro.y / rd.y;
    vec2 f = ro.xz + rd.xz * t; // yards: x across, y down the field
    float fw = t * 1.6 / uRes.y;
    // Turf: alternating mowed stripes every five yards, with grain that fades with distance.
    float stripe = mod(floor(f.y / 5.), 2.);
    vec3 a = vec3(.07, .17, .1), b = vec3(.09, .215, .128);
    vec3 turf = mix(a, b, stripe);
    turf *= .86 + .28 * fbm(f * vec2(2.2, .7)) * exp(-t * .01);
    float inField = step(abs(f.x), 26.65);
    turf = mix(turf * .62, turf, inField);
    // Chalk: yard lines every five yards, sidelines, and hash marks every yard.
    float chalk = line(abs(fract(f.y / 5. + .5) - .5) * 5., .1, fw) * inField;
    chalk = max(chalk, line(abs(abs(f.x) - 26.65), .12, fw));
    float hy = line(abs(fract(f.y + .5) - .5), .07, fw);
    chalk = max(chalk, hy * step(abs(abs(f.x) - 6.67), .45));
    chalk = max(chalk, hy * step(abs(abs(f.x) - 25.6), .45));
    chalk *= exp(-t * .006);
    turf = mix(turf, vec3(.86, .85, .78), chalk * .32);
    // Light pools from the towers (one pair every 60 yards) and a soft spot under the pointer.
    vec2 q = vec2(abs(f.x) - 22., mod(f.y + 30., 60.) - 30.);
    float pool = exp(-dot(q, q) / 900.);
    vec2 sp = uv - vec2(uPtr.x * .45, -.18 + uPtr.y * .12);
    pool += .55 * exp(-dot(sp, sp) * 9.);
    col = turf * (.3 + .95 * pool * glow) + lamp * pool * .05 * glow;
    // Haze toward the far end of the field.
    col = mix(col, mix(ink, cream * .22, .35 * glow), 1. - exp(-t * .009));
  } else {
    col = mix(ink * .8, ink * .5, smoothstep(0., .5, rd.y));
  }

  // Two light banks high left and right, with beams cutting through drifting haze.
  for (int i = 0; i < 2; i++) {
    float sgn = i == 0 ? -1. : 1.;
    vec2 L = vec2(sgn * (.5 * uRes.x / uRes.y - .04), .5);
    vec2 d = uv - L;
    float r = length(d);
    col += lamp * (.035 / (r * r * 40. + .6) + .6 * exp(-r * r * 220.)) * glow;
    // The beam: the angle from straight down, toward the middle of the field.
    float ang = atan(d.x * -sgn, -d.y);
    float beam = smoothstep(.28, 0., abs(ang - .62)) * smoothstep(1.9, .1, r);
    float haze = fbm(uv * vec2(2.2, 3.4) + vec2(uTime * .03 * sgn, uTime * .018));
    col += lamp * beam * haze * .22 * glow;
  }

  // Vignette, then a little dither so the dark gradients don't band.
  col *= 1. - .55 * dot(uv * vec2(.8, 1.1), uv * vec2(.8, 1.1));
  col += (hash(gl_FragCoord.xy + uTime) - .5) / 255.;
  o = vec4(col, 1.);
}`;

/** Render scale for the canvas: lower on phones and high-density screens, where the haze hides the softness. */
export function renderScale(dpr = 1, coarse = false) {
  return Math.min(dpr, 1.5) * (coarse ? 0.45 : 0.6);
}

/** How bright the lights are at a scroll position: full at the top, dim while reading, back up near the bottom. */
export function glowAt(scrollY, viewport, max) {
  const top = Math.max(0, 1 - scrollY / Math.max(1, viewport * 0.9));
  const bottom = max > 0 ? Math.max(0, 1 - (max - scrollY) / Math.max(1, viewport * 0.8)) : 0;
  return Math.max(top, bottom * 0.85);
}

export function startField(canvas, { reduce = false } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = Object.fromEntries(['uRes', 'uTime', 'uZ', 'uGlow', 'uWarm', 'uPtr'].map((n) => [n, gl.getUniformLocation(prog, n)]));

  const coarse = matchMedia('(pointer: coarse)').matches;
  let scale = renderScale(devicePixelRatio, coarse);
  const size = () => {
    canvas.width = Math.max(1, Math.round(innerWidth * scale));
    canvas.height = Math.max(1, Math.round(innerHeight * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  size();

  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!coarse && !reduce) {
    addEventListener('pointermove', (e) => {
      ptr.tx = (e.clientX / innerWidth) * 2 - 1;
      ptr.ty = -((e.clientY / innerHeight) * 2 - 1);
    }, { passive: true });
  }
  const state = { warm: 0, warmTo: 0, glow: 1 };
  const t0 = performance.now();
  let slow = 0;
  let last = t0;

  const draw = (now) => {
    const root = document.documentElement;
    const max = root.scrollHeight - root.clientHeight;
    const target = glowAt(scrollY, innerHeight, max);
    const k = reduce ? 1 : 0.08;
    state.glow += (target - state.glow) * k;
    state.warm += (state.warmTo - state.warm) * (reduce ? 1 : 0.05);
    ptr.x += (ptr.tx - ptr.x) * 0.05;
    ptr.y += (ptr.ty - ptr.y) * 0.05;
    const time = reduce ? 0 : (now - t0) / 1000;
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uTime, time);
    // Reduced motion: the camera stays put; only the lights' brightness follows the scroll.
    gl.uniform1f(u.uZ, reduce ? 0 : scrollY * 0.025 + time * 0.4);
    gl.uniform1f(u.uGlow, state.glow);
    gl.uniform1f(u.uWarm, state.warm);
    gl.uniform2f(u.uPtr, ptr.x, ptr.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const frame = (now) => {
    // A slow machine renders fewer pixels: after a run of long frames, drop the scale (not below 0.3).
    if (now - last > 24) slow++;
    else slow = Math.max(0, slow - 1);
    last = now;
    if (slow > 40 && scale > 0.3) {
      scale = Math.max(0.3, scale * 0.8);
      slow = 0;
      size();
    }
    draw(now);
    requestAnimationFrame(frame);
  };

  addEventListener('resize', () => {
    size();
    if (reduce) draw(performance.now());
  });
  if (reduce) {
    addEventListener('scroll', () => requestAnimationFrame(draw), { passive: true });
    draw(t0);
  } else requestAnimationFrame(frame);
  canvas.classList.add('on');
  // The switch demo warms the lights to amber during a commercial break.
  return { warm: (on) => (state.warmTo = on ? 1 : 0) };
}
