(function () {
'use strict';
const loadingEl = document.getElementById('loading');
if (!window.THREE || !THREE.OrbitControls) {
  loadingEl.textContent = 'The 3D library could not load. Check the connection and reload.';
  return;
}

const TAU = Math.PI * 2;
let _s = 0xC0FFEE11;
const R = () => { _s |= 0; _s = _s + 0x6D2B79F5 | 0; let t = Math.imul(_s ^ _s >>> 15, 1 | _s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const rnd = (a, b) => b === undefined ? R() * a : a + R() * (b - a);
const pick = (a) => a[(R() * a.length) | 0];
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const col = (h) => new THREE.Color(h);
const DEG = Math.PI / 180;
const dirAzEl = (az, el) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));

// ---------------------------------------------------------------- world: compact dense Hanoi slice
const SUN = dirAzEl(-55 * DEG, 8 * DEG);
const HALF = 210; // half-extent of square diorama
const WATER_Y = 0.15;
// Hoàn Kiếm — slightly irregular oval, north-biased (real lake is elongated N-S)
const LK = { cx: 0, cz: -6, rx: 40, rz: 78 };
const lakeAt = (x, z) => Math.hypot((x - LK.cx) / LK.rx, (z - LK.cz) / LK.rz);
const inLake = (x, z) => lakeAt(x, z) < 1;
// Ngọc Sơn island (north end of lake)
const NG = { cx: 2, cz: -52, rx: 14, rz: 11 };
const inNgoc = (x, z) => Math.hypot((x - NG.cx) / NG.rx, (z - NG.cz) / NG.rz) < 1;
// promenade ring just outside water
const inPromenade = (x, z) => { const d = lakeAt(x, z); return d >= 1 && d < 1.08; };

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const LOW = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);
const DPR = Math.min(window.devicePixelRatio || 1, LOW ? 1.25 : 1.75);
renderer.setPixelRatio(DPR);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const FOG = col('#e8b8a0');
scene.fog = new THREE.Fog(FOG, 420, 980);
scene.background = col('#f0a878');

const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2500);
const VIEWS = {
  overview: { pos: new THREE.Vector3(195, 165, 230), target: new THREE.Vector3(0, 8, -5) },
  painting: { pos: new THREE.Vector3(78, 14, 72), target: new THREE.Vector3(0, 6, -20) },
};
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
camera.position.copy(VIEWS.overview.pos);
const controls = new THREE.OrbitControls(camera, canvas);
controls.target.copy(VIEWS.overview.target);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 20; controls.maxDistance = 520; controls.maxPolarAngle = Math.PI * 0.48;
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

const hemi = new THREE.HemisphereLight(0xffd0a8, 0x4a3858, 0.55); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb070, 1.55);
sun.position.set(-180, 140, -90); sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
sun.shadow.camera.near = 10; sun.shadow.camera.far = 600;
sun.shadow.camera.left = sun.shadow.camera.bottom = -260;
sun.shadow.camera.right = sun.shadow.camera.top = 260;
sun.shadow.bias = -0.0004; scene.add(sun);
const fill = new THREE.DirectionalLight(0x8890c8, 0.25); fill.position.set(120, 80, 160); scene.add(fill);
const dummy = new THREE.Object3D();

const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const glowSprite = (color, size, opacity = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity, fog: false }));
  s.scale.set(size, size, 1); return s;
};

// sky gradient backdrop
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uNight: uNight },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uNight; varying vec3 vP;
      void main(){
        float t = clamp(normalize(vP).y * 0.85 + 0.35, 0.0, 1.0);
        vec3 day = mix(vec3(0.95, 0.62, 0.45), vec3(0.55, 0.62, 0.85), t);
        day = mix(vec3(0.98, 0.78, 0.55), day, smoothstep(0.0, 0.55, t));
        vec3 night = mix(vec3(0.04, 0.05, 0.12), vec3(0.08, 0.1, 0.22), t);
        gl_FragColor = vec4(mix(day, night, uNight), 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat));
  const sunSpr = glowSprite(0xffc090, 120, 0.9); sunSpr.position.copy(SUN).multiplyScalar(700); scene.add(sunSpr);
  window.__sunSpr = sunSpr;
}

// ---------------------------------------------------------------- thick square base (Tokyo-ref style)
{
  const top = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 24, 4, HALF * 2 + 24), toon(col('#3d4a38')));
  top.position.y = -1.6; top.receiveShadow = true; scene.add(top);
  const dirt = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 28, 22, HALF * 2 + 28), toon(col('#3a2a22')));
  dirt.position.y = -14; scene.add(dirt);
  const under = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 36, 8, HALF * 2 + 36), toon(col('#241818')));
  under.position.y = -28; scene.add(under);
}

// ground plane (park + sidewalk base) — will be mostly covered
const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), toon(col('#5a5a58')));
ground.rotation.x = -Math.PI / 2; ground.position.y = 0; ground.receiveShadow = true; scene.add(ground);

// ---------------------------------------------------------------- Hoàn Kiếm water
const waterMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uTime, uNight },
  vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `
    uniform float uTime; uniform float uNight; varying vec2 vUv; varying vec3 vW;
    void main(){
      vec2 p = (vUv - 0.5) * 2.0;
      float r = length(p);
      float w1 = sin(p.x * 18.0 + p.y * 14.0 + uTime * 1.1) * 0.5 + 0.5;
      float w2 = sin(p.x * -11.0 + p.y * 20.0 + uTime * 0.7) * 0.5 + 0.5;
      vec3 deep = mix(vec3(0.12, 0.42, 0.48), vec3(0.04, 0.1, 0.16), uNight);
      vec3 shallow = mix(vec3(0.28, 0.58, 0.55), vec3(0.08, 0.16, 0.2), uNight);
      vec3 c = mix(shallow, deep, smoothstep(0.2, 0.9, r));
      c += vec3(0.15, 0.2, 0.18) * w1 * w2 * 0.08 * (1.0 - uNight);
      vec3 view = normalize(cameraPosition - vW);
      float fres = pow(1.0 - clamp(view.y, 0.0, 1.0), 2.0);
      c = mix(c, mix(vec3(0.9, 0.75, 0.65), vec3(0.15, 0.18, 0.3), uNight), fres * 0.45);
      float rim = smoothstep(0.92, 1.0, r);
      c = mix(c, mix(vec3(0.7, 0.82, 0.78), vec3(0.2, 0.28, 0.32), uNight), rim * 0.5);
      float a = smoothstep(1.02, 0.94, r) * 0.96;
      gl_FragColor = vec4(c, a);
    }`,
});
{
  const g = new THREE.CircleGeometry(1, 64); g.scale(LK.rx, LK.rz, 1); g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, waterMat); mesh.position.set(LK.cx, WATER_Y, LK.cz); scene.add(mesh);
}
// stone embankment ring
{
  const emb = new THREE.Mesh(new THREE.RingGeometry(LK.rx * 0.98, LK.rx * 1.08, 64), toon(col('#6a6860')));
  emb.rotation.x = -Math.PI / 2; emb.position.set(LK.cx, 0.08, LK.cz); emb.scale.set(1, LK.rz / LK.rx, 1); scene.add(emb);
  const walk = new THREE.Mesh(new THREE.RingGeometry(LK.rx * 1.06, LK.rx * 1.14, 64), toon(col('#8a9a78')));
  walk.rotation.x = -Math.PI / 2; walk.position.set(LK.cx, 0.1, LK.cz); walk.scale.set(1, LK.rz / LK.rx, 1); scene.add(walk);
}

// ---------------------------------------------------------------- road network (asphalt + markings)
const roadMat = toon(col('#1e1e24'));
const markMat = basic(col('#e8e4dc'));
const crossMat = basic(col('#f0ece4'));
const roads = []; // { pts: [[x,z]...], w }
const occupied = new Set(); // building occupancy grid
const CELL = 3.5;
const key = (ix, iz) => ix + ',' + iz;
const markOcc = (x, z, r = 1) => {
  const ix = Math.round(x / CELL), iz = Math.round(z / CELL);
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) occupied.add(key(ix + dx, iz + dz));
};
const isOcc = (x, z, r = 1) => {
  const ix = Math.round(x / CELL), iz = Math.round(z / CELL);
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (occupied.has(key(ix + dx, iz + dz))) return true;
  return false;
};
const nearLake = (x, z, m = 1.2) => lakeAt(x, z) < m;
const inBounds = (x, z) => Math.abs(x) < HALF - 8 && Math.abs(z) < HALF - 8;

function buildRoad(pts, w) {
  if (pts.length < 2) return;
  roads.push({ pts, w });
  const half = w / 2;
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
    let dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const nx = -dz, nz = dx;
    pos.push(x + nx * half, 0.22, z + nz * half, x - nx * half, 0.22, z - nz * half);
    if (i > 0) { const a = (i - 1) * 2, b = i * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    // occupy road cells
    for (let t = -half - 1; t <= half + 1; t += CELL * 0.4) markOcc(x + nx * t, z + nz * t, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, roadMat); mesh.receiveShadow = true; scene.add(mesh);

  // center dashed line
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const seg = Math.hypot(x1 - x0, z1 - z0);
    if (seg < 2) continue;
    const dx = (x1 - x0) / seg, dz = (z1 - z0) / seg;
    for (let d = 1; d < seg - 1; d += 4.5) {
      const x = x0 + dx * d, z = z0 + dz * d;
      if (nearLake(x, z, 1.05)) continue;
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 1.8), markMat);
      dash.position.set(x, 0.28, z);
      dash.rotation.y = -Math.atan2(dz, dx) + Math.PI / 2;
      scene.add(dash);
    }
  }
}

function addCrosswalk(x, z, yaw, w = 8) {
  for (let i = -3; i <= 3; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, w * 0.85), crossMat);
    bar.position.set(x + Math.cos(yaw) * i * 0.9, 0.28, z + Math.sin(yaw) * i * 0.9);
    bar.rotation.y = yaw; scene.add(bar);
  }
}

// ring road around Hoàn Kiếm
{
  const pts = [];
  for (let i = 0; i <= 72; i++) {
    const a = i / 72 * TAU;
    pts.push([LK.cx + Math.cos(a) * (LK.rx + 18), LK.cz + Math.sin(a) * (LK.rz + 18)]);
  }
  buildRoad(pts, 11);
}
// Old Quarter N-S streets
for (let x = -100; x <= 100; x += 18) {
  const pts = [];
  for (let z = -HALF + 15; z <= HALF - 15; z += 4) {
    if (nearLake(x, z, 1.08)) continue;
    pts.push([x + Math.sin(z * 0.03) * 0.8, z]);
  }
  // split contiguous segments
  let seg = [];
  const flush = () => { if (seg.length > 3) buildRoad(seg, 7); seg = []; };
  for (const p of pts) {
    if (seg.length && Math.hypot(p[0] - seg[seg.length - 1][0], p[1] - seg[seg.length - 1][1]) > 10) flush();
    seg.push(p);
  }
  flush();
}
// E-W streets
for (let z = -100; z <= 100; z += 16) {
  if (Math.abs(z - LK.cz) < LK.rz + 10) continue;
  const pts = [];
  for (let x = -HALF + 15; x <= HALF - 15; x += 4) {
    if (nearLake(x, z, 1.08)) continue;
    pts.push([x, z + Math.sin(x * 0.025) * 0.6]);
  }
  let seg = [];
  const flush = () => { if (seg.length > 3) buildRoad(seg, 7.5); seg = []; };
  for (const p of pts) {
    if (seg.length && Math.hypot(p[0] - seg[seg.length - 1][0], p[1] - seg[seg.length - 1][1]) > 10) flush();
    seg.push(p);
  }
  flush();
}
// Tràng Tiền-ish avenue SE
{
  const pts = [];
  for (let x = 30; x < HALF - 10; x += 3) pts.push([x, 55 + Math.sin(x * 0.04) * 2]);
  buildRoad(pts, 10);
  addCrosswalk(70, 55, 0, 9);
  addCrosswalk(120, 56, 0.05, 9);
}
addCrosswalk(LK.cx + LK.rx + 18, LK.cz, Math.PI / 2, 8);
addCrosswalk(LK.cx, LK.cz + LK.rz + 18, 0, 8);
addCrosswalk(LK.cx - LK.rx - 18, LK.cz, Math.PI / 2, 8);

// mark lake + promenade occupied
for (let x = -LK.rx - 25; x <= LK.rx + 25; x += CELL) {
  for (let z = -LK.rz - 25; z <= LK.rz + 25; z += CELL) {
    if (nearLake(x + LK.cx, z + LK.cz, 1.12)) markOcc(x + LK.cx, z + LK.cz, 0);
  }
}

// ---------------------------------------------------------------- buildings — dense voxel tube houses
const WALLS = ['#e8c878', '#f0d890', '#d4a85a', '#e0b878', '#c89860', '#f4e0b0', '#d8b070', '#e8d0a0', '#c45c48', '#4a6a8a', '#d0c8b8', '#f0e8d8'].map(col);
const ROOFS = ['#7a3030', '#8a3a32', '#6e2828', '#9a4040', '#5a2828', '#a84838'].map(col);
const winOff = col('#1a1830');
const winMats = [];
const houses = [];

function addBuilding(x, z, w, d, floors, wall, roof, tube) {
  if (!inBounds(x, z) || nearLake(x, z, 1.1) || inNgoc(x, z)) return null;
  if (isOcc(x, z, 0)) return null;
  const fh = tube ? 3.4 : 3.6;
  const h = floors * fh;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(wall));
  body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
  // shutters / windows as dark voxels
  const wm = basic(winOff.clone()); winMats.push(wm);
  for (let f = 0; f < floors; f++) {
    const y = fh * (f + 0.55);
    if (tube) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, fh * 0.42, 0.2), wm);
      win.position.set(0, y, d / 2 + 0.05); g.add(win);
      const gl = glowSprite(0xffd090, 2.0, 0); gl.position.set(0, y, d / 2 + 0.4); g.add(gl); gl.userData.winGlow = true;
      if (f === 0) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, fh * 0.65, 0.15), toon(col('#3a2a38')));
        door.position.set(0, fh * 0.35, d / 2 + 0.08); g.add(door);
        const awn = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 0.15, 1.0), toon(pick([col('#d9442e'), col('#2f6fc8'), col('#e8a020'), col('#3db08a'), col('#f0f0f0')])));
        awn.position.set(0, fh * 0.92, d / 2 + 0.65); g.add(awn);
      } else {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.5, 0.12), toon(col('#5a4a48')));
        rail.position.set(0, y - fh * 0.25, d / 2 + 0.4); g.add(rail);
      }
    } else {
      for (const sx of [-0.22, 0.22]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.28, fh * 0.4, 0.18), wm);
        win.position.set(sx * w, y, d / 2 + 0.05); g.add(win);
        const gl = glowSprite(0xffd090, 1.5, 0); gl.position.set(sx * w, y, d / 2 + 0.35); g.add(gl); gl.userData.winGlow = true;
      }
      if (f >= 1) {
        const bal = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.2, 0.65), toon(col('#efe8dc')));
        bal.position.set(0, y - fh * 0.32, d / 2 + 0.3); g.add(bal);
      }
    }
  }
  // voxel roof — stepped boxes instead of cone for Tokyo-voxel feel
  const roofY = h;
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(w * 1.08, 0.7, d * 1.08), toon(roof));
  r1.position.y = roofY + 0.35; r1.castShadow = true; g.add(r1);
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.9, d * 0.55), toon(roof));
  r2.position.y = roofY + 1.1; g.add(r2);
  // AC / tank clutter
  if (R() < 0.45) {
    const ac = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.5), toon(col('#d0d0d8')));
    ac.position.set(w * 0.3, h * 0.7, d / 2 + 0.35); g.add(ac);
  }
  if (R() < 0.3) {
    const tank = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 1.1), toon(col('#e8e8ee')));
    tank.position.set(-w * 0.15, roofY + 1.8, -d * 0.1); g.add(tank);
  }
  g.position.set(x, 0, z);
  g.rotation.y = tube ? (R() < 0.5 ? 0 : Math.PI / 2) : rnd(-0.04, 0.04);
  scene.add(g);
  markOcc(x, z, Math.max(0, Math.ceil(Math.max(w, d) / CELL) - 1));
  houses.push({ x, z, w, d, h, g });
  return g;
}

// Dense fill: spiral outward from lake, packing every free cell
for (let ring = 0; ring < 55; ring++) {
  const rad = LK.rx + 12 + ring * (CELL * 0.72);
  const n = Math.max(16, Math.floor(TAU * rad / (CELL * 0.7)));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + ring * 0.07;
    const x = LK.cx + Math.cos(a) * rad * (LK.rx / ((LK.rx + LK.rz) * 0.5)) * (1 + (ring > 8 ? 0.15 * Math.sin(i) : 0));
    // elliptical packing
    const ex = LK.cx + Math.cos(a) * (LK.rx + 12 + ring * CELL * 0.72);
    const ez = LK.cz + Math.sin(a) * (LK.rz + 12 + ring * CELL * 0.72);
    if (!inBounds(ex, ez) || nearLake(ex, ez, 1.1)) continue;
    if (isOcc(ex, ez, 0)) continue;
    const tube = ring < 14 || R() < 0.55;
    const w = tube ? rnd(3.6, 5.2) : rnd(6, 11);
    const d = tube ? rnd(6, 10) : rnd(6, 11);
    const fl = tube ? 2 + ((R() * 4) | 0) : 2 + ((R() * 5) | 0);
    addBuilding(ex + rnd(-0.4, 0.4), ez + rnd(-0.4, 0.4), w, d, fl, pick(WALLS), pick(ROOFS), tube);
  }
}
// cartesian fill for remaining voids
for (let x = -HALF + 10; x < HALF - 10; x += CELL * 0.85) {
  for (let z = -HALF + 10; z < HALF - 10; z += CELL * 0.85) {
    if (nearLake(x, z, 1.1) || isOcc(x, z, 0)) continue;
    if (R() < 0.03) continue;
    const tube = R() < 0.7;
    addBuilding(x + rnd(-0.5, 0.5), z + rnd(-0.5, 0.5), tube ? rnd(3.2, 4.8) : rnd(5, 9), tube ? rnd(5, 8.5) : rnd(5, 9), 2 + ((R() * 4) | 0), pick(WALLS), pick(ROOFS), tube);
  }
}
// second pass: micro-fill remaining voids with skinny houses
for (let x = -HALF + 8; x < HALF - 8; x += 3.2) {
  for (let z = -HALF + 8; z < HALF - 8; z += 3.2) {
    if (nearLake(x, z, 1.08) || isOcc(x, z, 0)) continue;
    if (R() < 0.25) continue;
    addBuilding(x, z, rnd(2.8, 4.0), rnd(4.5, 7.5), 2 + ((R() * 3) | 0), pick(WALLS), pick(ROOFS), true);
  }
}

// ---------------------------------------------------------------- landmarks
// Tháp Rùa
const turtle = new THREE.Group();
{
  const stone = toon(col('#6a6458'));
  const isle = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 14), toon(col('#4a6a42'))); isle.position.y = 0.5; turtle.add(isle);
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(10, 3.5, 10), stone); b1.position.y = 2.5; b1.castShadow = true; turtle.add(b1);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(7, 4.5, 7), stone); b2.position.y = 6.5; turtle.add(b2);
  const b3 = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.5, 4.5), stone); b3.position.y = 10.5; turtle.add(b3);
  const roof = toon(col('#8a3030'));
  for (const [s, y] of [[11, 4.5], [8, 8.8], [5.5, 12.8]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(s, 0.7, s), roof); r.position.y = y; turtle.add(r);
  }
  const tip = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.2), basic(col('#e8c860'))); tip.position.y = 14.5; turtle.add(tip);
  const gl = glowSprite(0xffd070, 10, 0); gl.position.y = 14.5; turtle.add(gl); turtle.userData.glow = gl;
}
turtle.position.set(LK.cx - 5, 0, LK.cz + 18); scene.add(turtle);

// Ngọc Sơn
const ngoc = new THREE.Group();
{
  const cream = toon(col('#f2ead8')), red = toon(col('#a03028'));
  const plat = new THREE.Mesh(new THREE.BoxGeometry(26, 1.4, 20), toon(col('#5a7060'))); plat.position.y = 0.6; ngoc.add(plat);
  const hall = new THREE.Mesh(new THREE.BoxGeometry(14, 5.5, 10), cream); hall.position.y = 4; hall.castShadow = true; ngoc.add(hall);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(16, 1.2, 12), red); roof.position.y = 7.2; ngoc.add(roof);
  const roof2 = new THREE.Mesh(new THREE.BoxGeometry(10, 1.0, 8), red); roof2.position.y = 8.4; ngoc.add(roof2);
  const gate = new THREE.Mesh(new THREE.BoxGeometry(6, 7, 2), cream); gate.position.set(0, 4.2, 9); ngoc.add(gate);
  const gr = new THREE.Mesh(new THREE.BoxGeometry(7, 1, 3), red); gr.position.set(0, 8, 9); ngoc.add(gr);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), toon(col('#2f6848')));
    leaf.position.set(Math.cos(a) * 9, 2.5, Math.sin(a) * 7); ngoc.add(leaf);
  }
}
ngoc.position.set(NG.cx, 0, NG.cz); scene.add(ngoc); markOcc(NG.cx, NG.cz, 3);

// Cầu Thê Húc — bright red arched voxel bridge
const huc = new THREE.Group();
{
  const red = toon(col('#c03830'));
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const x = lerp(40, 8, t), z = lerp(-40, -52, t);
    const arch = Math.sin(t * Math.PI) * 3.2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 3.2), red);
    deck.position.set(x, 1.2 + arch, z); deck.castShadow = true; huc.add(deck);
    for (const s of [-1.4, 1.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.8, 0.35), red);
      post.position.set(x, 2.2 + arch, z + s); huc.add(post);
    }
    if (i % 2 === 1) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), basic(col('#ffd080')));
      lamp.position.set(x, 3.2 + arch, z); huc.add(lamp);
      const gl = glowSprite(0xffc060, 3.5, 0); gl.position.copy(lamp.position); huc.add(gl); gl.userData.bridgeLantern = true;
    }
  }
}
scene.add(huc);

// Flag tower
{
  const g = new THREE.Group();
  const brick = toon(col('#a85840'));
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 14), brick); b1.position.y = 2.5; b1.castShadow = true; g.add(b1);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(9, 8, 9), brick); b2.position.y = 9; g.add(b2);
  const b3 = new THREE.Mesh(new THREE.BoxGeometry(5, 12, 5), brick); b3.position.y = 19; g.add(b3);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.35, 10, 0.35), toon(col('#d8d0c0'))); pole.position.y = 30; g.add(pole);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(5, 3.2, 0.15), basic(col('#da251d'))); flag.position.set(2.6, 32, 0); g.add(flag);
  g.userData.flag = flag;
  g.position.set(-75, 0, -145); scene.add(g); markOcc(-75, -145, 2);
}

// Opera (yellow colonial)
{
  const g = new THREE.Group();
  const yel = toon(col('#f0d878'));
  const body = new THREE.Mesh(new THREE.BoxGeometry(24, 10, 14), yel); body.position.y = 5; body.castShadow = true; g.add(body);
  for (const sx of [-14, 14]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 12), yel); w.position.set(sx, 4, 0); g.add(w);
  }
  for (let i = -3; i <= 3; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7, 0.7), toon(col('#f8f0d8')));
    c.position.set(i * 2.8, 3.5, 7.5); g.add(c);
  }
  const dome = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 6), toon(col('#e8c860'))); dome.position.y = 12.5; g.add(dome);
  g.position.set(95, 0, 115); scene.add(g); markOcc(95, 115, 3);
}

// FLOOD_FILL_V3 — pack remaining voids tightly
for (let pass = 0; pass < 3; pass++) {
  for (let x = -HALF + 6; x < HALF - 6; x += 2.6) {
    for (let z = -HALF + 6; z < HALF - 6; z += 2.6) {
      if (nearLake(x, z, 1.06) || isOcc(x, z, 0) || !inBounds(x, z)) continue;
      if (R() < 0.15 * pass) continue;
      const w = rnd(2.6, 4.2), d = rnd(4.2, 7.2), fl = 2 + ((R() * 4) | 0);
      addBuilding(x + rnd(-0.3, 0.3), z + rnd(-0.3, 0.3), w, d, fl, pick(WALLS), pick(ROOFS), true);
    }
  }
}

// ---------------------------------------------------------------- trees, bushes, fill gaps
const TREE_GREEN = ['#2f6840', '#3a7a48', '#4a8a50', '#2a5838', '#508848'].map(col);
function addTree(x, z, s = 1) {
  if (!inBounds(x, z) || nearLake(x, z, 1.05) || isOcc(x, z, 0)) return;
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 2.2 * s, 0.5 * s), toon(col('#5a4030')));
  trunk.position.y = 1.1 * s; g.add(trunk);
  for (let k = 0; k < 4; k++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(rnd(1.8, 2.6) * s, rnd(1.6, 2.4) * s, rnd(1.8, 2.6) * s), toon(pick(TREE_GREEN)));
    leaf.position.set(rnd(-0.8, 0.8) * s, (2.8 + k * 0.55) * s, rnd(-0.8, 0.8) * s);
    leaf.castShadow = true; g.add(leaf);
  }
  g.position.set(x, 0, z); scene.add(g); markOcc(x, z, 0);
}
// promenade trees
for (let a = 0; a < TAU; a += 0.14) {
  const x = LK.cx + Math.cos(a) * (LK.rx + 12);
  const z = LK.cz + Math.sin(a) * (LK.rz + 12);
  addTree(x, z, rnd(0.85, 1.2));
}
// fill remaining gaps with trees/bushes
for (let x = -HALF + 10; x < HALF - 10; x += 6) {
  for (let z = -HALF + 10; z < HALF - 10; z += 6) {
    if (isOcc(x, z, 0) || nearLake(x, z, 1.08)) continue;
    if (R() < 0.55) addTree(x + rnd(-1, 1), z + rnd(-1, 1), rnd(0.7, 1.3));
    else if (R() < 0.5) {
      const bush = new THREE.Mesh(new THREE.BoxGeometry(rnd(1.2, 2), rnd(0.8, 1.4), rnd(1.2, 2)), toon(pick(TREE_GREEN)));
      bush.position.set(x, 0.6, z); scene.add(bush); markOcc(x, z, 0);
    }
  }
}

// ---------------------------------------------------------------- power lines (Hanoi tangled wires)
const poleMat = toon(col('#3a3a42'));
const wireMat = new THREE.LineBasicMaterial({ color: col('#1a1a22'), transparent: true, opacity: 0.75 });
const poles = [];
function addPole(x, z) {
  if (!inBounds(x, z) || nearLake(x, z, 1.08)) return null;
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.45, 9, 0.45), poleMat); pole.position.y = 4.5; g.add(pole);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 0.25), poleMat); cross.position.y = 8.2; g.add(cross);
  const cross2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 0.2), poleMat); cross2.position.y = 7.4; g.add(cross2);
  g.position.set(x, 0, z); scene.add(g);
  poles.push({ x, z, y: 8.2 });
  return g;
}
// poles along roads
for (const road of roads) {
  for (let i = 0; i < road.pts.length; i += 5) {
    const [x, z] = road.pts[i];
    const p0 = road.pts[Math.max(0, i - 1)], p1 = road.pts[Math.min(road.pts.length - 1, i + 1)];
    let dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L;
    addPole(x + nx * (road.w * 0.55 + 0.8), z + nz * (road.w * 0.55 + 0.8));
  }
}
// wire connections
{
  const positions = [];
  for (let i = 0; i < poles.length; i++) {
    const a = poles[i];
    // connect to nearest 1-2 poles
    let best = [], bestD = [];
    for (let j = 0; j < poles.length; j++) {
      if (i === j) continue;
      const b = poles[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < 8 || d > 42) continue;
      if (bestD.length < 2 || d < bestD[0]) {
        best.push(b); bestD.push(d);
        if (best.length > 2) { const k = bestD.indexOf(Math.max(...bestD)); best.splice(k, 1); bestD.splice(k, 1); }
      }
    }
    for (const b of best) {
      // sagging wire as polyline
      for (let k = 0; k < 6; k++) {
        const t0 = k / 6, t1 = (k + 1) / 6;
        const sag0 = Math.sin(t0 * Math.PI) * 1.6, sag1 = Math.sin(t1 * Math.PI) * 1.6;
        positions.push(
          lerp(a.x, b.x, t0), a.y - sag0, lerp(a.z, b.z, t0),
          lerp(a.x, b.x, t1), a.y - sag1, lerp(a.z, b.z, t1)
        );
        // second parallel wire
        positions.push(
          lerp(a.x, b.x, t0) + 0.4, a.y - 0.6 - sag0, lerp(a.z, b.z, t0),
          lerp(a.x, b.x, t1) + 0.4, a.y - 0.6 - sag1, lerp(a.z, b.z, t1)
        );
      }
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  scene.add(new THREE.LineSegments(wg, wireMat));
}

// ---------------------------------------------------------------- street clutter: umbrellas, vendors, signs
const UMB = ['#e8533f', '#f2c14e', '#2fa4c8', '#f08aa8', '#3db08a', '#f4f0f4'].map(col);
for (let i = 0; i < 80; i++) {
  const road = pick(roads);
  if (!road || road.pts.length < 4) continue;
  const p = pick(road.pts);
  const x = p[0] + rnd(-road.w * 0.7, -road.w * 0.4) * (R() < 0.5 ? 1 : -1);
  const z = p[1] + rnd(-2, 2);
  if (nearLake(x, z, 1.1) || !inBounds(x, z)) continue;
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), toon(col('#e8e4f0'))); pole.position.y = 1.2; g.add(pole);
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.25, 8), toon(pick(UMB))); canopy.position.y = 2.4; g.add(canopy);
  const stall = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.2), toon(col('#c8b090'))); stall.position.y = 0.5; g.add(stall);
  g.position.set(x, 0, z); scene.add(g);
}

// ---------------------------------------------------------------- scooters & cars
const scooters = [];
const SCOOT_COLS = ['#e8533f', '#2f6fc8', '#f2c14e', '#1c1b2c', '#f08aa8', '#3db08a', '#f4f0f4', '#9a5ad0', '#e8e8e8'].map(col);
function routeLen(pts) {
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L || 1;
}
function routeAt(pts, d) {
  let left = ((d % routeLen(pts)) + routeLen(pts)) % routeLen(pts);
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (left <= seg) {
      const t = left / (seg || 1);
      const x = lerp(pts[i - 1][0], pts[i][0], t), z = lerp(pts[i - 1][1], pts[i][1], t);
      const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1];
      return { x, y: 0.35, z, yaw: -Math.atan2(dz, dx) + Math.PI / 2 };
    }
    left -= seg;
  }
  return { x: pts[0][0], y: 0.35, z: pts[0][1], yaw: 0 };
}
const driveRoutes = roads.filter((r) => r.pts.length > 10 && routeLen(r.pts) > 60);
for (let i = 0; i < 55; i++) {
  const route = driveRoutes[i % driveRoutes.length];
  if (!route) continue;
  const g = new THREE.Group();
  const isCar = R() < 0.25;
  if (isCar) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 4.6), toon(pick(SCOOT_COLS)));
    body.position.y = 0.7; body.castShadow = true; g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 2.2), toon(col('#c8d0e0'))); cabin.position.set(0, 1.5, -0.2); g.add(cabin);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.65, 1.7), toon(pick(SCOOT_COLS)));
    body.position.y = 0.45; body.castShadow = true; g.add(body);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.45), toon(col('#2a2a38'))); seat.position.set(0, 0.7, -0.15); g.add(seat);
  }
  const hl = glowSprite(0xfff0c0, 1.6, 0); hl.position.set(0, 0.5, isCar ? 2.2 : 0.85); g.add(hl);
  scene.add(g);
  scooters.push({ g, route: route.pts, d: rnd(routeLen(route.pts)), v: rnd(9, 16), headlight: hl, q: { x: 0, y: 0, z: 0 }, isCar });
}
function updateTraffic(dt) {
  for (const s of scooters) {
    s.d += s.v * dt;
    const q = routeAt(s.route, s.d); s.q = q;
    s.g.position.set(q.x, q.y, q.z); s.g.rotation.y = q.yaw;
  }
}

// ---------------------------------------------------------------- lanterns + fireworks (keep UX moments)
const lanterns = [];
{
  const cols = ['#ff7a40', '#ffd060', '#ff5080', '#ffe8a0', '#ff9040'].map(col);
  for (let i = 0; i < 40; i++) {
    const g = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 1.4), basic(pick(cols))); g.add(paper);
    paper.material.transparent = true; paper.material.opacity = 0.9;
    const gl = glowSprite(0xffb060, 4.5, 0); g.add(gl);
    g.visible = false; scene.add(g);
    lanterns.push({ g, gl, a: rnd(TAU), r: rnd(12, LK.rx * 0.8), h: rnd(6, 40), sp: rnd(0.12, 0.35), ph: rnd(TAU) });
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

// ---------------------------------------------------------------- post: soft bloom + vignette (keep miniature feel)
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
      // warm grade
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

// ---------------------------------------------------------------- controls
let fly = null;
const flyTo = (v) => { fly = { t: 0, p0: camera.position.clone(), q0: controls.target.clone(), to: v }; };
const orbitBtn = document.getElementById('orbit'), followBtn = document.getElementById('follow');
let follow = -1, followYaw = 0, followPitch = 0, followZoom = 1, followDrag = false;
const stopFollow = () => { follow = -1; controls.minDistance = 20; controls.enabled = true; followBtn.setAttribute('aria-pressed', 'false'); followBtn.textContent = 'Follow a scooter'; };
document.getElementById('view').addEventListener('click', () => { stopFollow(); flyTo(VIEWS.painting); controls.autoRotate = false; orbitBtn.setAttribute('aria-pressed', 'false'); });
document.getElementById('overview').addEventListener('click', () => { stopFollow(); flyTo(VIEWS.overview); });
followBtn.addEventListener('click', () => {
  follow = (follow + 1) % scooters.length; fly = null; followYaw = 0; followPitch = 0; followZoom = 1;
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
VIEWS.fireworks = { pos: new THREE.Vector3(LK.cx + 90, 55, LK.cz + 80), target: new THREE.Vector3(LK.cx, 20, LK.cz) };
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

// sound
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
  snd.city = loop(snd.brown, filt('lowpass', 180)); snd.rain = loop(snd.white, filt('highpass', 900)); snd.filt = filt; snd.nextHorn = 0;
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
  scene.background.copy(col('#e8a888')).lerp(col('#0c0e1c'), n);
  hemi.intensity = lerp(0.55, 0.35, n); hemi.color.copy(HEMI_DAY).lerp(HEMI_NIGHT, n);
  sun.intensity = lerp(1.7, 0.12, n); fill.intensity = lerp(0.25, 0.4, n);
  if (window.__sunSpr) window.__sunSpr.material.opacity = (1 - n) * 0.9;
  const te = Math.max(timeV, wxRain * 0.3);
  scene.traverse((o) => {
    if (o.userData && o.userData.winGlow) o.material.opacity = sstep(0.1, 0.5, te) * 0.75;
    if (o.userData && o.userData.bridgeLantern) o.material.opacity = sstep(0.05, 0.35, te) * 0.9;
  });
  for (const m of winMats) m.color.set(te > 0.25 ? '#ffd8a0' : '#1a1830');
  for (const s of scooters) s.headlight.material.opacity = n * 0.8;
  if (turtle.userData.glow) turtle.userData.glow.material.opacity = sstep(0.15, 0.5, te) * 0.85;

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
  scene.fog.near = lerp(420, 80, wxRain); scene.fog.far = lerp(980, 280, wxRain);

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
    snd.city.gain.setTargetAtTime(0.25 * (1 - 0.3 * n), AC.currentTime, 0.4);
    snd.rain.gain.setTargetAtTime(0.15 * wxRain, AC.currentTime, 0.4);
  }
}

// ---------------------------------------------------------------- loop
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
  updateNight(t, dt); updateTraffic(dt);
  if (follow >= 0) {
    const s = scooters[follow], q = s.q;
    const back = 11 * followZoom;
    const fx = q.x - Math.sin(q.yaw + followYaw) * back;
    const fz = q.z - Math.cos(q.yaw + followYaw) * back;
    const fy = q.y + 4 + followPitch * 8;
    camera.position.lerp(tmpV.set(fx, fy, fz), 1 - Math.exp(-dt * 3));
    controls.target.lerp(new THREE.Vector3(q.x, q.y + 1, q.z), 1 - Math.exp(-dt * 3));
  }
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  requestAnimationFrame(frame);
}
loadingEl.hidden = true;
requestAnimationFrame(frame);
console.log('Hanoi voxel diorama:', houses.length, 'buildings,', poles.length, 'poles,', scooters.length, 'vehicles');
})();
