(function () {
'use strict';
const loadingEl = document.getElementById('loading');
if (!window.THREE || !THREE.OrbitControls) {
  loadingEl.textContent = 'The 3D library could not load. Check the connection and reload.';
  return;
}

const TAU = Math.PI * 2;
let _s = 0xA11CE55;
const R = () => { _s |= 0; _s = _s + 0x6D2B79F5 | 0; let t = Math.imul(_s ^ _s >>> 15, 1 | _s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const rnd = (a, b) => b === undefined ? R() * a : a + R() * (b - a);
const pick = (a) => a[(R() * a.length) | 0];
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const col = (h) => new THREE.Color(h);
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); };

const HALF = 200;
const WATER_Y = 0.15;
const LK = { cx: 0, cz: -6, rx: 40, rz: 78 };
const lakeAt = (x, z) => Math.hypot((x - LK.cx) / LK.rx, (z - LK.cz) / LK.rz);
const nearLake = (x, z, m = 1) => lakeAt(x, z) < m;
const NG = { cx: 2, cz: -52, rx: 14, rz: 11 };
const inNgoc = (x, z) => Math.hypot((x - NG.cx) / NG.rx, (z - NG.cz) / NG.rz) < 1;
const inBounds = (x, z) => Math.abs(x) < HALF - 6 && Math.abs(z) < HALF - 6;
const H = () => 0; // flat diorama slab
const groundY = () => 0.22;

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const LOW = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);
const DPR = Math.min(window.devicePixelRatio || 1, LOW ? 1.25 : 1.75);
renderer.setPixelRatio(DPR);
// DN: shadows off — painterly toon look
renderer.shadowMap.enabled = false;
const scene = new THREE.Scene();
const FOG = col('#e8b0a0');
scene.fog = new THREE.Fog(FOG, 380, 920);
scene.background = col('#f0a878');

const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2500);
const VIEWS = {
  overview: { pos: new THREE.Vector3(185, 155, 220), target: new THREE.Vector3(0, 6, -5) },
  painting: { pos: new THREE.Vector3(72, 12, 68), target: new THREE.Vector3(0, 5, -18) },
  fireworks: { pos: new THREE.Vector3(LK.cx + 85, 52, LK.cz + 75), target: new THREE.Vector3(LK.cx, 18, LK.cz) },
  street: { pos: new THREE.Vector3(LK.cx + LK.rx + 14, 3.8, LK.cz + 25), target: new THREE.Vector3(LK.cx + LK.rx + 28, 6, LK.cz + 5) },
};
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
camera.position.copy(VIEWS.overview.pos);
const controls = new THREE.OrbitControls(camera, canvas);
controls.target.copy(VIEWS.overview.target);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 18; controls.maxDistance = 500; controls.maxPolarAngle = Math.PI * 0.48;
controls.autoRotate = !reduceMotion; controls.autoRotateSpeed = 0.35;
controls.update();

const uTime = { value: 0 }, uNight = { value: 0 };
const grad = (() => {
  const d = new Uint8Array([70, 70, 70, 255, 140, 140, 140, 255, 220, 220, 220, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const toon = (c, extra) => new THREE.MeshToonMaterial(Object.assign({ color: c, gradientMap: grad }, extra || {}));
const basic = (c) => new THREE.MeshBasicMaterial({ color: c });
const dummy = new THREE.Object3D();

const hemi = new THREE.HemisphereLight(0xffd0a8, 0x4a3858, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb487, 1.35); sun.position.set(-180, 140, -90); scene.add(sun);
const fill = new THREE.DirectionalLight(0x8f86d0, 0.22); fill.position.set(120, 80, 160); scene.add(fill);

const glowTex = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.4)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});
const glowSprite = (color, size, opacity = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity, fog: false }));
  s.scale.set(size, size, 1); return s;
};

// sky
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uNight },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uNight; varying vec3 vP;
      void main(){
        float t = clamp(normalize(vP).y * 0.85 + 0.35, 0.0, 1.0);
        vec3 day = mix(vec3(0.98, 0.72, 0.5), mix(vec3(0.95, 0.58, 0.42), vec3(0.55, 0.62, 0.85), t), smoothstep(0.0, 0.7, t));
        vec3 night = mix(vec3(0.04, 0.05, 0.12), vec3(0.08, 0.1, 0.22), t);
        gl_FragColor = vec4(mix(day, night, uNight), 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat));
  const sunSpr = glowSprite(0xffc090, 110, 0.85); sunSpr.position.set(-500, 280, -250); scene.add(sunSpr);
  window.__sunSpr = sunSpr;
}

// thick base
{
  const top = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 24, 4, HALF * 2 + 24), toon(col('#5a5a58')));
  top.position.y = -1.6; scene.add(top);
  const dirt = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 28, 22, HALF * 2 + 28), toon(col('#3a2a22')));
  dirt.position.y = -14; scene.add(dirt);
  const under = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 36, 8, HALF * 2 + 36), toon(col('#241818')));
  under.position.y = -28; scene.add(under);
  // under-glow like DN floating island cue
  const ug = glowSprite(0xffb070, HALF * 2.4, 0.35); ug.position.set(0, -8, 0); ug.scale.set(HALF * 2.6, HALF * 2.6, 1); scene.add(ug);
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), toon(col('#6a6a62')));
ground.rotation.x = -Math.PI / 2; ground.position.y = 0; scene.add(ground);

// ---------------------------------------------------------------- Hoàn Kiếm water
const waterMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, uniforms: { uTime, uNight },
  vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `
    uniform float uTime; uniform float uNight; varying vec2 vUv; varying vec3 vW;
    void main(){
      vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
      float w1 = sin(p.x * 18.0 + p.y * 14.0 + uTime * 1.1) * 0.5 + 0.5;
      float w2 = sin(p.x * -11.0 + p.y * 20.0 + uTime * 0.7) * 0.5 + 0.5;
      vec3 deep = mix(vec3(0.12, 0.42, 0.48), vec3(0.04, 0.1, 0.16), uNight);
      vec3 shallow = mix(vec3(0.28, 0.58, 0.55), vec3(0.08, 0.16, 0.2), uNight);
      vec3 c = mix(shallow, deep, smoothstep(0.2, 0.9, r));
      c += vec3(0.18, 0.22, 0.2) * w1 * w2 * 0.1 * (1.0 - uNight);
      float fres = pow(1.0 - clamp(normalize(cameraPosition - vW).y, 0.0, 1.0), 2.0);
      c = mix(c, mix(vec3(0.92, 0.78, 0.65), vec3(0.15, 0.18, 0.3), uNight), fres * 0.5);
      float glitter = pow(max(0.0, sin(p.x * 40.0 + uTime) * sin(p.y * 36.0 - uTime * 0.8)), 8.0) * (1.0 - uNight);
      c += vec3(1.0, 0.92, 0.75) * glitter * 0.35;
      float a = smoothstep(1.02, 0.94, r) * 0.96;
      gl_FragColor = vec4(c, a);
    }`,
});
{
  const g = new THREE.CircleGeometry(1, 72); g.scale(LK.rx, LK.rz, 1); g.rotateX(-Math.PI / 2);
  const waterMesh = new THREE.Mesh(g, waterMat); waterMesh.position.set(LK.cx, WATER_Y, LK.cz); scene.add(waterMesh);
  const emb = new THREE.Mesh(new THREE.RingGeometry(LK.rx * 0.98, LK.rx * 1.06, 72), toon(col('#6a6860')));
  emb.rotation.x = -Math.PI / 2; emb.position.set(LK.cx, 0.08, LK.cz); emb.scale.set(1, LK.rz / LK.rx, 1); scene.add(emb);
  const walk = new THREE.Mesh(new THREE.RingGeometry(LK.rx * 1.06, LK.rx * 1.14, 72), toon(col('#8a9a78')));
  walk.rotation.x = -Math.PI / 2; walk.position.set(LK.cx, 0.1, LK.cz); walk.scale.set(1, LK.rz / LK.rx, 1); scene.add(walk);
}

// ---------------------------------------------------------------- roads: DN asphalt canvasTex ribbons
const roadTex = (() => {
  const t = canvasTex(64, 64, (g) => {
    g.fillStyle = '#8a84b0'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#5a557e'; g.fillRect(7, 0, 1, 64); g.fillRect(56, 0, 1, 64);
    g.fillStyle = '#3c3a5e'; g.fillRect(8, 0, 48, 64);
    g.fillStyle = '#d8d2e8'; g.fillRect(10, 0, 1, 64); g.fillRect(53, 0, 1, 64);
    g.fillStyle = '#f0c860'; g.fillRect(31, 0, 2, 36);
    for (let i = 0; i < 300; i++) { g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.06)'; g.fillRect(8 + R() * 48, R() * 64, 1, 1); }
    for (let y = 2; y < 64; y += 8) { g.fillStyle = 'rgba(40,36,70,0.25)'; g.fillRect(0, y, 7, 1); g.fillRect(57, y, 7, 1); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
})();
const roadMat = new THREE.MeshToonMaterial({ map: roadTex, gradientMap: grad, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const sidewalkMat = toon(col('#a8a090'));
const LAMP_POS = [];
function lampPost(x, y, z) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.5, 6), toon(col('#1d1d40'))); post.position.set(x, y + 2.75, z); scene.add(post);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), basic(col('#fff6d8'))); head.position.set(x, y + 5.6, z); scene.add(head);
  const gl = glowSprite(0xffe2a0, 9, 0); gl.position.copy(head.position); scene.add(gl); gl.userData.lamp = true;
  LAMP_POS.push([x, y, z, gl]);
}

function makePath(pts2, width, lamps = true) {
  const P = [];
  for (let i = 0; i < pts2.length - 1; i++) {
    const a = pts2[i], b = pts2[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
    for (let k = 0; k < n; k++) { const t = k / n; P.push(new THREE.Vector3(lerp(a[0], b[0], t), groundY(), lerp(a[1], b[1], t))); }
  }
  { const e = pts2[pts2.length - 1]; P.push(new THREE.Vector3(e[0], groundY(), e[1])); }
  const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
  const len = cum[cum.length - 1], half = width / 2;
  function at(d) {
    d = ((d % len) + len) % len;
    let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const a = P[lo], b = P[Math.min(P.length - 1, hi)], f = (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
    return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f), tx: tx / l, tz: tz / l };
  }
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1, nx = -tz / l * half, nz = tx / l * half;
    pos.push(P[i].x + nx, P[i].y, P[i].z + nz, P[i].x - nx, P[i].y, P[i].z - nz);
    uv.push(0, cum[i] / 10, 1, cum[i] / 10);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, roadMat));
  // sidewalks
  for (const sd of [-1, 1]) {
    const sp = [], si = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
      const nx = -tz / l, nz = tx / l;
      const i0 = half + 0.15, i1 = half + 2.4;
      sp.push(P[i].x + nx * i0 * sd, 0.14, P[i].z + nz * i0 * sd, P[i].x + nx * i1 * sd, 0.14, P[i].z + nz * i1 * sd);
      if (i) { const k = (i - 1) * 2; si.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setIndex(si); sg.computeVertexNormals();
    scene.add(new THREE.Mesh(sg, sidewalkMat));
  }
  if (lamps) for (let d = 8, k = 0; d < len - 5; d += 22, k++) {
    const q = at(d), sd = k % 2 ? 1 : -1;
    const x = q.x - q.tz * (half + 1.4) * sd, z = q.z + q.tx * (half + 1.4) * sd;
    if (nearLake(x, z, 1.05)) continue;
    lampPost(x, 0, z);
  }
  return { len, lane: width * 0.22, at, pts: pts2, width, P, cum };
}

// road network polylines
const WAYS = {};
{
  // ring around lake — close the promenade gap
  const ring = [];
  for (let i = 0; i <= 96; i++) {
    const a = i / 96 * TAU;
    ring.push([LK.cx + Math.cos(a) * (LK.rx + 14), LK.cz + Math.sin(a) * (LK.rz + 14)]);
  }
  WAYS.ring = ring;
  // N-S Old Quarter streets
  for (let xi = 0, x = -110; x <= 110; x += 16, xi++) {
    const pts = [];
    for (let z = -HALF + 12; z <= HALF - 12; z += 3) {
      if (nearLake(x, z, 1.12)) continue;
      pts.push([x + Math.sin(z * 0.02) * 0.6, z]);
    }
    // split into contiguous
    let seg = [], segs = [];
    for (const p of pts) {
      if (seg.length && Math.hypot(p[0] - seg[seg.length - 1][0], p[1] - seg[seg.length - 1][1]) > 12) { if (seg.length > 4) segs.push(seg); seg = []; }
      seg.push(p);
    }
    if (seg.length > 4) segs.push(seg);
    segs.forEach((s, j) => { WAYS['ns' + xi + '_' + j] = s; });
  }
  // E-W streets
  for (let zi = 0, z = -110; z <= 110; z += 15, zi++) {
    if (Math.abs(z - LK.cz) < LK.rz + 12) continue;
    const pts = [];
    for (let x = -HALF + 12; x <= HALF - 12; x += 3) {
      if (nearLake(x, z, 1.12)) continue;
      pts.push([x, z + Math.sin(x * 0.02) * 0.5]);
    }
    let seg = [], segs = [];
    for (const p of pts) {
      if (seg.length && Math.hypot(p[0] - seg[seg.length - 1][0], p[1] - seg[seg.length - 1][1]) > 12) { if (seg.length > 4) segs.push(seg); seg = []; }
      seg.push(p);
    }
    if (seg.length > 4) segs.push(seg);
    segs.forEach((s, j) => { WAYS['ew' + zi + '_' + j] = s; });
  }
  // Tràng Tiền avenue SE
  const tt = []; for (let x = 28; x < HALF - 10; x += 3) tt.push([x, 52 + Math.sin(x * 0.03) * 1.5]);
  WAYS.trangtien = tt;
}
const PATHS = {};
const WG = new Map(), WC = 20, wkey = (ix, iz) => ix * 4096 + iz;
for (const k in WAYS) {
  const w = k === 'ring' ? 10 : k === 'trangtien' ? 11 : 7.5;
  PATHS[k] = makePath(WAYS[k], w, true);
  const P = WAYS[k];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    for (let ix = Math.floor(Math.min(a[0], b[0]) / WC) - 1; ix <= Math.floor(Math.max(a[0], b[0]) / WC) + 1; ix++)
      for (let iz = Math.floor(Math.min(a[1], b[1]) / WC) - 1; iz <= Math.floor(Math.max(a[1], b[1]) / WC) + 1; iz++) {
        const key = wkey(ix, iz); let L = WG.get(key); if (!L) WG.set(key, L = []); L.push([a, b]);
      }
  }
}
function faceRoad(x, z) {
  let bd = 22, best = null, bestD = null;
  for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
    const L = WG.get(wkey(Math.floor(x / WC) + ix, Math.floor(z / WC) + iz)); if (!L) continue;
    for (const [a, b] of L) {
      const vx = b[0] - a[0], vz = b[1] - a[1], t = clamp(((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz || 1));
      const px = a[0] + vx * t, pz = a[1] + vz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = Math.atan2(px - x, pz - z); bestD = d; }
    }
  }
  return best === null ? null : { a: best, d: bestD };
}
function nearAnyWay(x, z, r) {
  for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
    const L = WG.get(wkey(Math.floor(x / WC) + ix, Math.floor(z / WC) + iz)); if (!L) continue;
    for (const [a, b] of L) {
      const vx = b[0] - a[0], vz = b[1] - a[1], t = clamp(((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz || 1));
      if (Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t) < r) return true;
    }
  }
  return false;
}
// zebra crosswalks at a few junctions
{
  const zebraM = basic(col('#d8d2e8'));
  zebraM.polygonOffset = true; zebraM.polygonOffsetFactor = -7;
  const spots = [[LK.cx + LK.rx + 14, LK.cz], [LK.cx, LK.cz + LK.rz + 14], [LK.cx - LK.rx - 14, LK.cz], [70, 52], [120, 53], [-80, 90]];
  for (const [x, z] of spots) {
    const fr = faceRoad(x, z); const yaw = fr ? fr.a + Math.PI / 2 : 0;
    for (let i = -3; i <= 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 7), zebraM);
      bar.position.set(x + Math.cos(yaw) * i * 0.9, 0.28, z + Math.sin(yaw) * i * 0.9);
      bar.rotation.y = yaw; scene.add(bar);
    }
  }
}

// ---------------------------------------------------------------- tube houses — DN InstancedMesh kit (Hanoi Old Quarter proportions)
const VN_WALLS = ['#cdb788', '#d6ccb8', '#c9a29e', '#a2b8a8', '#a2b0c6', '#d4d0cc', '#c8a690', '#b8aac6', '#cfbd98', '#b2bfac', '#e8c878', '#c45c48'].map(col);
const VN_TILES = ['#c8603a', '#b8502e', '#a0483a', '#d07044', '#8a3030'].map(col);
const SHUTTER_COLS = ['#9aa0b0', '#7a9a88', '#b0b4bc', '#6a8a9a'].map(col);
const houses = [];
const tubeOf = (x, z, ry, w) => ({
  x, z, y: -0.15, ry, w, d: rnd(9, 12.5), fl: pick([2, 3, 3, 3, 4, 4, 5, 5]), fh: 3.05,
  wall: pick(VN_WALLS), shop: R() < 0.88, sign: Math.floor(R() * 16), shutter: R() < 0.2,
  balc: R() < 0.72, tile: R() < 0.3, awning: R() < 0.4, tank: R() < 0.7, ac: R() < 0.72,
});

// place rows facing roads — dense Old Quarter
const placed = [];
const tooClose = (x, z, r) => placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < r);
for (const k in WAYS) {
  const P = WAYS[k], path = PATHS[k], half = (path.width || 8) / 2;
  for (let i = 1; i < P.length - 1; i += 1) {
    const a = P[i - 1], b = P[i + 1], tx = b[0] - a[0], tz = b[1] - a[1], L = Math.hypot(tx, tz) || 1;
    const nx = -tz / L, nz = tx / L;
    for (const sd of [-1, 1]) {
      // short row of tube houses pulled to pavement
      const cx = P[i][0] + nx * (half + 5.4) * sd, cz = P[i][1] + nz * (half + 5.4) * sd;
      if (!inBounds(cx, cz) || nearLake(cx, cz, 1.05) || inNgoc(cx, cz)) continue;
      const fr = faceRoad(cx, cz);
      const ryh = fr !== null ? fr.a : Math.atan2(-nx * sd, -nz * sd);
      const c = Math.cos(ryh), s = Math.sin(ryh);
      const ws = []; for (let n = pick([2, 2, 3, 3, 4]), k2 = 0; k2 < n; k2++) ws.push(rnd(3.8, 5.4));
      let off = -ws.reduce((a2, b2) => a2 + b2, 0) / 2;
      for (const w of ws) {
        const lx = off + w / 2; off += w;
        const hx = cx + lx * c, hz = cz - lx * s;
        if (!inBounds(hx, hz) || nearLake(hx, hz, 1.05) || nearAnyWay(hx, hz, half + 1.5) || tooClose(hx, hz, w * 0.55)) continue;
        houses.push(tubeOf(hx, hz, ryh, w)); placed.push([hx, hz]);
      }
    }
  }
}
// flood-fill remaining voids with face-road tubes
for (let pass = 0; pass < 2; pass++) {
  for (let x = -HALF + 10; x < HALF - 10; x += 4.2) {
    for (let z = -HALF + 10; z < HALF - 10; z += 4.2) {
      if (nearLake(x, z, 1.1) || inNgoc(x, z) || nearAnyWay(x, z, 5.5) || tooClose(x, z, 3.6)) continue;
      const fr = faceRoad(x, z);
      const ry = fr ? fr.a : (R() < 0.5 ? 0 : Math.PI / 2);
      const w = rnd(3.6, 5.2);
      houses.push(tubeOf(x + rnd(-0.4, 0.4), z + rnd(-0.4, 0.4), ry, w));
      placed.push([x, z]);
    }
  }
}

const geo = {
  box: (() => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; })(),
  gable: (() => {
    const g = new THREE.BufferGeometry();
    const v = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5];
    const pos = [], add = (...ids) => ids.forEach((i) => pos.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]));
    add(0, 2, 1); add(3, 4, 5); add(0, 3, 5); add(0, 5, 2); add(1, 2, 5); add(1, 5, 4);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
  })(),
  plane: new THREE.PlaneGeometry(1, 1),
  cyl: (() => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 10); g.translate(0, 0.5, 0); return g; })(),
};
const mats = { toon: () => toon(0xffffff), basic: () => new THREE.MeshBasicMaterial({ color: 0xffffff }) };
const parts = {};
function part(key, g, m, b, lx, ly, lz, rot, sx, sy, sz, color) {
  const c = Math.cos(b.ry), s = Math.sin(b.ry);
  (parts[key] || (parts[key] = { geo: geo[g] || geo.box, mat: mats[m], list: [] })).list.push([
    b.x + lx * c + lz * s, b.y + ly, b.z - lx * s + lz * c, b.ry + rot, sx, sy, sz, color,
  ]);
}
const wins = [];
const winAt = (b, lx, ly, lz, face, s) => {
  const c = Math.cos(b.ry), sn = Math.sin(b.ry), rot = face === 'side' ? -Math.PI / 2 : 0;
  wins.push({ x: b.x + lx * c + lz * sn, y: b.y + ly, z: b.z - lx * sn + lz * c, ry: b.ry + rot, s });
  const back = face === 'side' ? [lx + 0.03, lz] : [lx, lz - 0.03];
  part('frame', 'plane', 'basic', b, back[0], ly, back[1], rot, 1.5 * s, 1.3 * s, 1, col('#cfc8e6'));
};
const shade = (c, k) => c.clone().multiplyScalar(k);

// Hanoi shop signs
const SHOP_NAMES = [
  ['TẠP HÓA', '#2f6fc8'], ['CÀ PHÊ', '#5a3a2a'], ['PHỞ BÒ', '#c8302e'], ['BÚN CHẢ', '#e8a020'],
  ['BÁNH MÌ', '#d9442e'], ['BÚN RIÊU', '#2f9a5a'], ['NEM RÁN', '#1f7ab8'], ['CHẢ CÁ', '#b83a6a'],
  ['TIỆM VÀNG', '#b8282e'], ['NHÀ THUỐC', '#2f9a6a'], ['SỬA XE', '#3a4a8a'], ['TRÀ ĐÁ', '#d0608a'],
  ['ĐIỆN THOẠI', '#1f5ab0'], ['NHÀ NGHỈ', '#6a3a9a'], ['BIA HƠI', '#c84a20'], ['BÁNH CUỐN', '#e07a1a'],
];
const SUBS = ['Hà Nội', 'Mở cửa 6h - 22h', 'Giá bình dân', 'Ngon - Rẻ', 'Phục vụ tận nơi', 'Uy tín - Chất lượng'];
SHOP_NAMES.forEach(([name, bg], i) => {
  const tex = canvasTex(256, 96, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 256, 96);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(4, 4, 248, 3); g.fillRect(4, 89, 248, 3);
    g.fillStyle = i % 3 === 0 ? '#fff27a' : '#ffffff';
    g.font = 'bold 38px "Segoe UI", "Be Vietnam Pro", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 128, 40, 236);
    g.font = '15px "Segoe UI", Arial, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillText(SUBS[i % SUBS.length], 128, 74, 236);
  });
  tex.anisotropy = 4; mats['sign' + i] = () => new THREE.MeshBasicMaterial({ map: tex });
});
const shutterTex = canvasTex(64, 64, (g) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 4) {
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y, 64, 1);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, y + 1, 64, 1);
  }
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 58, 64, 6);
});
mats.shutter = () => toon(0xffffff, { map: shutterTex });
const INTERIORS = 6;
for (let v = 0; v < INTERIORS; v++) {
  const tex = canvasTex(128, 96, (g) => {
    const wall = pick(['#e8dcc0', '#dfe6e2', '#f0e4d0', '#e4dceb', '#efe2c4']), L = 30, Rr = 98, T = 22, B = 70;
    g.fillStyle = wall; g.fillRect(0, 0, 128, 96);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(L, T); g.lineTo(L, B); g.lineTo(0, 96); g.fill();
    g.beginPath(); g.moveTo(128, 0); g.lineTo(Rr, T); g.lineTo(Rr, B); g.lineTo(128, 96); g.fill();
    g.fillStyle = '#f6f2ea'; g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 0); g.lineTo(Rr, T); g.lineTo(L, T); g.fill();
    g.fillStyle = '#fffbe8'; g.fillRect(48, 9, 32, 3);
    g.fillStyle = pick(['#b8a890', '#c8c0b4', '#a89c8c']);
    g.beginPath(); g.moveTo(0, 96); g.lineTo(L, B); g.lineTo(Rr, B); g.lineTo(128, 96); g.fill();
    const goods = ['#d9442e', '#2f6fc8', '#f2c14e', '#3db08a', '#e86a9a', '#f4f0f4', '#8a5ad0', '#e8a020'];
    if (v % 3 === 2) {
      for (const [x, y, s] of [[44, 58, 0.8], [84, 58, 0.8], [30, 74, 1.1], [98, 74, 1.1]]) {
        g.fillStyle = '#e8e4ee'; g.fillRect(x - 9 * s, y, 18 * s, 4 * s);
        g.fillStyle = '#8a8a9a'; g.fillRect(x - 1, y + 4 * s, 2, 8 * s);
      }
      g.fillStyle = '#c8302e'; g.fillRect(L + 8, T + 6, Rr - L - 16, 8);
      g.fillStyle = '#fff2c0'; g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.fillText('THỰC ĐƠN', 64, T + 12.5);
    } else {
      for (let row = 0; row < 3; row++) {
        const y = T + 8 + row * 12;
        g.fillStyle = '#8a7058'; g.fillRect(L + 2, y + 9, Rr - L - 4, 2);
        for (let x = L + 4; x < Rr - 6; x += 5 + R() * 3) {
          g.fillStyle = pick(goods); const h = 5 + R() * 4; g.fillRect(x, y + 9 - h, 4, h);
        }
      }
      g.fillStyle = pick(['#6a4a3a', '#3a4a6a', '#e8e4ee']); g.fillRect(58, 56, 50, 16);
      g.fillStyle = '#e0b088'; g.beginPath(); g.arc(81, 38, 4.5, 0, TAU); g.fill();
    }
  });
  mats['interior' + v] = () => new THREE.MeshBasicMaterial({ map: tex, color: col('#e6e0d8') });
}

houses.forEach((b) => {
  const sh = b.w * 0.96 * 0.375, gf = 2.95 + sh + 0.45, top = gf + (b.fl - 1) * b.fh, fz = b.d / 2, dark = col('#3a3a4c');
  part('found', 'box', 'toon', b, 0, -0.3, 0, 0, b.w + 0.1, 0.75, b.d + 0.1, col('#6a6488'));
  part('wall', 'box', 'toon', b, 0, 0, 0, 0, b.w, top + 0.4, b.d, b.wall);
  if (b.shop) {
    if (b.shutter) part('shutter', 'plane', 'shutter', b, 0, 1.4, fz + 0.06, 0, b.w * 0.86, 2.6, 1, pick(SHUTTER_COLS));
    else {
      const iv = [1, 2, 3, 4, 5, 6, 7, 11, 14, 15].includes(b.sign) ? pick([2, 5]) : pick([0, 1, 3, 4]);
      part('interior' + iv, 'plane', 'interior' + iv, b, 0, 1.4, fz + 0.06, 0, b.w * 0.86, 2.6, 1, col('#ffffff'));
      for (const sx of [-1, 1]) part('jamb', 'box', 'toon', b, sx * b.w * 0.44, 0, fz + 0.08, 0, 0.18, 2.75, 0.14, shade(b.wall, 0.8));
      part('rolled', 'box', 'toon', b, 0, 2.6, fz + 0.18, 0, b.w * 0.9, 0.32, 0.32, col('#8a8e9a'));
      for (const sx of [-0.32, 0.32]) if (R() < 0.75) part('goods', 'box', 'toon', b, sx * b.w, 0, fz + 0.35, 0, 0.9, rnd(0.7, 1.3), 0.5, pick([col('#d9442e'), col('#2f6fc8'), col('#e8a020'), col('#3db08a'), col('#e8e4ee')]));
      if ([1, 2, 3, 4, 5, 6, 7, 11, 14, 15].includes(b.sign)) for (const sx of [-0.25, 0.25]) {
        part('table', 'box', 'toon', b, sx * b.w, 0, fz + 1.5, 0, 0.7, 0.45, 0.7, col('#e8e4ee'));
        for (const [ox, oz] of [[-0.55, 0], [0.55, 0]]) part('stool', 'box', 'toon', b, sx * b.w + ox, 0, fz + 1.5 + oz, 0, 0.32, 0.28, 0.32, pick([col('#d9442e'), col('#2f6fc8'), col('#3db08a')]));
      }
    }
    part('sign' + b.sign, 'plane', 'sign' + b.sign, b, 0, 2.95 + sh / 2, fz + 0.14, 0, b.w * 0.96, sh, 1, col('#d8d4dc'));
  } else {
    part('door', 'plane', 'basic', b, b.w * 0.18, 1.2, fz + 0.06, 0, 1.6, 2.4, 1, col('#3a5a4a'));
    winAt(b, -b.w * 0.24, 1.6, fz + 0.06, 'front', 0.9);
  }
  if (b.awning) part('awning', 'box', 'toon', b, 0, 2.85, fz + 0.75, 0, b.w * 0.98, 0.12, 1.5, pick([col('#d9442e'), col('#2f6fc8'), col('#3db08a'), col('#e8a020'), col('#f08aa8')]));
  for (let f = 1; f < b.fl; f++) {
    const y0 = gf + (f - 1) * b.fh;
    if (b.balc) {
      part('balcslab', 'box', 'toon', b, 0, y0 - 0.12, fz + 0.55, 0, b.w * 0.98, 0.22, 1.1, shade(b.wall, 0.92));
      part('balcrail', 'box', 'toon', b, 0, y0 + 0.1, fz + 1.07, 0, b.w * 0.98, 0.95, 0.06, dark);
      part('balcdoor', 'plane', 'basic', b, -b.w * 0.18, y0 + 1.15, fz + 0.06, 0, b.w * 0.36, 2.2, 1, col('#34405a'));
      winAt(b, b.w * 0.26, y0 + 1.55, fz + 0.06, 'front', 0.85);
    } else for (const sx of [-0.24, 0.24]) {
      winAt(b, sx * b.w, y0 + 1.55, fz + 0.06, 'front', 0.85);
      part('grille', 'box', 'toon', b, sx * b.w, y0 + 0.75, fz + 0.12, 0, 1.4, 0.08, 0.12, dark);
    }
    if (b.ac && (f + b.sign) % 2 === 0) part('ac', 'box', 'toon', b, (f % 2 ? -1 : 1) * b.w * 0.33, y0 + 2.35, fz + 0.3, 0, 0.9, 0.6, 0.45, col('#e8e8ee'));
  }
  part('parapet', 'box', 'toon', b, 0, top + 0.4, 0, 0, b.w + 0.12, 0.7, b.d + 0.12, shade(b.wall, 0.88));
  if (b.tile) part('tileroof', 'gable', 'toon', b, 0, top + 0.5, -b.d * 0.04, 0, b.w * 1.05, 1.9, b.d * 0.92, pick(VN_TILES));
  else {
    part('stairroom', 'box', 'toon', b, 0, top + 0.4, -b.d * 0.28, 0, b.w * 0.72, 2.5, b.d * 0.3, shade(b.wall, 0.95));
    part('tileroof', 'gable', 'toon', b, 0, top + 2.9, -b.d * 0.28, 0, b.w * 0.82, 1.0, b.d * 0.36, pick(VN_TILES));
    if (b.tank) {
      part('tankleg', 'box', 'toon', b, b.w * 0.18, top + 0.4, b.d * 0.12, 0, 1.2, 0.6, 1.2, dark);
      part('tank', 'cyl', 'toon', b, b.w * 0.18, top + 1.0, b.d * 0.12, 0, 1.15, 1.7, 1.15, col('#e4e8ee'));
    }
  }
});

for (const k in parts) {
  const P = parts[k];
  if (!P.list.length) continue;
  const m = new THREE.InstancedMesh(P.geo, P.mat(), P.list.length);
  P.list.forEach((e, i) => {
    dummy.position.set(e[0], e[1], e[2]); dummy.rotation.set(0, e[3], 0); dummy.scale.set(e[4], e[5], e[6]);
    dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, e[7]);
  });
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; scene.add(m);
}
const WIN_ON = ['#ffd56e', '#ffc070', '#ffe7a4', '#ffb860'].map(col), WIN_OFF = col('#2b2e60');
const winGeo = new THREE.PlaneGeometry(1.2, 1.0);
const winMesh = new THREE.InstancedMesh(winGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, wins.length));
const winState = wins.map(() => { const r = R(); return r < 0.45 ? 1 : 0; });
const winCol = wins.map(() => pick(WIN_ON));
wins.forEach((w, i) => {
  dummy.position.set(w.x, w.y, w.z); dummy.rotation.set(0, w.ry, 0); dummy.scale.set(w.s, w.s, 1);
  dummy.updateMatrix(); winMesh.setMatrixAt(i, dummy.matrix);
  winMesh.setColorAt(i, winState[i] ? winCol[i] : WIN_OFF);
});
if (wins.length) { winMesh.instanceMatrix.needsUpdate = true; winMesh.instanceColor.needsUpdate = true; scene.add(winMesh); }

// ---------------------------------------------------------------- landmarks
function addLandmarkGroup() {
  // Tháp Rùa
  const turtle = new THREE.Group();
  const stone = toon(col('#6a6458')), roof = toon(col('#8a3030'));
  const isle = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 14), toon(col('#4a6a42'))); isle.position.y = 0.5; turtle.add(isle);
  [[10, 3.5, 2.5], [7, 4.5, 6.5], [4.5, 3.5, 10.5]].forEach(([s, h, y]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(s, h, s), stone); b.position.y = y; turtle.add(b);
  });
  [[11, 4.5], [8, 8.8], [5.5, 12.8]].forEach(([s, y]) => { const r = new THREE.Mesh(new THREE.BoxGeometry(s, 0.7, s), roof); r.position.y = y; turtle.add(r); });
  const tip = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.2), basic(col('#e8c860'))); tip.position.y = 14.5; turtle.add(tip);
  const gl = glowSprite(0xffd070, 10, 0); gl.position.y = 14.5; turtle.add(gl); turtle.userData.glow = gl;
  turtle.position.set(LK.cx - 5, 0, LK.cz + 18); scene.add(turtle); window.__turtle = turtle;

  // Ngọc Sơn
  const ngoc = new THREE.Group();
  const cream = toon(col('#f2ead8')), red = toon(col('#a03028'));
  const plat = new THREE.Mesh(new THREE.BoxGeometry(26, 1.4, 20), toon(col('#5a7060'))); plat.position.y = 0.6; ngoc.add(plat);
  const hall = new THREE.Mesh(new THREE.BoxGeometry(14, 5.5, 10), cream); hall.position.y = 4; ngoc.add(hall);
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(16, 1.2, 12), red); r1.position.y = 7.2; ngoc.add(r1);
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(10, 1.0, 8), red); r2.position.y = 8.4; ngoc.add(r2);
  const gate = new THREE.Mesh(new THREE.BoxGeometry(6, 7, 2), cream); gate.position.set(0, 4.2, 9); ngoc.add(gate);
  const gr = new THREE.Mesh(new THREE.BoxGeometry(7, 1, 3), red); gr.position.set(0, 8, 9); ngoc.add(gr);
  ngoc.position.set(NG.cx, 0, NG.cz); scene.add(ngoc);

  // Cầu Thê Húc
  const huc = new THREE.Group(); const hred = toon(col('#c03830'));
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, x = lerp(36, 8, t), z = lerp(-38, -52, t), arch = Math.sin(t * Math.PI) * 3.2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 3.2), hred); deck.position.set(x, 1.2 + arch, z); huc.add(deck);
    for (const s of [-1.4, 1.4]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.8, 0.35), hred); post.position.set(x, 2.2 + arch, z + s); huc.add(post); }
    if (i % 2 === 1) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), basic(col('#ffd080'))); lamp.position.set(x, 3.2 + arch, z); huc.add(lamp);
      const lg = glowSprite(0xffc060, 3.5, 0); lg.position.copy(lamp.position); huc.add(lg); lg.userData.bridgeLantern = true;
    }
  }
  scene.add(huc);

  // Flag tower
  const ft = new THREE.Group(); const brick = toon(col('#a85840'));
  [[14, 5, 2.5], [9, 8, 9], [5, 12, 19]].forEach(([s, h, y]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(s, h, s), brick); m.position.y = y; ft.add(m); });
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.35, 10, 0.35), toon(col('#d8d0c0'))); pole.position.y = 30; ft.add(pole);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(5, 3.2, 0.15), basic(col('#da251d'))); flag.position.set(2.6, 32, 0); ft.add(flag);
  ft.position.set(-75, 0, -145); scene.add(ft);

  // Opera
  const op = new THREE.Group(); const yel = toon(col('#f0d878'));
  const body = new THREE.Mesh(new THREE.BoxGeometry(24, 10, 14), yel); body.position.y = 5; op.add(body);
  for (const sx of [-14, 14]) { const w = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 12), yel); w.position.set(sx, 4, 0); op.add(w); }
  for (let i = -3; i <= 3; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7, 0.7), toon(col('#f8f0d8'))); c.position.set(i * 2.8, 3.5, 7.5); op.add(c); }
  const dome = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 6), toon(col('#e8c860'))); dome.position.y = 12.5; op.add(dome);
  op.position.set(95, 0, 115); scene.add(op);
}
addLandmarkGroup();

// PROMENADE_FILL_V4 — kill empty ring around lake
{
  const umbCols = ['#e8533f', '#f2c14e', '#2fa4c8', '#f08aa8', '#3db08a', '#f4f0f4'].map(col);
  for (let a = 0; a < TAU; a += 0.09) {
    const x = LK.cx + Math.cos(a) * (LK.rx + 8.5), z = LK.cz + Math.sin(a) * (LK.rz + 8.5);
    // bench / planter strip
    const planter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 0.9), toon(col('#6a6860')));
    planter.position.set(x, 0.25, z); scene.add(planter);
    const bush = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.7), toon(col(pick(['#2f6840','#3a7a48','#4a8a50']))));
    bush.position.set(x, 0.85, z); scene.add(bush);
    if (R() < 0.45) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), toon(col('#e8e4f0'))); pole.position.y = 1.1; g.add(pole);
      const canopy = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.2, 8), toon(pick(umbCols))); canopy.position.y = 2.2; g.add(canopy);
      const stall = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 1.0), toon(col('#c8b090'))); stall.position.y = 0.4; g.add(stall);
      g.position.set(LK.cx + Math.cos(a + 0.04) * (LK.rx + 11), 0, LK.cz + Math.sin(a + 0.04) * (LK.rz + 11));
      scene.add(g);
    }
  }
}

// ---------------------------------------------------------------- trees in leftover gaps + promenade
const TREE_GREEN = ['#2f6840', '#3a7a48', '#4a8a50', '#2a5838'].map(col);
const treeParts = { trunk: [], crown: [] };
function addTree(x, z, s = 1) {
  if (!inBounds(x, z) || nearLake(x, z, 1.02) || nearAnyWay(x, z, 3.2) || tooClose(x, z, 2.2)) return;
  treeParts.trunk.push([x, 0, z, 0, 0.45 * s, 2.0 * s, 0.45 * s, col('#5a4030')]);
  for (let k = 0; k < 3; k++) {
    treeParts.crown.push([x + rnd(-0.6, 0.6) * s, (2.2 + k * 0.7) * s, z + rnd(-0.6, 0.6) * s, 0, rnd(1.6, 2.4) * s, rnd(1.4, 2.2) * s, rnd(1.6, 2.4) * s, pick(TREE_GREEN)]);
  }
  placed.push([x, z]);
}
for (let a = 0; a < TAU; a += 0.12) addTree(LK.cx + Math.cos(a) * (LK.rx + 10), LK.cz + Math.sin(a) * (LK.rz + 10), rnd(0.8, 1.15));
for (let x = -HALF + 8; x < HALF - 8; x += 5) for (let z = -HALF + 8; z < HALF - 8; z += 5) {
  if (R() < 0.55) addTree(x + rnd(-1, 1), z + rnd(-1, 1), rnd(0.65, 1.2));
}
{
  const tg = new THREE.BoxGeometry(1, 1, 1); tg.translate(0, 0.5, 0);
  for (const [key, list, mat] of [['trunk', treeParts.trunk, toon(0xffffff)], ['crown', treeParts.crown, toon(0xffffff)]]) {
    if (!list.length) continue;
    const m = new THREE.InstancedMesh(tg, mat, list.length);
    list.forEach((e, i) => { dummy.position.set(e[0], e[1], e[2]); dummy.rotation.set(0, e[3], 0); dummy.scale.set(e[4], e[5], e[6]); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, e[7]); });
    m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; scene.add(m);
  }
}

// ---------------------------------------------------------------- power poles + tangled wires (DN style)
{
  const conc = toon(col('#c9c5dc')), steel = toon(col('#5a5878')), wireMat = new THREE.MeshBasicMaterial({ color: col('#1c1b30') });
  const poles = [];
  for (const k in PATHS) {
    const path = PATHS[k], half = (path.width || 8) / 2;
    for (let d = 6, n = 0; d < path.len - 6; d += 28, n++) {
      const q = path.at(d), sd = n % 2 ? 1 : -1;
      const x = q.x - q.tz * (half + 1.8) * sd, z = q.z + q.tx * (half + 1.8) * sd;
      if (nearLake(x, z, 1.05) || !inBounds(x, z)) continue;
      poles.push({ x, z, tx: q.tx, tz: q.tz });
    }
  }
  const att = [];
  poles.forEach((p, i) => {
    const h = 11, y = 0;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.28, h, 10), conc); pole.position.set(p.x, y + h / 2, p.z); scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 0.14), steel);
    arm.position.set(p.x, y + h - 0.8, p.z); arm.rotation.y = -Math.atan2(p.tz, p.tx) + Math.PI / 2; scene.add(arm);
    const pts = [];
    for (const u of [-1.0, 0, 1.0]) {
      const ix = p.x - p.tz * u, iz = p.z + p.tx * u;
      pts.push(new THREE.Vector3(ix, y + h - 0.55, iz));
    }
    pts.push(new THREE.Vector3(p.x, y + h - 4.0, p.z));
    att.push(pts);
  });
  const wire = (a, b, sag, r) => {
    const pts = []; for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0))); }
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, r, 3), wireMat));
  };
  for (let i = 0; i < att.length - 1; i++) {
    if (att[i][0].distanceTo(att[i + 1][0]) > 55) continue;
    for (let k = 0; k < att[i].length; k++) {
      const d = att[i][k].distanceTo(att[i + 1][k]);
      wire(att[i][k], att[i + 1][k], d * (k < 3 ? 0.014 : 0.028), k < 3 ? 0.03 : 0.08);
    }
  }
  window.__poleCount = poles.length;
}

// ---------------------------------------------------------------- vehicles — DN-style scooters + cars with blinkers & gap following
const trimM = toon(col('#1c1b2c')), glassM = new THREE.MeshBasicMaterial({ color: col('#2b3058') });
const lightM = new THREE.MeshBasicMaterial({ color: col('#fff6d8') }), tailM = new THREE.MeshBasicMaterial({ color: col('#ff3a3a') });
const wheelMats = toon(col('#1a1a28'));
const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 10); wheelGeo.rotateZ(Math.PI / 2);
function vbox(g, w, h, d, x, y, z, m) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); g.add(mesh); return mesh; }
function makeSedan(base) {
  const g = new THREE.Group(), body = toon(col(base));
  vbox(g, 4.2, 0.7, 1.75, 0, 0.75, 0, body);
  vbox(g, 2.4, 0.7, 1.6, -0.15, 1.4, 0, glassM);
  vbox(g, 0.04, 0.2, 1.2, 2.12, 0.95, 0, lightM);
  vbox(g, 0.04, 0.2, 1.2, -2.12, 0.95, 0, tailM);
  const hl = glowSprite(0xfff2e0, 1.8, 0); hl.position.set(2.3, 0.95, 0); g.add(hl); g.userData.hl = hl;
  const wheels = [];
  for (const x of [1.3, -1.3]) for (const z of [-0.85, 0.85]) {
    const w = new THREE.Mesh(wheelGeo, wheelMats); w.scale.set(0.7, 0.7, 0.5); w.position.set(x, 0.35, z); g.add(w); wheels.push(w);
  }
  return { g, wheels, wr: 0.35, len: 4.2, wid: 1.75 };
}
function makeBike() {
  const g = new THREE.Group();
  const body = toon(col(pick(['#d9442e', '#2f6fc8', '#f4f0f4', '#1c1b2c', '#e8a020', '#3db08a', '#c0c4d0', '#f08aa8'])));
  const wheels = [];
  for (const x of [0.55, -0.55]) {
    const w = new THREE.Mesh(wheelGeo, wheelMats); w.scale.set(0.55, 0.55, 0.28); w.position.set(x, 0.28, 0); g.add(w); wheels.push(w);
  }
  vbox(g, 1.1, 0.45, 0.4, -0.1, 0.55, 0, body);
  vbox(g, 0.12, 0.65, 0.32, 0.4, 0.7, 0, body);
  vbox(g, 0.08, 0.08, 0.55, 0.42, 1.05, 0, trimM);
  // rider
  const shirt = toon(col(pick(['#f4f0f4', '#2f6fc8', '#e8533f', '#3db08a', '#f2c14e', '#9a5ad0'])));
  vbox(g, 0.28, 0.55, 0.35, -0.15, 1.2, 0, shirt);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), toon(col(pick(['#d9442e', '#f4f0f4', '#2f6fc8', '#1c1b2c']))));
  helm.position.set(-0.1, 1.65, 0); g.add(helm);
  vbox(g, 0.05, 0.1, 0.14, 0.5, 0.95, 0, lightM);
  const hl = glowSprite(0xfff2c8, 1.5, 0); hl.position.set(0.65, 0.95, 0); g.add(hl); g.userData.hl = hl;
  return { g, wheels, wr: 0.28, len: 1.8, wid: 0.55 };
}
function makeCityCar() {
  const c = pick([['#f4f2ee', '#1c1b2c'], ['#f2d04a', '#f4f2ee'], ['#8fd8c0', '#f4f2ee'], ['#e05a5a', '#1c1b2c'], ['#f2a8c0', '#f4f2ee']]);
  const g = new THREE.Group(), body = toon(col(c[0]));
  vbox(g, 3.0, 0.7, 1.55, 0, 0.75, 0, body);
  vbox(g, 2.2, 0.65, 1.45, -0.1, 1.4, 0, glassM);
  vbox(g, 2.0, 0.1, 1.5, -0.15, 1.8, 0, toon(col(c[1])));
  vbox(g, 0.04, 0.15, 1.1, 1.52, 1.0, 0, lightM);
  const hl = glowSprite(0xfff2e0, 1.5, 0); hl.position.set(1.65, 1.0, 0); g.add(hl); g.userData.hl = hl;
  const wheels = [];
  for (const x of [0.95, -0.95]) for (const z of [-0.75, 0.75]) {
    const w = new THREE.Mesh(wheelGeo, wheelMats); w.scale.set(0.65, 0.65, 0.45); w.position.set(x, 0.32, z); g.add(w); wheels.push(w);
  }
  return { g, wheels, wr: 0.32, len: 3.0, wid: 1.55 };
}

function densify(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.4) continue;
    if (q) {
      const n = Math.floor(Math.hypot(p[0] - q[0], p[1] - q[1]) / 1.5);
      for (let k = 1; k < n; k++) { const t = k / n; out.push([lerp(q[0], p[0], t), lerp(q[1], p[1], t), lerp(q[2] || 0.35, p[2] || 0.35, t)]); }
    }
    out.push([p[0], p[1], p[2] || 0.35]);
  }
  return out;
}
function makeRoute(raw, lane, closed) {
  let C = densify(raw.map((p) => [p[0], p[1], 0.35]));
  for (let it = 0; it < 3; it++) {
    const n0 = C.length;
    C = C.map((p, i) => {
      if (!closed && (i < 2 || i > n0 - 3)) return p;
      let sx = 0, sz = 0, sy = 0;
      for (let j = -2; j <= 2; j++) { const q = C[closed ? (i + j + n0) % n0 : clamp(i + j, 0, n0 - 1)]; sx += q[0]; sz += q[1]; sy += q[2]; }
      return [sx / 5, sz / 5, sy / 5];
    });
  }
  const n = C.length;
  const tan = C.map((p, i) => {
    const a = C[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = C[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    return [tx / l, tz / l];
  });
  let P = C.map((p, i) => [p[0] - tan[i][1] * lane, p[1] + tan[i][0] * lane, p[2]]);
  if (!closed) {
    const turn = (i, s, dir) => {
      const out = [], l = lane;
      for (let k = 1; k < 8; k++) {
        const th = k / 8 * Math.PI, c = Math.cos(th), sn = Math.sin(th), [tx, tz] = tan[i];
        out.push([C[i][0] + (-tz * c * s + tx * sn * dir) * l, C[i][1] + (tx * c * s + tz * sn * dir) * l, C[i][2]]);
      }
      return out;
    };
    P = [...P, ...turn(n - 1, 1, 1), ...C.map((_, i) => { const j = n - 1 - i; return [C[j][0] + tan[j][1] * lane, C[j][1] - tan[j][0] * lane, C[j][2]]; }), ...turn(0, -1, -1)];
  }
  const V = P.map(([x, z, y]) => new THREE.Vector3(x, y, z)), cum = [0];
  for (let i = 1; i <= V.length; i++) cum.push(cum[i - 1] + V[i % V.length].distanceTo(V[i - 1]));
  const len = cum[V.length];
  return {
    len,
    at(d) {
      d = ((d % len) + len) % len;
      let lo = 0, hi = V.length; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
      const a = V[lo], b = V[hi % V.length], f = (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
      const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
      return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f), tx: tx / l, tz: tz / l };
    },
  };
}

const ROUTES = {};
const TRAFFIC = {};
{
  // closed ring circuit
  ROUTES.ring = makeRoute(WAYS.ring, 2.2, true);
  ROUTES.ringR = makeRoute(WAYS.ring.slice().reverse(), 2.2, true);
  ROUTES.bikeRing = makeRoute(WAYS.ring, 3.8, true);
  ROUTES.bikeRingR = makeRoute(WAYS.ring.slice().reverse(), 3.8, true);
  TRAFFIC.ring = 10; TRAFFIC.ringR = 10; TRAFFIC.bikeRing = 16; TRAFFIC.bikeRingR = 16;
  // major streets as out-and-back
  let ri = 0;
  for (const k of Object.keys(WAYS)) {
    if (k === 'ring') continue;
    const P = WAYS[k]; if (P.length < 8) continue;
    const key = 'r' + (ri++);
    ROUTES[key] = makeRoute(P, 1.8, false);
    ROUTES['b' + key] = makeRoute(P, 3.2, false);
    TRAFFIC[key] = 4; TRAFFIC['b' + key] = 7;
    if (ri > 22) break;
  }
}

const cars = [];
for (const k in TRAFFIC) {
  const Rt = ROUTES[k], n = TRAFFIC[k], bike = k.startsWith('bike') || k.startsWith('b');
  for (let i = 0; i < n; i++) {
    const v = bike ? makeBike() : (R() < 0.45 ? makeCityCar() : makeSedan(pick(['#e8e4f0', '#3a3a5a', '#c0c4d0', '#b84050', '#506aa8', '#f0e8d8', '#f2d04a', '#35c3c8'])));
    v.blink = { L: [], R: [] };
    for (const [side, zs] of [['L', -1], ['R', 1]]) {
      for (const x of bike ? [v.len / 2 - 0.1] : [v.len / 2 - 0.05, -v.len / 2 + 0.05]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.18), new THREE.MeshBasicMaterial({ color: col('#ffb020') }));
        m.position.set(x, bike ? 0.9 : 0.95, zs * (v.wid / 2 - 0.05)); m.visible = false; v.g.add(m); v.blink[side].push(m);
        const gl = glowSprite(0xffa020, bike ? 1.0 : 1.5, 0.9); gl.position.copy(m.position); gl.visible = false; v.g.add(gl); v.blink[side].push(gl);
      }
    }
    scene.add(v.g);
    const d = Rt.len * (i + rnd(0.1, 0.85)) / n;
    const sp = bike ? rnd(9, 13) : rnd(8, 12);
    cars.push({ g: v.g, wheels: v.wheels, wr: v.wr, len: v.len, wid: v.wid, blink: v.blink, route: Rt, key: k, d, spd: sp, v: sp, spin: 0, q: Rt.at(d), hl: v.g.userData.hl });
  }
}

function updateTraffic(t, dt) {
  const blinkOn = (t * 2.4) % 1 < 0.5;
  for (const c of cars) {
    const q = c.q; let target = c.v;
    let turn = 0;
    for (const ahead of [6, 12, 18]) {
      const q1 = c.route.at(c.d + ahead), dot = clamp(q.tx * q1.tx + q.tz * q1.tz, -1, 1), ang = Math.acos(dot);
      if (ang > 0.35) { target = Math.min(target, lerp(c.v, 3.5, clamp((ang - 0.35) / 1.0))); if (!turn && ang > 0.8) turn = q.tx * q1.tz - q.tz * q1.tx > 0 ? 1 : -1; }
    }
    for (const m of c.blink.R) m.visible = turn > 0 && blinkOn;
    for (const m of c.blink.L) m.visible = turn < 0 && blinkOn;
    for (const o of cars) {
      if (o === c) continue;
      const dx = o.q.x - q.x, dz = o.q.z - q.z, ahead = dx * q.tx + dz * q.tz;
      if (ahead <= 0 || ahead > 22) continue;
      if (Math.abs(dx * q.tz - dz * q.tx) > (c.wid + o.wid) / 2 + 0.2 || o.q.tx * q.tx + o.q.tz * q.tz < 0.25) continue;
      target = Math.min(target, Math.max(0, (ahead - (c.len + o.len) / 2 - 1.5) * 1.4));
    }
    c.spd += clamp(target - c.spd, -14 * dt, 5 * dt);
    c.d += c.spd * dt;
  }
  for (const c of cars) {
    const q = c.q = c.route.at(c.d);
    c.g.position.set(q.x, q.y, q.z);
    c.g.rotation.y = -Math.atan2(q.tz, q.tx);
    c.spin -= c.spd * dt / c.wr;
    for (const w of c.wheels) w.rotation.z = c.spin;
  }
}

// ---------------------------------------------------------------- lanterns + fireworks
const lanterns = [];
{
  const cols = ['#ff7a40', '#ffd060', '#ff5080', '#ffe8a0', '#ff9040'].map(col);
  for (let i = 0; i < 40; i++) {
    const g = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 1.4), basic(pick(cols))); paper.material.transparent = true; paper.material.opacity = 0.9; g.add(paper);
    const gl = glowSprite(0xffb060, 4.5, 0); g.add(gl);
    g.visible = false; scene.add(g);
    lanterns.push({ g, gl, a: rnd(TAU), r: rnd(12, LK.rx * 0.85), h: rnd(6, 40), sp: rnd(0.12, 0.35), ph: rnd(TAU) });
  }
}
const FW_N = 3500;
const fwPos = new Float32Array(FW_N * 3), fwCol = new Float32Array(FW_N * 3), fwA = new Float32Array(FW_N), fwS = new Float32Array(FW_N);
const sparks = []; for (let i = 0; i < FW_N; i++) sparks.push({ life: 0 });
let sparkI = 0;
const fwGeo = new THREE.BufferGeometry();
fwGeo.setAttribute('position', new THREE.BufferAttribute(fwPos, 3));
fwGeo.setAttribute('aCol', new THREE.BufferAttribute(fwCol, 3));
fwGeo.setAttribute('aA', new THREE.BufferAttribute(fwA, 1));
fwGeo.setAttribute('aS', new THREE.BufferAttribute(fwS, 1));
const fwPts = new THREE.Points(fwGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { uDpr: { value: DPR } },
  vertexShader: `attribute vec3 aCol; attribute float aA; attribute float aS; uniform float uDpr; varying vec3 vC; varying float vA;
    void main(){ vA=aA; vC=aCol; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aS*uDpr*700.0/-mv.z; gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,r); gl_FragColor=vec4(vC*(0.6+0.8*a),a*vA); }`,
}));
fwPts.frustumCulled = false; scene.add(fwPts);
const FW_COLS = ['#ff4a5a', '#ffd34a', '#5fd8ff', '#c070ff', '#5dff8a', '#ffffff', '#ff8a2a'].map(col);
const shells = []; let nextShell = 0;
const spark = (x, y, z, vx, vy, vz, life, c, size, drag, grav) => {
  const s = sparks[sparkI]; sparkI = (sparkI + 1) % FW_N;
  Object.assign(s, { x, y, z, vx, vy, vz, life, max: life, c, size, drag, grav });
};
function burst(x, y, z, c) {
  for (let i = 0; i < 70; i++) {
    const a = R() * TAU, e = R() * Math.PI, sp = rnd(7, 20);
    spark(x, y, z, Math.cos(a) * Math.sin(e) * sp, Math.cos(e) * sp, Math.sin(a) * Math.sin(e) * sp, rnd(0.8, 1.6), c, rnd(1.6, 3), 1.4, 12);
  }
  if (soundOn) sfxBoom(x, y, z);
}
function updateFireworks(t, dt, on) {
  if (on && t > nextShell) {
    nextShell = t + rnd(0.5, 1.3);
    const a = rnd(TAU), r = rnd(0, 28);
    shells.push({ x: LK.cx + Math.cos(a) * r, y: WATER_Y + 1, z: LK.cz + Math.sin(a) * r, vy: rnd(36, 52), c: pick(FW_COLS), age: 0 });
  }
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i]; s.age += dt; s.y += s.vy * dt; s.vy -= 28 * dt;
    if (s.vy < 4 || s.age > 1.5) { burst(s.x, s.y, s.z, s.c); shells.splice(i, 1); }
  }
  for (let i = 0; i < FW_N; i++) {
    const s = sparks[i];
    if (s.life <= 0) { fwA[i] = 0; continue; }
    s.life -= dt; s.vx *= Math.exp(-s.drag * dt); s.vz *= Math.exp(-s.drag * dt); s.vy -= s.grav * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    fwPos.set([s.x, s.y, s.z], i * 3); fwCol.set([s.c.r, s.c.g, s.c.b], i * 3);
    fwA[i] = clamp(s.life / s.max); fwS[i] = s.size;
  }
  fwGeo.attributes.position.needsUpdate = true; fwGeo.attributes.aCol.needsUpdate = true;
  fwGeo.attributes.aA.needsUpdate = true; fwGeo.attributes.aS.needsUpdate = true;
}

// ---------------------------------------------------------------- post (bloom + vignette — paint pass can wait)
const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uNight },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uNight; varying vec2 vUv;
    void main(){
      vec2 px = 1.5 / uRes;
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 b = texture2D(tDiffuse, vUv+px*vec2(1,0)).rgb + texture2D(tDiffuse, vUv+px*vec2(-1,0)).rgb
             + texture2D(tDiffuse, vUv+px*vec2(0,1)).rgb + texture2D(tDiffuse, vUv+px*vec2(0,-1)).rgb;
      b *= 0.25;
      vec3 outc = c.rgb + max(b - 0.48, 0.0) * 0.7;
      outc = mix(outc, outc * vec3(1.06, 0.98, 0.9), 0.35 * (1.0 - uNight));
      float v = smoothstep(1.2, 0.3, length(vUv - 0.5));
      outc *= 0.82 + 0.18 * v;
      gl_FragColor = vec4(outc, 1.0);
    }`,
});
const postScene = new THREE.Scene();
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  rt.setSize(Math.floor(w * DPR), Math.floor(h * DPR));
  postMat.uniforms.tDiffuse.value = rt.texture;
  postMat.uniforms.uRes.value.set(w * DPR, h * DPR);
}
window.addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- UI
let fly = null;
const flyTo = (v) => { fly = { t: 0, p0: camera.position.clone(), q0: controls.target.clone(), to: v }; }; window.__flyTo = flyTo; window.__VIEWS = VIEWS; window.__camera = camera; window.__controls = controls;
const orbitBtn = document.getElementById('orbit'), followBtn = document.getElementById('follow');
let follow = -1, followYaw = 0, followPitch = 0, followZoom = 1, followDrag = false;
const stopFollow = () => { follow = -1; controls.minDistance = 18; controls.enabled = true; followBtn.setAttribute('aria-pressed', 'false'); followBtn.textContent = 'Follow a scooter'; };
document.getElementById('view').addEventListener('click', () => { stopFollow(); flyTo(VIEWS.painting); controls.autoRotate = false; orbitBtn.setAttribute('aria-pressed', 'false'); });
document.getElementById('overview').addEventListener('click', () => { stopFollow(); flyTo(VIEWS.overview); });
followBtn.addEventListener('click', () => {
  follow = (follow + 1) % cars.length; fly = null; followYaw = 0; followPitch = 0; followZoom = 1;
  controls.minDistance = 1; controls.enabled = false; controls.autoRotate = false; orbitBtn.setAttribute('aria-pressed', 'false');
  followBtn.setAttribute('aria-pressed', 'true'); followBtn.textContent = 'Around the lake ›';
});
orbitBtn.addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; orbitBtn.setAttribute('aria-pressed', String(controls.autoRotate)); });
{
  let px = 0, py = 0;
  canvas.addEventListener('pointerdown', (e) => { if (follow < 0) return; followDrag = true; px = e.clientX; py = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} });
  canvas.addEventListener('pointermove', (e) => { if (!followDrag || follow < 0) return; followYaw -= (e.clientX - px) * 0.006; followPitch = clamp(followPitch - (e.clientY - py) * 0.003, -0.2, 1); px = e.clientX; py = e.clientY; });
  const up = () => { followDrag = false; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { if (follow < 0) return; e.preventDefault(); followZoom = clamp(followZoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.6, 2.2); }, { passive: false });
}

let timeTarget = 0, timeV = 0, nightOn = false;
const nightBtn = document.getElementById('night');
const setTime = (v) => { timeTarget = clamp(v); nightOn = timeTarget > 0.5; nightBtn.setAttribute('aria-pressed', String(nightOn)); nightBtn.textContent = nightOn ? 'Golden hour' : 'Night'; };
nightBtn.addEventListener('click', () => setTime(nightOn ? 0 : 1));
document.getElementById('fwview').addEventListener('click', () => {
  stopFollow(); controls.autoRotate = false; orbitBtn.setAttribute('aria-pressed', 'false');
  if (!nightOn) nightBtn.click(); if (lanternOn) endLantern(); flyTo(VIEWS.fireworks);
});

const WX = ['Clear sky', 'Rain', 'Mist'];
let wxMode = 0, wxRain = 0;
const wxBtn = document.getElementById('weather');
wxBtn.addEventListener('click', () => { wxMode = (wxMode + 1) % 3; wxBtn.textContent = WX[wxMode]; wxBtn.setAttribute('aria-pressed', String(wxMode > 0)); });
const RAIN_N = 4000, rainPos = new Float32Array(RAIN_N * 6), rainSeed = new Float32Array(RAIN_N * 4);
for (let i = 0; i < RAIN_N; i++) { rainSeed[i * 4] = R() * 140; rainSeed[i * 4 + 1] = R() * 140; rainSeed[i * 4 + 2] = R(); rainSeed[i * 4 + 3] = rnd(0.8, 1.2); }
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: col('#dfe4f4'), transparent: true, opacity: 0, depthWrite: false, fog: false }));
rain.visible = false; scene.add(rain);

let lanternOn = false, lanternT = 0;
const lanternBtn = document.getElementById('lantern');
const endLantern = () => { lanternOn = false; lanternBtn.setAttribute('aria-pressed', 'false'); lanterns.forEach((L) => { L.g.visible = false; }); };
lanternBtn.addEventListener('click', () => {
  if (lanternOn) { endLantern(); return; }
  stopFollow(); controls.autoRotate = false; orbitBtn.setAttribute('aria-pressed', 'false');
  if (timeTarget < 0.95) setTime(1);
  flyTo({ pos: new THREE.Vector3(LK.cx + 48, 18, LK.cz + 58), target: new THREE.Vector3(LK.cx, 14, LK.cz - 8) });
  lanternOn = true; lanternT = 0; lanternBtn.setAttribute('aria-pressed', 'true');
  lanterns.forEach((L) => { L.g.visible = true; L.h = rnd(5, 18); });
});

let AC = null, master = null, soundOn = false; const snd = {};
const soundBtn = document.getElementById('sound');
function initAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return false;
  AC = new Ctx(); master = AC.createGain(); master.gain.value = 0; master.connect(AC.destination);
  const buf = (sec, fill) => { const b = AC.createBuffer(1, Math.floor(AC.sampleRate * sec), AC.sampleRate); fill(b.getChannelData(0)); return b; };
  snd.brown = buf(4, (d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
  snd.white = buf(3, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
  const loop = (b, ...nodes) => { const s = AC.createBufferSource(); s.buffer = b; s.loop = true; let n = s; for (const x of nodes) { n.connect(x); n = x; } const g = AC.createGain(); g.gain.value = 0; n.connect(g); g.connect(master); s.start(); return g; };
  const filt = (type, f) => { const b = AC.createBiquadFilter(); b.type = type; b.frequency.value = f; return b; };
  snd.city = loop(snd.brown, filt('lowpass', 180)); snd.rain = loop(snd.white, filt('highpass', 900)); snd.filt = filt;
  return true;
}
soundBtn.addEventListener('click', () => {
  if (!AC && !initAudio()) { soundBtn.textContent = 'No sound'; return; }
  soundOn = !soundOn; if (AC.state === 'suspended') AC.resume();
  master.gain.setTargetAtTime(soundOn ? 0.85 : 0, AC.currentTime, 0.25);
  soundBtn.setAttribute('aria-pressed', String(soundOn)); soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off';
});
const tmpV = new THREE.Vector3();
function sfxBoom(x, y, z) {
  if (!AC || !soundOn) return;
  const d = camera.position.distanceTo(tmpV.set(x, y, z)), when = AC.currentTime + Math.min(1, d / 400), g = clamp(120 / d, 0.05, 0.8);
  const s = AC.createBufferSource(); s.buffer = snd.brown; const f = snd.filt('lowpass', rnd(100, 200)); const og = AC.createGain();
  s.connect(f); f.connect(og); og.connect(master);
  og.gain.setValueAtTime(0, when); og.gain.linearRampToValueAtTime(g, when + 0.01); og.gain.exponentialRampToValueAtTime(0.001, when + 1.2);
  s.start(when); s.stop(when + 1.3);
}

const FOG_DAY = FOG.clone(), FOG_NIGHT = col('#1a1830');
const HEMI_DAY = hemi.color.clone(), HEMI_NIGHT = col('#3a4a78');
function updateNight(t, dt) {
  timeV += clamp(timeTarget - timeV, -dt * 0.35, dt * 0.35);
  const n = uNight.value = sstep(0.3, 0.95, timeV);
  FOG.copy(FOG_DAY).lerp(FOG_NIGHT, n); scene.fog.color.copy(FOG);
  scene.background.copy(col('#f0a878')).lerp(col('#0c0e1c'), n);
  hemi.intensity = lerp(0.9, 0.35, n); hemi.color.copy(HEMI_DAY).lerp(HEMI_NIGHT, n);
  sun.intensity = lerp(1.35, 0.12, n); fill.intensity = lerp(0.22, 0.4, n);
  if (window.__sunSpr) window.__sunSpr.material.opacity = (1 - n) * 0.85;
  const te = Math.max(timeV, wxRain * 0.3);
  // staged window lights
  if (wins.length && winMesh.instanceColor) {
    for (let i = 0; i < wins.length; i++) {
      const th = (i % 17) / 17 * 0.4;
      const on = te > 0.15 + th && winState[i];
      winMesh.setColorAt(i, on ? winCol[i] : WIN_OFF);
    }
    winMesh.instanceColor.needsUpdate = true;
  }
  scene.traverse((o) => {
    if (o.userData && o.userData.lamp) o.material.opacity = sstep(0.05, 0.4, te) * 0.9;
    if (o.userData && o.userData.bridgeLantern) o.material.opacity = sstep(0.05, 0.35, te) * 0.9;
  });
  for (const c of cars) if (c.hl) c.hl.material.opacity = n * 0.85;
  if (window.__turtle && window.__turtle.userData.glow) window.__turtle.userData.glow.material.opacity = sstep(0.15, 0.5, te) * 0.85;

  wxRain += ((wxMode === 1 ? 1 : 0) - wxRain) * Math.min(1, dt * 0.5);
  rain.visible = wxRain > 0.02; rain.material.opacity = 0.4 * wxRain;
  if (rain.visible) {
    const c = camera.position;
    for (let i = 0; i < RAIN_N; i++) {
      const sp = rainSeed[i * 4 + 3];
      const x = c.x - 70 + ((rainSeed[i * 4] + t * 5) % 140);
      const z = c.z - 70 + (rainSeed[i * 4 + 1] % 140);
      const y = c.y - 40 + ((rainSeed[i * 4 + 2] * 100 - t * 70 * sp) % 100 + 100) % 100;
      rainPos.set([x, y, z, x - 0.3, y + 2.4 * sp, z], i * 6);
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  scene.fog.near = lerp(380, 80, wxRain); scene.fog.far = lerp(920, 280, wxRain);
  updateFireworks(t, dt, timeV > 0.6 && wxRain < 0.3 && !lanternOn);
  if (lanternOn) {
    lanternT += dt;
    for (const L of lanterns) {
      L.h += dt * 3.2; if (L.h > 55) L.h = rnd(5, 14);
      const a = L.a + t * L.sp;
      L.g.position.set(LK.cx + Math.cos(a) * L.r, WATER_Y + L.h, LK.cz + Math.sin(a) * L.r);
      L.gl.material.opacity = 0.5 + 0.35 * Math.sin(t * 2 + L.ph);
    }
    if (lanternT > 45) endLantern();
  }
  if (AC && soundOn) {
    snd.city.gain.setTargetAtTime(0.28 * (1 - 0.3 * n), AC.currentTime, 0.4);
    snd.rain.gain.setTargetAtTime(0.15 * wxRain, AC.currentTime, 0.4);
  }
}

const clock = new THREE.Clock();
let t = 0, lastFrame = -1e9;
function frame(now) {
  if (LOW && now - lastFrame < 32) { requestAnimationFrame(frame); return; }
  lastFrame = now;
  const dt = Math.min(0.05, clock.getDelta());
  if (!reduceMotion) t += dt;
  uTime.value = t;
  if (fly) {
    fly.t = Math.min(1, fly.t + dt / 1.5); const k = sstep(0, 1, fly.t);
    camera.position.lerpVectors(fly.p0, fly.to.pos, k); controls.target.lerpVectors(fly.q0, fly.to.target, k);
    if (fly.t >= 1) fly = null;
  }
  controls.update();
  updateNight(t, dt); updateTraffic(t, dt);
  if (follow >= 0) {
    const s = cars[follow], q = s.q;
    const back = 12 * followZoom;
    // stay behind the vehicle along velocity; followYaw orbits sideways
    const bx = q.tx * Math.cos(followYaw) - q.tz * Math.sin(followYaw);
    const bz = q.tz * Math.cos(followYaw) + q.tx * Math.sin(followYaw);
    camera.position.lerp(tmpV.set(q.x - bx * back, q.y + 5 + followPitch * 8, q.z - bz * back), 1 - Math.exp(-dt * 3));
    controls.target.lerp(new THREE.Vector3(q.x + q.tx * 4, q.y + 1.4, q.z + q.tz * 4), 1 - Math.exp(-dt * 3));
  }
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  requestAnimationFrame(frame);
}
loadingEl.hidden = true;
requestAnimationFrame(frame);
console.log('Hanoi v4 DN-port:', houses.length, 'houses,', cars.length, 'vehicles, poles', window.__poleCount || 0);
})();
