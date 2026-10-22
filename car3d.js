// 3D-Modell des Roadsters, ganz aus Code gebaut (keine Modell-Datei).
// Die Karosserie ist ein „Loft“: an festen Stellen entlang der Länge steht je ein
// Querschnitt, dazwischen werden flache Flächen gespannt. Das ergibt von selbst
// den kantigen Cyber-Look. Einheiten: Meter, x = Länge (Heck −2,2 … Nase +2,2), y = oben.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/* ---------- Form der Karosserie ---------- */
const APEX = 0.35; // höchster Punkt des Dachs
// Dach: gerade vom Heck zum Scheitel, dann flach über die Haube, vorn steiler zur Nase
const topY = (x) => {
  if (x <= APEX) return lerp(0.9, 1.1, (x + 2.2) / (APEX + 2.2));
  if (x <= 1.75) return lerp(1.1, 0.84, (x - APEX) / (1.75 - APEX));
  return lerp(0.84, 0.5, (x - 1.75) / 0.45);
};
const creaseY = (x) => (x < 1.75 ? lerp(0.7, 0.54, (x + 2.2) / 3.95) : lerp(0.54, 0.42, (x - 1.75) / 0.45));
const widthAtCrease = (x) => 1.0 - 0.2 * Math.pow(Math.max(0, (x - 1.6) / 0.6), 2) - 0.1 * Math.max(0, (-1.7 - x) / 0.5);
const widthAtTop = (x) => (x <= APEX ? lerp(0.86, 0.42, (x + 2.2) / (APEX + 2.2)) : x <= 1.75 ? lerp(0.42, 0.78, (x - APEX) / (1.75 - APEX)) : lerp(0.78, 0.62, (x - 1.75) / 0.45));

const WHEEL_R = 0.34, REAR_X = -1.4, FRONT_X = 1.2;
const GLASS_FROM = -0.8, GLASS_TO = 0.68;
// Querschnitte: [x, Unterkante]. Über den Rädern liegt die Unterkante hoch → eckige Radhäuser.
const STATIONS = [
  [-2.2, 0.28], [-1.92, 0.22], [-1.76, 0.78], [-1.04, 0.78], [-0.88, 0.22], [GLASS_FROM, 0.2],
  [APEX, 0.2], [GLASS_TO, 0.2], [0.84, 0.78], [1.56, 0.78], [1.72, 0.22], [1.75, 0.22], [2.05, 0.26], [2.2, 0.3],
];

function ring(x, y0) {
  const yt = topY(x), wc = widthAtCrease(x), wt = widthAtTop(x);
  const yc = Math.max(creaseY(x), y0 + 0.03);
  const ys = Math.min(yt - 0.01, yc + (yt - yc) * 0.32);
  const right = [[wc - 0.07, y0], [wc, yc], [wc * 0.97, ys], [wt, yt]];
  const left = right.slice().reverse().map(([z, y]) => [-z, y]);
  return right.concat(left).map(([z, y]) => new THREE.Vector3(x, y, z));
}

// Welche Fläche bekommt welches Material? 0 Lack, 1 Glas, 2 Kohlefaser/dunkel
function materialFor(seg, xMid) {
  const cabin = xMid > GLASS_FROM && xMid < GLASS_TO;
  if (seg === 7) return 2; // Unterboden
  if (seg === 0 || seg === 6) return 0;
  if (cabin && (seg === 2 || seg === 3 || seg === 4)) return 1;
  return 0;
}

function buildBody() {
  const rings = STATIONS.map(([x, y0]) => ring(x, y0));
  const buckets = [[], [], []];
  const push = (m, ...vs) => vs.forEach((v) => buckets[m].push(v.x, v.y, v.z));
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1], xMid = (A[0].x + B[0].x) / 2;
    for (let j = 0; j < 8; j++) {
      const k = (j + 1) % 8, m = materialFor(j, xMid);
      push(m, A[j], A[k], B[k]);
      push(m, A[j], B[k], B[j]);
    }
  }
  // Heck und Nase schließen
  for (const [R, flip] of [[rings[0], true], [rings[rings.length - 1], false]]) {
    const c = R.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / R.length);
    for (let j = 0; j < 8; j++) { const a = R[j], b = R[(j + 1) % 8]; flip ? push(0, c, b, a) : push(0, c, a, b); }
  }
  const geo = new THREE.BufferGeometry();
  const all = [].concat(...buckets);
  geo.setAttribute("position", new THREE.Float32BufferAttribute(all, 3));
  let start = 0;
  buckets.forEach((b, m) => { geo.addGroup(start, b.length / 3, m); start += b.length / 3; });
  geo.computeVertexNormals();
  return geo;
}

function buildWheel(mats) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.28, 48, 1), mats.tire);
  tire.rotation.x = Math.PI / 2; g.add(tire);
  // Felge auf der Außenseite (+z), Speichen und roter Bremssattel
  const face = new THREE.Group(); face.position.z = 0.141; g.add(face);
  const barrel = new THREE.Mesh(new THREE.CircleGeometry(0.25, 40), mats.dark); face.add(barrel);
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.2, 40), mats.disc); disc.position.z = 0.002; face.add(disc);
  const caliper = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.215, 16, 1, 0.2, 1.1), mats.red); caliper.position.z = 0.004; face.add(caliper);
  const lip = new THREE.Mesh(new THREE.RingGeometry(0.245, 0.262, 48), mats.chrome); lip.position.z = 0.006; face.add(lip);
  for (let i = 0; i < 5; i++) {
    for (const off of [-0.09, 0.09]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.02), mats.chrome);
      const a = (i / 5) * Math.PI * 2 + off;
      s.position.set(Math.sin(a) * 0.14, Math.cos(a) * 0.14, 0.01); s.rotation.z = -a; face.add(s);
    }
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 20), mats.chrome);
  hub.rotation.x = Math.PI / 2; hub.position.z = 0.015; face.add(hub);
  return g;
}

export function start(canvas, ui) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080a);
  scene.fog = new THREE.Fog(0x07080a, 9, 20);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  camera.position.set(5.8, 1.7, 5.0);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.55, 0);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = 3.6; controls.maxDistance = 11;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotate = true; controls.autoRotateSpeed = 1.3;
  let idleTimer = 0;
  controls.addEventListener("start", () => { controls.autoRotate = false; clearTimeout(idleTimer); });
  controls.addEventListener("end", () => { idleTimer = setTimeout(() => (controls.autoRotate = true), 4000); });

  /* ---------- Licht ---------- */
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x101015, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 6, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 15 });
  key.shadow.radius = 4; scene.add(key);
  const rimBlue = new THREE.PointLight(0x9fd8ff, 14, 12); rimBlue.position.set(-4, 2, -3); scene.add(rimBlue);
  const rimRed = new THREE.PointLight(0xe31937, 8, 8); rimRed.position.set(-4.5, 1.6, 2.5); scene.add(rimRed);

  /* ---------- Boden ---------- */
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.75, metalness: 0.3, envMapIntensity: 0.25 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(18, 36, 0x9fd8ff, 0x9fd8ff);
  grid.material.transparent = true; grid.material.opacity = 0.08; grid.position.y = 0.002; scene.add(grid);
  const halo = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.0, 96), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35 }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.004; scene.add(halo);

  /* ---------- Materialien ---------- */
  const mats = {
    paint: new THREE.MeshPhysicalMaterial({ color: 0xf1f2f0, metalness: 0.15, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, flatShading: true, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xc8963a, metalness: 0.95, roughness: 0.08, flatShading: true, side: THREE.DoubleSide }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.5, metalness: 0.3, flatShading: true, side: THREE.DoubleSide }),
    tire: new THREE.MeshStandardMaterial({ color: 0x131417, roughness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.7 }),
    disc: new THREE.MeshStandardMaterial({ color: 0x8d949b, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 1, roughness: 0.18 }),
    red: new THREE.MeshStandardMaterial({ color: 0xd81e35, roughness: 0.4, side: THREE.DoubleSide }),
    tail: new THREE.MeshStandardMaterial({ color: 0x400008, emissive: 0xff2340, emissiveIntensity: 2.2 }),
    head: new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0xeaf6ff, emissiveIntensity: 2.5 }),
  };

  /* ---------- Auto zusammensetzen ---------- */
  const car = new THREE.Group(); // dreht sich beim Kickflip
  const lift = new THREE.Group(); // hebt/senkt (Track Mode, Sprung)
  lift.add(car); scene.add(lift);

  const body = new THREE.Mesh(buildBody(), [mats.paint, mats.glass, mats.carbon]);
  body.castShadow = true; body.receiveShadow = true; car.add(body);

  // Kanten-Linien betonen die Facetten
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry, 20), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }));
  car.add(edges);

  const wheels = [];
  for (const x of [REAR_X, FRONT_X]) for (const side of [1, -1]) {
    const w = buildWheel(mats);
    w.position.set(x, WHEEL_R, side * 0.84);
    if (side < 0) w.rotation.y = Math.PI; // Felge zeigt immer nach außen
    w.traverse((o) => (o.castShadow = true));
    car.add(w); wheels.push(w);
  }

  // Lichtleiste vorn, Rücklicht über die ganze Breite
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 1.12), mats.head);
  head.position.set(2.205, 0.45, 0); car.add(head);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 1.6), mats.tail);
  tail.position.set(-2.205, 0.8, 0); car.add(tail);
  // Zwei Kaltgas-Düsen und ein Diffusor am Heck
  for (const z of [0.32, -0.32]) {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 24, 1, true), mats.chrome);
    n.rotation.z = Math.PI / 2; n.position.set(-2.24, 0.48, z); car.add(n);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), mats.dark);
    inner.rotation.y = -Math.PI / 2; inner.position.set(-2.285, 0.48, z); car.add(inner);
  }
  for (let i = -3; i <= 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.015), mats.carbon);
    fin.position.set(-2.0, 0.26, i * 0.18); car.add(fin);
  }
  // Frontsplitter
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.025, 1.7), mats.carbon);
  splitter.position.set(2.08, 0.25, 0); car.add(splitter);
  // Kameras statt Spiegel
  for (const z of [1, -1]) {
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.05), mats.carbon);
    cam.position.set(0.66, 0.92, z * 0.66); car.add(cam);
  }

  // Heckflügel für den Track Mode, eingefahren bündig im Heck
  const wing = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 1.6), mats.carbon);
  blade.rotation.z = 0.12; wing.add(blade);
  const struts = [];
  for (const z of [0.4, -0.4]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.025), mats.carbon);
    s.position.set(0.02, -0.5, z); wing.add(s); struts.push(s);
  }
  wing.position.set(-1.98, topY(-1.98) + 0.015, 0);
  wing.traverse((o) => (o.castShadow = true));
  car.add(wing);

  // Lichtkegel der Scheinwerfer auf dem Boden
  // Weicher Lichtkegel: Verlauf auf eine kleine Leinwand gemalt, vorne schmal, nach vorn breiter und blasser
  const bc = document.createElement("canvas"); bc.width = 256; bc.height = 128;
  const bx = bc.getContext("2d"), bg = bx.createLinearGradient(0, 0, 256, 0);
  bg.addColorStop(0, "rgba(234,246,255,0.9)"); bg.addColorStop(1, "rgba(234,246,255,0)");
  bx.fillStyle = bg; bx.beginPath(); bx.moveTo(0, 54); bx.lineTo(256, 0); bx.lineTo(256, 128); bx.lineTo(0, 74); bx.fill();
  const beamMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), beamMat);
  beam.rotation.x = -Math.PI / 2; beam.position.set(3.8, 0.01, 0); car.add(beam);

  /* ---------- Bedienung ---------- */
  let lights = true, track = 0, trackTarget = 0, flipStart = -1;
  ui.lights?.addEventListener("click", () => {
    lights = !lights;
    mats.head.emissiveIntensity = lights ? 2.5 : 0; mats.tail.emissiveIntensity = lights ? 2.2 : 0.15; beam.visible = lights;
    ui.lights.classList.toggle("on", lights);
  });
  ui.track?.addEventListener("click", () => { trackTarget = trackTarget ? 0 : 1; ui.track.classList.toggle("on", !!trackTarget); });
  ui.flip?.addEventListener("click", () => { if (flipStart < 0) flipStart = performance.now(); });

  /* ---------- Größe und Schleife ---------- */
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Auf schmalen Bildschirmen weiter weg, damit das ganze Auto ins Bild passt
    camera.fov = w / h < 1 ? 48 : 32;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let visible = true, raf = 0, last = performance.now();
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }).observe(canvas);

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    // Track Mode: Auto senkt sich, Flügel fährt aus
    track += (trackTarget - track) * Math.min(1, dt * 4);
    lift.position.y = -0.05 * track;
    wing.position.y = topY(-1.98) + 0.015 + 0.3 * track;
    struts.forEach((s) => { s.scale.y = Math.max(0.001, 0.3 * track); s.position.y = -0.15 * track; });
    blade.rotation.z = 0.12 + 0.1 * track;
    // Kickflip: hochspringen, einmal um die Längsachse drehen, landen
    if (flipStart >= 0) {
      const u = clamp01((now - flipStart) / 1400);
      lift.position.y += Math.sin(u * Math.PI) * 1.4;
      car.rotation.x = easeInOut(clamp01((u - 0.12) / 0.76)) * Math.PI * 2;
      if (u >= 1) { flipStart = -1; car.rotation.x = 0; }
    }
    beam.visible = lights && flipStart < 0;
    halo.material.opacity = 0.25 + 0.12 * Math.sin(now / 600);
    controls.update();
    renderer.render(scene, camera);
    raf = visible ? requestAnimationFrame(loop) : 0;
  }
  raf = requestAnimationFrame(loop);
  return { renderer };
}
