import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

const root = document.getElementById("scrollRoot");
const scenes = [...document.querySelectorAll(".scene")];
const reveals = [...document.querySelectorAll(".reveal")];
const cards = [...document.querySelectorAll(".artifact-card")];
const chapterNumber = document.getElementById("chapterNumber");
const chapterTitle = document.getElementById("chapterTitle");
const miniChapter = document.getElementById("miniChapter");
const scrollMeter = document.getElementById("scrollMeter");
const stepButtons = [...document.querySelectorAll("[data-step]")];
const jumpLinks = [...document.querySelectorAll("[data-jump]")];
const canvas = document.getElementById("sealCanvas");
const galleryRig = document.getElementById("galleryRig");
const vesselCanvas = document.getElementById("vesselCanvas");
const vesselCtx = vesselCanvas?.getContext("2d");

let activeIndex = 0;
let virtualIndex = 0;
let pageProgress = 0;
let ticking = false;
let mouseX = 0.5;
let mouseY = 0.5;
let dragActive = false;
let dragStartX = 0;
let dragStartRotation = 0;
let userRotation = 0;
let stampPulse = 0;
let endingLift = 0;
let endingLiftTarget = 0;
let vesselParticles = [];
let vesselHot = 0;
let currentMidPresence = 0;

const chapters = cards.map(card => card.querySelector("span")?.textContent?.trim() || "");

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setClearColor(0x000000, 0);
renderer.sortObjects = true;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x010302, 0.045);

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
camera.position.set(0, 1.7, 6.4);

const topLight = new THREE.DirectionalLight(0xd8efdc, 1.55);
topLight.position.set(-2.2, 3.4, 2.8);
scene.add(topLight);

const sealGroup = new THREE.Group();
scene.add(sealGroup);

const sealUniforms = {
  uTime: { value: 0 },
  uScroll: { value: 0 },
  uMouse: { value: new THREE.Vector2(0.5, 0.5) },
  uLightBoost: { value: 0.45 },
  uBaseColor: { value: new THREE.Color(0x8fb6a5) },
  uEdgeColor: { value: new THREE.Color(0xcde2d4) }
};

const sealMaterial = new THREE.ShaderMaterial({
  uniforms: sealUniforms,
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec3 vViewDirection;

    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vNormal = normalize(mat3(modelMatrix) * normal);
      vViewDirection = normalize(cameraPosition - worldPosition.xyz);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  fragmentShader: `
    precision highp float;

    uniform float uTime;
    uniform float uScroll;
    uniform float uLightBoost;
    uniform vec2 uMouse;
    uniform vec3 uBaseColor;
    uniform vec3 uEdgeColor;

    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec3 vViewDirection;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + vec3(.1, .2, .3));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);

      return mix(
        mix(
          mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x),
          f.y
        ),
        mix(
          mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x),
          f.y
        ),
        f.z
      );
    }

    float fbm(vec3 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += noise(p) * a;
        p *= 2.05;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec3 n = normalize(vNormal);
      vec3 v = normalize(vViewDirection);
      vec3 keyLight = normalize(vec3(-0.36, 0.86, 0.36));

      float rawDiffuse = max(dot(n, keyLight), 0.0);
      float diffuse = pow(rawDiffuse, 1.18);
      float rim = pow(1.0 - max(dot(n, v), 0.0), 3.85);
      float grazing = pow(max(dot(reflect(-keyLight, n), v), 0.0), 18.0);
      float glazeNoise = fbm(vWorldPosition * 5.4 + vec3(0.0, uTime * 0.015, 0.0));
      float kilnSpeckle = fbm(vWorldPosition * 19.0 + vec3(2.0, 0.0, 1.0));
      float fineCrackle = smoothstep(0.49, 0.515, abs(fbm(vWorldPosition * 42.0) - 0.5));
      float slowSheen = smoothstep(0.0, 1.0, sin(vWorldPosition.x * 2.1 + vWorldPosition.y * 1.15 - uTime * 0.18) * 0.5 + 0.5);
      float scrollLight = 0.72 + uScroll * 0.1 + uLightBoost * 0.62;

      vec3 jade = mix(uBaseColor, vec3(0.62, 0.73, 0.67), glazeNoise * 0.22);
      vec3 deep = vec3(0.13, 0.22, 0.19);
      float topCatch = smoothstep(0.26, 0.92, n.y);
      vec3 color = mix(deep, jade, 0.42 + diffuse * 0.56);
      color += uEdgeColor * rim * (0.16 + uScroll * 0.035);
      color += vec3(0.82, 0.93, 0.82) * grazing * 0.22;
      color += vec3(0.36, 0.5, 0.42) * topCatch * diffuse * 0.18;
      color -= vec3(0.05, 0.08, 0.07) * (1.0 - diffuse) * 0.32;
      color -= vec3(0.06, 0.08, 0.07) * fineCrackle * 0.26;
      color += vec3(0.11, 0.16, 0.13) * kilnSpeckle * 0.035;
      color += vec3(0.17, 0.25, 0.21) * slowSheen * 0.012 * diffuse;

      float redSplit = rim * 0.006;
      color.r += redSplit;
      color.b += rim * 0.004;
      color *= scrollLight;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
  transparent: false
});

const inkMaterial = new THREE.MeshBasicMaterial({
  color: 0x8a2420,
  transparent: true,
  opacity: 0.34,
  depthWrite: false
});

const inkTrayMaterial = new THREE.MeshBasicMaterial({
  color: 0x160b0b,
  transparent: true,
  opacity: 0.62,
  depthWrite: false
});

const paperMaterial = new THREE.MeshBasicMaterial({
  color: 0xe9dfc8,
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
  depthWrite: false
});

function makeSoftSpotTexture(stops) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 256;
  const context = textureCanvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 12, 128, 128, 126);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.needsUpdate = true;
  return texture;
}

function makeStampTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 512;
  const context = textureCanvas.getContext("2d");
  context.clearRect(0, 0, 512, 512);
  context.strokeStyle = "rgba(148, 20, 16, .98)";
  context.fillStyle = "rgba(148, 20, 16, .96)";
  context.lineCap = "square";
  context.lineJoin = "round";

  context.lineWidth = 38;
  context.strokeRect(72, 72, 368, 368);
  context.lineWidth = 22;
  context.strokeRect(112, 112, 288, 288);

  const strokes = [
    [150, 156, 150, 356], [150, 156, 246, 156], [246, 156, 246, 246], [150, 252, 246, 252],
    [292, 156, 364, 156], [292, 156, 292, 356], [292, 252, 360, 252], [360, 156, 360, 356],
    [150, 356, 246, 356], [246, 296, 246, 356], [292, 356, 364, 356]
  ];
  context.lineWidth = 28;
  strokes.forEach(([x1, y1, x2, y2], index) => {
    context.globalAlpha = index % 3 === 0 ? 0.84 : 0.98;
    context.beginPath();
    context.moveTo(x1 + Math.sin(index) * 3, y1 + Math.cos(index) * 3);
    context.lineTo(x2 + Math.cos(index * 1.7) * 3, y2 + Math.sin(index * 1.3) * 3);
    context.stroke();
  });

  context.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 58; i++) {
    const x = 70 + Math.random() * 372;
    const y = 70 + Math.random() * 372;
    const r = 1.2 + Math.random() * 4.5;
    context.globalAlpha = 0.12 + Math.random() * 0.22;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.needsUpdate = true;
  return texture;
}

const stampMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  map: makeStampTexture(),
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
  depthWrite: false,
  depthTest: false
});

function makeRoundedBlockGeometry(width, depth, height, radius) {
  const x = width / 2 - radius;
  const y = depth / 2 - radius;
  const shape = new THREE.Shape();
  shape.moveTo(-x, -depth / 2);
  shape.lineTo(x, -depth / 2);
  shape.quadraticCurveTo(width / 2, -depth / 2, width / 2, -y);
  shape.lineTo(width / 2, y);
  shape.quadraticCurveTo(width / 2, depth / 2, x, depth / 2);
  shape.lineTo(-x, depth / 2);
  shape.quadraticCurveTo(-width / 2, depth / 2, -width / 2, y);
  shape.lineTo(-width / 2, -y);
  shape.quadraticCurveTo(-width / 2, -depth / 2, -x, -depth / 2);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelSize: 0.055,
    bevelThickness: 0.08,
    bevelSegments: 8,
    curveSegments: 18,
    steps: 1
  });
  geometry.rotateX(Math.PI / 2);
  geometry.center();
  const position = geometry.attributes.position;
  let topY = -Infinity;
  for (let i = 0; i < position.count; i++) {
    topY = Math.max(topY, position.getY(i));
  }
  const halfW = width * 0.5;
  const halfD = depth * 0.5;
  for (let i = 0; i < position.count; i++) {
    const px = position.getX(i);
    const py = position.getY(i);
    const pz = position.getZ(i);
    const edgeDistance = Math.max(Math.abs(px) / halfW, Math.abs(pz) / halfD);
    const handcrafted = Math.sin(px * 7.1 + pz * 3.4) * Math.sin(pz * 5.2) * 0.004;
    if (py > topY - 0.035) {
      const dome = Math.max(0, 1 - edgeDistance * edgeDistance);
      position.setY(i, py + dome * 0.055 + handcrafted);
    } else if (edgeDistance > 0.82) {
      position.setY(i, py + handcrafted * 0.65);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

const SEAL_FOOTPRINT = 1.08;
const SEAL_HEIGHT = 1.48;
const INK_PAD_HEIGHT = 0.052;
const INK_TRAY_HEIGHT = 0.105;
const INK_PAD_Y = -0.54;

const sealMesh = new THREE.Mesh(makeRoundedBlockGeometry(SEAL_FOOTPRINT, SEAL_FOOTPRINT, SEAL_HEIGHT, 0.13), sealMaterial);
sealMesh.castShadow = false;
sealMesh.receiveShadow = false;
sealGroup.add(sealMesh);

const stampFace = new THREE.Mesh(
  new THREE.PlaneGeometry(0.86, 0.86, 1, 1),
  new THREE.MeshBasicMaterial({
    color: 0x18352f,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false
  })
);
stampFace.rotation.x = -Math.PI / 2;
stampFace.position.y = -SEAL_HEIGHT / 2 - 0.006;
sealGroup.add(stampFace);

const inkTray = new THREE.Mesh(makeRoundedBlockGeometry(1.56, 1.28, INK_TRAY_HEIGHT, 0.16), inkTrayMaterial);
inkTray.position.set(0, INK_PAD_Y - 0.026, 0.02);
scene.add(inkTray);

const inkPad = new THREE.Mesh(makeRoundedBlockGeometry(1.1, 0.82, INK_PAD_HEIGHT, 0.1), inkMaterial);
inkPad.position.set(0, INK_PAD_Y + 0.035, 0.02);
scene.add(inkPad);

function makeInkRim(width, depth, y, z, color, opacity) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-width / 2, y, -depth / 2 + z),
    new THREE.Vector3(width / 2, y, -depth / 2 + z),
    new THREE.Vector3(width / 2, y, depth / 2 + z),
    new THREE.Vector3(-width / 2, y, depth / 2 + z)
  ]);
  const line = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false
  }));
  line.renderOrder = 6;
  return line;
}

const inkTrayRim = makeInkRim(1.5, 1.22, INK_PAD_Y + 0.034, 0.02, 0x2b1110, 0.62);
scene.add(inkTrayRim);

const inkPadRim = makeInkRim(1.08, 0.8, INK_PAD_Y + 0.072, 0.02, 0xb64a3d, 0.52);
scene.add(inkPadRim);

const inkPadSheen = new THREE.Mesh(
  new THREE.PlaneGeometry(1.06, 0.76, 1, 1),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: makeSoftSpotTexture([
      [0, "rgba(255,130,105,.22)"],
      [0.48, "rgba(155,36,32,.1)"],
      [1, "rgba(120,20,20,0)"]
    ]),
    transparent: true,
    opacity: 0,
    depthWrite: false
  })
);
inkPadSheen.rotation.x = -Math.PI / 2;
inkPadSheen.position.set(0, INK_PAD_Y + 0.068, 0.022);
inkPadSheen.renderOrder = 3;
scene.add(inkPadSheen);

const contactShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(0.9, 0.9, 1, 1),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: makeSoftSpotTexture([
      [0, "rgba(0,0,0,.92)"],
      [0.42, "rgba(0,0,0,.58)"],
      [0.74, "rgba(0,0,0,.18)"],
      [1, "rgba(0,0,0,0)"]
    ]),
    transparent: true,
    opacity: 0,
    depthWrite: false
  })
);
contactShadow.rotation.x = -Math.PI / 2;
contactShadow.position.set(0, INK_PAD_Y + 0.068, 0.01);
contactShadow.renderOrder = 4;
scene.add(contactShadow);

const pressureMark = new THREE.Mesh(
  new THREE.PlaneGeometry(0.66, 0.66, 1, 1),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: makeSoftSpotTexture([
      [0, "rgba(78,8,8,.9)"],
      [0.38, "rgba(96,16,14,.62)"],
      [0.72, "rgba(118,28,24,.18)"],
      [1, "rgba(118,28,24,0)"]
    ]),
    transparent: true,
    opacity: 0,
    depthWrite: false
  })
);
pressureMark.rotation.x = -Math.PI / 2;
pressureMark.position.set(0, INK_PAD_Y + 0.07, 0.012);
pressureMark.renderOrder = 5;
scene.add(pressureMark);

const paper = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.45, 12, 4), paperMaterial);
paper.rotation.x = -Math.PI / 2;
paper.position.set(0, -0.76, 0.25);
paper.scale.set(1, 0.02, 1);
scene.add(paper);

const stampMark = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), stampMaterial);
stampMark.rotation.x = -Math.PI / 2;
stampMark.position.set(0, -0.736, 0.18);
stampMark.renderOrder = 12;
scene.add(stampMark);

const timeStream = new THREE.Group();
scene.add(timeStream);

for (let i = 0; i < 3; i++) {
  const offset = (i - 1) * 0.18;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.85 + offset, -0.42, -5.0),
    new THREE.Vector3(-0.9 + offset * 0.4, -0.2, -2.5),
    new THREE.Vector3(0.05 + offset * 0.16, 0.03, -0.34),
    new THREE.Vector3(1.45 + offset, 0.12, 1.42)
  ]);
  const tube = new THREE.TubeGeometry(curve, 96, i === 1 ? 0.0038 : 0.0022, 5, false);
  const line = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({
    color: i === 1 ? 0xcbb66a : 0x6dbca8,
    transparent: true,
    opacity: 0.035,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  timeStream.add(line);
}

const particleCount = 900;
const particlePositions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i++) {
  const radius = 1.5 + Math.random() * 5.2;
  const angle = Math.random() * Math.PI * 2;
  particlePositions[i * 3] = Math.cos(angle) * radius;
  particlePositions[i * 3 + 1] = -1.0 + Math.random() * 3.4;
  particlePositions[i * 3 + 2] = Math.sin(angle) * radius - Math.random() * 4.5;
}

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({
  color: 0xa8d8c1,
  transparent: true,
  opacity: 0.36,
  size: 0.018,
  depthWrite: false,
  blending: THREE.AdditiveBlending
}));
scene.add(particles);

function easeInOut(t) {
  return t * t * (3 - 2 * t);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function vesselRadiusAt(y) {
  if (y < -0.88) return 0.34 + (y + 1.02) * 0.45;
  if (y < -0.62) return 0.22 + (y + 0.88) * 0.2;
  if (y < -0.38) return 0.25 + (y + 0.62) * 1.65;
  if (y < 0.28) return 0.68 + Math.cos((y + 0.02) * Math.PI) * 0.12;
  if (y < 0.78) return 0.62 - (y - 0.28) * 0.78;
  return 0;
}

function addSurfaceParticle(list, y, angle, radius, type = "body") {
  const jitter = (Math.random() - 0.5) * 0.035;
  const r = radius + jitter;
  list.push({
    x: Math.cos(angle) * r,
    y: y + (Math.random() - 0.5) * 0.024,
    z: Math.sin(angle) * r * 0.88,
    size: type === "spark" ? 2.2 : 1.35 + Math.random() * 2.1,
    type,
    phase: Math.random() * Math.PI * 2,
    alpha: type === "body" ? 0.48 + Math.random() * 0.46 : 0.42 + Math.random() * 0.4
  });
}

function buildVesselParticles() {
  const list = [];
  const count = window.innerWidth <= 430 ? 1800 : 2800;

  for (let i = 0; i < count; i++) {
    const y = -1.02 + Math.random() * 1.8;
    const radius = vesselRadiusAt(y);
    if (radius <= 0) continue;
    addSurfaceParticle(list, y, Math.random() * Math.PI * 2, radius, "body");
  }

  for (let i = 0; i < 240; i++) {
    const t = Math.random();
    const a = -1.22 + t * Math.PI * 1.3;
    list.push({
      x: 0.72 + Math.cos(a) * 0.3,
      y: -0.42 + Math.sin(a) * 0.58,
      z: 0.06 + (Math.random() - 0.5) * 0.28,
      size: 1.2 + Math.random() * 2,
      type: "handle",
      phase: Math.random() * 6.28,
      alpha: 0.52 + Math.random() * 0.4
    });
  }

  for (let i = 0; i < 160; i++) {
    const t = Math.random();
    list.push({
      x: -0.42 - t * 0.42,
      y: -0.34 + Math.sin(t * Math.PI) * 0.15 + (Math.random() - 0.5) * 0.05,
      z: 0.05 + (Math.random() - 0.5) * 0.2,
      size: 1.15 + Math.random() * 1.9,
      type: "spout",
      phase: Math.random() * 6.28,
      alpha: 0.54 + Math.random() * 0.36
    });
  }

  for (let i = 0; i < 340; i++) {
    const y = -0.92 + Math.random() * 1.44;
    const angle = Math.random() * Math.PI * 2;
    const radius = vesselRadiusAt(y) * (0.74 + Math.random() * 0.16);
    addSurfaceParticle(list, y, angle, radius, "spark");
  }

  vesselParticles = list;
}

function resizeVesselCanvas() {
  if (!vesselCanvas || !vesselCtx) return;
  const rect = vesselCanvas.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  vesselCanvas.width = Math.max(1, Math.round(rect.width * ratio));
  vesselCanvas.height = Math.max(1, Math.round(rect.height * ratio));
  vesselCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  buildVesselParticles();
}

function updateVesselHot(clientX, clientY) {
  if (!vesselCanvas) return;
  const rect = vesselCanvas.getBoundingClientRect();
  const centerX = rect.left + rect.width * 0.5;
  const centerY = rect.top + rect.height * 0.5;
  const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.48);
  const distance = Math.hypot(clientX - centerX, clientY - centerY);
  vesselHot = Math.max(0, 1 - distance / radius);
  document.documentElement.classList.toggle("vessel-hot", vesselHot > 0.08 && currentMidPresence > 0.2);
}

function drawVessel(time = 0, presence = 0) {
  if (!vesselCanvas || !vesselCtx) return;
  const rect = vesselCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const centerX = width * 0.5;
  const centerY = height * 0.53;
  const scale = Math.min(width * 0.58, height * 0.48);
  const hoverEase = vesselHot * vesselHot * presence;
  const angle = virtualIndex * 0.62 + (mouseX - 0.5) * (0.3 + hoverEase * 0.25) + time * (0.00012 + hoverEase * 0.0002);
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);

  vesselCtx.clearRect(0, 0, width, height);
  if (presence <= 0.01) return;

  vesselCtx.globalCompositeOperation = "lighter";
  const sorted = vesselParticles.map((p, index) => {
    const rx = p.x * cos - p.z * sin;
    const rz = p.x * sin + p.z * cos;
    return { index, rx, rz };
  }).sort((a, b) => a.rz - b.rz);

  sorted.forEach(projected => {
    const p = vesselParticles[projected.index];
    const depth = Math.min(1.25, Math.max(-0.2, (projected.rz + 0.74) / 1.48));
    const perspective = 0.84 + depth * 0.22;
    const burst = hoverEase * 0.055 * Math.sin(time * 0.004 + p.phase);
    const x = centerX + projected.rx * scale * perspective * (1 + burst) + (mouseX - 0.5) * (18 + hoverEase * 18);
    const y = centerY + p.y * scale * (1 + burst * 0.6) + projected.rz * scale * 0.08 + (mouseY - 0.5) * (12 + hoverEase * 10);
    const shimmer = 0.76 + Math.sin(time * 0.002 + p.phase + virtualIndex) * (0.24 + hoverEase * 0.2);
    const alpha = Math.max(0.04, p.alpha * presence * (0.42 + depth * 0.6 + hoverEase * 0.18) * shimmer);
    const size = p.size * (0.72 + depth * 0.82 + hoverEase * 0.42);
    const hue = p.type === "spark" ? "228,246,218" : p.type === "spout" ? "176,222,196" : "132,211,178";

    vesselCtx.beginPath();
    vesselCtx.fillStyle = `rgba(${hue},${alpha})`;
    vesselCtx.arc(x, y, size, 0, Math.PI * 2);
    vesselCtx.fill();
  });

  vesselCtx.globalCompositeOperation = "source-over";
  vesselCtx.strokeStyle = `rgba(166,238,199,${0.24 * presence})`;
  vesselCtx.lineWidth = 1.3;
  vesselCtx.beginPath();
  vesselCtx.moveTo(centerX - scale * 0.24, centerY - scale * 0.78);
  vesselCtx.bezierCurveTo(centerX - scale * 0.3, centerY - scale * 0.66, centerX - scale * 0.24, centerY - scale * 0.54, centerX - scale * 0.42, centerY - scale * 0.45);
  vesselCtx.bezierCurveTo(centerX - scale * 0.7, centerY - scale * 0.32, centerX - scale * 0.82, centerY + scale * 0.08, centerX - scale * 0.62, centerY + scale * 0.48);
  vesselCtx.bezierCurveTo(centerX - scale * 0.48, centerY + scale * 0.76, centerX - scale * 0.28, centerY + scale * 0.82, centerX, centerY + scale * 0.82);
  vesselCtx.bezierCurveTo(centerX + scale * 0.28, centerY + scale * 0.82, centerX + scale * 0.48, centerY + scale * 0.76, centerX + scale * 0.62, centerY + scale * 0.48);
  vesselCtx.bezierCurveTo(centerX + scale * 0.82, centerY + scale * 0.08, centerX + scale * 0.7, centerY - scale * 0.32, centerX + scale * 0.42, centerY - scale * 0.45);
  vesselCtx.bezierCurveTo(centerX + scale * 0.24, centerY - scale * 0.54, centerX + scale * 0.3, centerY - scale * 0.66, centerX + scale * 0.24, centerY - scale * 0.78);
  vesselCtx.stroke();

  vesselCtx.beginPath();
  vesselCtx.ellipse(centerX, centerY - scale * 0.86, scale * 0.36, scale * 0.08, 0, 0, Math.PI * 2);
  vesselCtx.stroke();
  vesselCtx.beginPath();
  vesselCtx.ellipse(centerX + scale * 0.62, centerY - scale * 0.36, scale * 0.32, scale * 0.56, 0.08, -Math.PI * 0.58, Math.PI * 0.58);
  vesselCtx.stroke();
  vesselCtx.beginPath();
  vesselCtx.moveTo(centerX - scale * 0.4, centerY - scale * 0.42);
  vesselCtx.quadraticCurveTo(centerX - scale * 0.78, centerY - scale * 0.42, centerX - scale * 0.92, centerY - scale * 0.3);
  vesselCtx.stroke();
  vesselCtx.beginPath();
  vesselCtx.ellipse(centerX, centerY + scale * 0.79, scale * 0.32, scale * 0.07, 0, 0, Math.PI * 2);
  vesselCtx.stroke();
}

function updateHud() {
  if (chapterNumber) chapterNumber.textContent = String(activeIndex + 1).padStart(2, "0");
  if (chapterTitle) chapterTitle.textContent = chapters[activeIndex] || "";
  if (miniChapter) miniChapter.textContent = chapters[activeIndex] || "窑火印";
  document.documentElement.dataset.scene = String(activeIndex);
  document.documentElement.classList.toggle("is-seal-page", activeIndex === 0 || activeIndex === scenes.length - 1);
  document.documentElement.classList.toggle("is-middle-page", activeIndex > 0 && activeIndex < scenes.length - 1);
  jumpLinks.forEach(link => link.classList.toggle("is-current", Number(link.dataset.jump) === activeIndex));
}

function updateGallery() {
  const focusIndex = Math.min(cards.length - 1, Math.max(0, Math.round(virtualIndex)));
  cards.forEach((card, index) => {
    const offset = index - virtualIndex;
    const wrapped = Math.abs(offset) > cards.length / 2
      ? offset - Math.sign(offset) * cards.length
      : offset;
    const abs = Math.abs(wrapped);
    const x = Math.sin(wrapped * 0.68) * 45;
    const y = wrapped * 78 + Math.sin((index + virtualIndex) * 1.22) * 18;
    const z = -Math.min(abs, 4) * 152;
    const rotateY = wrapped * -23;
    const rotateX = Math.sin((index - virtualIndex) * 0.8) * 4;
    const rotateZ = Math.sign(wrapped || 1) * Math.min(abs, 2.8) * 5;
    const scale = Math.max(0.6, 1 - abs * 0.105);
    const opacity = abs > 3.4 ? 0 : 1 - abs * 0.18;
    const mobileOpacity = window.innerWidth <= 430
      ? (abs < 0.35 ? 0.92 : abs < 2.4 ? Math.max(0.5, opacity * 0.56) : 0.16)
      : opacity * 0.72;

    card.style.setProperty("--panel-transform", `translate3d(${x}vw, ${y}px, ${z}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg) scale(${scale})`);
    card.style.setProperty("--panel-opacity", mobileOpacity.toFixed(2));
    card.style.setProperty("--panel-sat", index === focusIndex ? "1.1" : "0.64");
    card.style.setProperty("--panel-blur", abs > 1.8 ? "2px" : "0");
    card.classList.toggle("is-active", index === focusIndex);
  });
}

function updateSceneProgress() {
  const maxScroll = Math.max(1, root.scrollHeight - root.clientHeight);
  pageProgress = root.scrollTop / maxScroll;
  virtualIndex = Math.min(scenes.length - 1, Math.max(0, root.scrollTop / Math.max(1, root.clientHeight)));

  document.documentElement.style.setProperty("--scroll-progress", pageProgress.toFixed(4));
  document.documentElement.style.setProperty("--virtual-index", virtualIndex.toFixed(4));
  if (scrollMeter) scrollMeter.style.transform = `scaleY(${pageProgress.toFixed(4)})`;

  scenes.forEach(scene => {
    const rect = scene.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)));
    scene.style.setProperty("--active-progress", progress.toFixed(4));
  });

  updateGallery();
}

function scrollToScene(index) {
  scenes[Math.min(scenes.length - 1, Math.max(0, index))]?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function resizeRenderer() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate(timeMs = 0) {
  const time = timeMs * 0.001;
  const opening = 1 - easeInOut(Math.min(1, virtualIndex * 0.96));
  const firstMove = easeInOut(Math.min(1, virtualIndex * 0.72));
  const ending = easeInOut(Math.max(0, virtualIndex - (scenes.length - 2)) / 1.02);
  const mid = 1 - Math.max(opening, ending);
  const midPresence = clamp01((virtualIndex - 0.58) / 0.36) * (1 - clamp01((virtualIndex - 5.05) / 0.55));
  const sealPresence = Math.max(opening, ending);
  currentMidPresence = midPresence;
  document.documentElement.style.setProperty("--seal-presence", sealPresence.toFixed(3));
  document.documentElement.style.setProperty("--opening-presence", opening.toFixed(3));
  document.documentElement.style.setProperty("--ending-presence", ending.toFixed(3));
  canvas.style.setProperty("opacity", (sealPresence * 0.94).toFixed(3), "important");
  if (vesselCanvas) vesselCanvas.style.opacity = (midPresence * (0.82 + vesselHot * 0.16)).toFixed(3);
  if (galleryRig) {
    galleryRig.style.opacity = midPresence.toFixed(3);
    galleryRig.style.pointerEvents = midPresence > 0.35 ? "auto" : "none";
  }

  sealUniforms.uTime.value = time;
  sealUniforms.uScroll.value = pageProgress;
  sealUniforms.uMouse.value.set(mouseX, mouseY);
  sealUniforms.uLightBoost.value = 0.36 + firstMove * 0.32 + ending * 0.46;

  endingLift += (endingLiftTarget - endingLift) * 0.085;

  const sealScale = canvas.clientWidth < 520 ? 0.48 : 0.56;
  const restingY = INK_PAD_Y + 0.068 + (SEAL_HEIGHT * sealScale) / 2 - 0.01;
  const paperStampY = paper.position.y + (SEAL_HEIGHT * sealScale) / 2 + 0.012;
  const liftY = firstMove * 0.82;
  const openingY = restingY + liftY;
  const endingY = paperStampY + endingLift * 0.28;
  const floatY = Math.sin(time * 1.1) * 0.014 * Math.max(firstMove, ending);
  sealGroup.position.y = openingY * (1 - ending) + endingY * ending + floatY;
  sealGroup.position.z = 0.02 - firstMove * 0.06 + ending * 0.28;
  sealGroup.rotation.x = 0.05 + firstMove * 0.04 + ending * (0.04 + endingLift * 0.08);
  sealGroup.rotation.y = -0.34 + userRotation * 0.35 + ending * (0.08 + endingLift * 0.1);
  sealGroup.rotation.z = 0.012;
  const breath = 1 + Math.sin(time * 1.05) * 0.004 * Math.max(firstMove, ending);
  sealGroup.scale.setScalar(sealScale * breath);

  const pressWeight = Math.max(opening * (1 - firstMove * 0.48), ending * 0.72);
  inkTray.material.opacity = 0.46 * opening + 0.12 * (1 - Math.min(1, firstMove * 1.4));
  inkPad.material.opacity = 0.34 * opening + 0.12 * (1 - Math.min(1, firstMove * 1.4));
  inkPadSheen.material.opacity = 0.18 * opening * (0.7 + firstMove * 0.3);
  inkTrayRim.material.opacity = 0.62 * opening;
  inkPadRim.material.opacity = 0.52 * opening;
  contactShadow.material.opacity = Math.min(0.5, pressWeight * 0.48);
  contactShadow.scale.setScalar(0.86 + pressWeight * 0.2);
  pressureMark.material.opacity = Math.min(0.46, opening * (0.3 + firstMove * 0.16));
  pressureMark.scale.setScalar(0.92 + firstMove * 0.08);
  stampFace.material.opacity = 0.16 * opening;
  timeStream.children.forEach((line, index) => {
    const anchor = index === 1 ? 1 : 0.52;
    line.material.opacity = sealPresence * (0.018 + firstMove * 0.055 + ending * 0.022) * anchor;
  });

  const paperOpen = easeInOut(Math.max(0, (virtualIndex - 5.15) / 0.82));
  paper.material.opacity = paperOpen * 0.78;
  paper.scale.y = 0.04 + paperOpen * 1.08;
  paper.position.z = 0.7 - paperOpen * 0.48;
  stampPulse = Math.max(stampPulse * 0.92, endingLift * ending * 0.8);
  stampMark.material.opacity = Math.min(1, ending * endingLift * 1.36);
  stampMark.scale.setScalar(0.96 + stampPulse * 0.08);

  particles.rotation.y = time * 0.014 + pageProgress * 0.5;
  particles.rotation.x = Math.sin(time * 0.18) * 0.06;
  particles.material.opacity = 0.24 + firstMove * 0.12 - ending * 0.08;

  const cameraPush = 8.2 - firstMove * 0.82 - ending * 0.6;
  camera.position.set(
    (mouseX - 0.5) * 0.22 * (1 - ending),
    1.7 - firstMove * 0.35 - ending * 0.55 + (mouseY - 0.5) * -0.16,
    cameraPush
  );
  camera.lookAt(0, 0.02 - ending * 0.32, 0);

  topLight.intensity = 1.28 + firstMove * 0.42 + ending * 0.24;

  renderer.render(scene, camera);
  drawVessel(timeMs, midPresence);
  requestAnimationFrame(animate);
}

const sceneObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    const sceneElement = entry.target;
    if (!entry.isIntersecting) return;

    activeIndex = Number(sceneElement.dataset.index || 0);
    if (activeIndex !== scenes.length - 1) {
      endingLiftTarget = 0;
      document.documentElement.classList.remove("is-ending-stamped");
    }
    scenes.forEach(item => item.classList.remove("is-active"));
    sceneElement.classList.add("is-active");
    sceneElement.querySelectorAll(".reveal").forEach(item => item.classList.add("in"));
    updateHud();
  });
}, { threshold: 0.55 });

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add("in");
  });
}, { threshold: 0.24 });

root.addEventListener("scroll", () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    updateSceneProgress();
    ticking = false;
  });
}, { passive: true });

cards.forEach((card, index) => {
  card.addEventListener("click", () => scrollToScene(index));
});

stepButtons.forEach(button => {
  button.addEventListener("click", () => {
    scrollToScene(activeIndex + Number(button.dataset.step || 0));
  });
});

scenes[scenes.length - 1]?.addEventListener("click", () => {
  endingLiftTarget = 1;
  document.documentElement.classList.add("is-ending-stamped");
});

jumpLinks.forEach(link => {
  link.addEventListener("click", event => {
    event.preventDefault();
    scrollToScene(Number(link.dataset.jump || 0));
  });
});

window.addEventListener("pointermove", event => {
  mouseX = Math.min(1, Math.max(0, event.clientX / Math.max(1, window.innerWidth)));
  mouseY = Math.min(1, Math.max(0, event.clientY / Math.max(1, window.innerHeight)));
  document.documentElement.style.setProperty("--mouse-x", mouseX.toFixed(4));
  document.documentElement.style.setProperty("--mouse-y", mouseY.toFixed(4));
  updateVesselHot(event.clientX, event.clientY);
  if (dragActive) userRotation = dragStartRotation + (event.clientX - dragStartX) * 0.008;
}, { passive: true });

window.addEventListener("pointerdown", event => {
  dragActive = true;
  dragStartX = event.clientX;
  dragStartRotation = userRotation;
  document.documentElement.classList.add("is-dragging-seal");
}, { passive: true });

window.addEventListener("pointerup", () => {
  dragActive = false;
  document.documentElement.classList.remove("is-dragging-seal");
});

window.addEventListener("pointercancel", () => {
  dragActive = false;
  document.documentElement.classList.remove("is-dragging-seal");
});

window.addEventListener("resize", () => {
  resizeRenderer();
  resizeVesselCanvas();
  updateSceneProgress();
});

scenes.forEach(sceneElement => sceneObserver.observe(sceneElement));
reveals.forEach(item => revealObserver.observe(item));
scenes[0]?.classList.add("is-active");
updateHud();
resizeRenderer();
resizeVesselCanvas();
updateGallery();
updateSceneProgress();
requestAnimationFrame(animate);
