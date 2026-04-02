import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ── Device ─────────────────────────────────────────────── */
const isMobile = matchMedia('(max-width: 768px)').matches;
const TAU = Math.PI * 2;
const DEG = d => d * Math.PI / 180;

/* ── Mount ──────────────────────────────────────────────── */
const wrap   = document.getElementById('mol3dWrap');
const canvas = document.getElementById('molCanvas');
if (!wrap || !canvas) throw new Error('mol3d: mount not found');

/* ── Scene ──────────────────────────────────────────────── */
const scene = new THREE.Scene();
scene.background = null;
scene.fog = new THREE.FogExp2(0x9ec8db, 0.042);

/* ── Camera ─────────────────────────────────────────────── */
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200); // Tighter FOV
camera.position.set(8, 4, 12);   // Moved much closer and lower

/* ── Renderer ───────────────────────────────────────────── */
const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha:            true,
    antialias:        true,
    powerPreference:  'high-performance',
    premultipliedAlpha: false,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace    = THREE.SRGBColorSpace;
renderer.shadowMap.enabled   = true;
renderer.shadowMap.type      = THREE.PCFSoftShadowMap;

/* ── Controls ───────────────────────────────────────────── */
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.85, 0);   // Lowered to look at the scaled-down nacelle
controls.enableDamping    = true;
controls.dampingFactor    = 0.05;
controls.enableZoom       = false;
controls.enablePan        = false;
controls.autoRotate       = true;
controls.autoRotateSpeed  = 0.5;
controls.minPolarAngle    = DEG(15);
controls.maxPolarAngle    = DEG(100);

let idleTimer;
const resetIdle = () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { controls.autoRotate = true; }, 2800);
};
controls.addEventListener('start', resetIdle);

/* ═══════════════════════════════════════════════════════════
   LIGHTING
════════════════════════════════════════════════════════════ */
scene.add(new THREE.AmbientLight(0xd0e8f5, 0.40));
scene.add(new THREE.HemisphereLight(0xbbd8f0, 0x3a6e30, 0.70));

const keyLight = new THREE.DirectionalLight(0xfff8e8, 2.6);
keyLight.position.set(8, 14, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near   =  0.5;
keyLight.shadow.camera.far    = 60;
keyLight.shadow.camera.left   = -18;
keyLight.shadow.camera.right  =  18;
keyLight.shadow.camera.top    =  18;
keyLight.shadow.camera.bottom = -18;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xd8eaf5, 0.6);
fillLight.position.set(-5, 2, 3);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xb0d8f0, 0.9);
rimLight.position.set(-3, -4, -6);
scene.add(rimLight);

/* ═══════════════════════════════════════════════════════════
   ENVIRONMENT GROUP  (sky, ground, trees — never affected
   by turbine transforms, but orbits with camera correctly)
════════════════════════════════════════════════════════════ */
const envGroup = new THREE.Group();
scene.add(envGroup);

/* ── Sky dome ───────────────────────────────────────────── */
const skyGeo = new THREE.SphereGeometry(120, 32, 16);
skyGeo.scale(-1, 1, -1); // inside-out
const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
        varying vec3 vPos;
        void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
        varying vec3 vPos;
        uniform float uTime;
        void main() {
            float t = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
            vec3 zenith  = vec3(0.16, 0.38, 0.72);
            vec3 horizon = vec3(0.68, 0.85, 0.97);
            vec3 col = mix(horizon, zenith, pow(t, 0.55));
            gl_FragColor = vec4(col, 1.0);
        }
    `,
});
envGroup.add(new THREE.Mesh(skyGeo, skyMat));

/* ── 3-D volumetric clouds ───────────────────────────────── */
const cloudMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
});
const cloudShadowMat = new THREE.MeshLambertMaterial({
    color: 0xc8d8e8,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
});

const puffLayouts = [
    // large fluffy cumulus
    [
        [0,    0,    0,    2.2],
        [-1.6, -0.4, 0.2, 1.7],
        [ 1.7, -0.3,-0.1, 1.8],
        [-0.6,  1.0, 0.1, 1.4],
        [ 0.8,  0.9,-0.2, 1.5],
        [-2.8, -0.8, 0,   1.2],
        [ 2.9, -0.7, 0.1, 1.3],
        [ 0.2, -0.6, 1.0, 1.1],
        [-1.0, -0.5,-1.1, 1.0],
    ],
    // medium wispy
    [
        [0,    0,    0,    1.5],
        [-1.2,-0.2,  0.1, 1.1],
        [ 1.3,-0.1, -0.2, 1.2],
        [ 0.1, 0.8,  0.0, 0.9],
        [-2.0,-0.5,  0.0, 0.8],
        [ 2.1,-0.4,  0.1, 0.9],
    ],
    // small puff
    [
        [0,    0,    0,    1.0],
        [-0.8,-0.1,  0.1, 0.75],
        [ 0.9,-0.1, -0.1, 0.80],
        [ 0.1, 0.6,  0.0, 0.60],
    ],
];

const cloudDefs = (() => {
    const inner = (() => {
        const count   = 10, r = 48;
        const layouts = [0,1,2,0,1,0,2,1,0,2];
        const speeds  = [0.016,0.011,0.020,0.008,0.014,0.019,0.010,0.015,0.012,0.018];
        const heights = [9,7,10,8,11,7,9,8,10,7];
        const jitter  = [0.05,-0.10,0.15,-0.04,0.20,-0.12,0.08,-0.18,0.11,-0.06];
        return Array.from({ length: count }, (_, i) => {
            const a = (i / count) * TAU + jitter[i];
            return [Math.cos(a)*r, heights[i], Math.sin(a)*r, layouts[i], speeds[i], a];
        });
    })();
    const outer = (() => {
        const count   = 8, r = 72;
        const layouts = [0,2,1,0,2,1,0,1];
        const speeds  = [0.007,0.010,0.006,0.009,0.008,0.011,0.007,0.009];
        const heights = [12,10,13,11,14,10,12,11];
        return Array.from({ length: count }, (_, i) => {
            const a = ((i + 0.5) / count) * TAU;
            return [Math.cos(a)*r, heights[i], Math.sin(a)*r, layouts[i], speeds[i], a];
        });
    })();
    return [...inner, ...outer];
})();

const cloudGroups = [];
const puffGeo = new THREE.SphereGeometry(1, 9, 7);

for (const [cx, cy, cz, layout, speed, angle] of cloudDefs) {
    const grp = new THREE.Group();
    grp.position.set(cx, cy, cz);
    grp.userData.driftSpeed  = speed;
    grp.userData.originAngle = angle; 
    grp.userData.radius      = Math.sqrt(cx * cx + cz * cz);
    grp.userData.originY     = cy;

    const puffs = puffLayouts[layout];
    for (let p = 0; p < puffs.length; p++) {
        const [dx, dy, dz, r] = puffs[p];
        const mat = dy < -0.2 ? cloudShadowMat : cloudMat;
        const mesh = new THREE.Mesh(puffGeo, mat);
        mesh.position.set(dx, dy, dz);
        mesh.scale.setScalar(r);
        grp.add(mesh);
    }
    envGroup.add(grp);
    cloudGroups.push(grp);
}

/* ── Ground ─────────────────────────────────────────────── */
const groundMat = new THREE.MeshLambertMaterial({ color: 0x3b6830 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -3.15;
ground.receiveShadow = true;
envGroup.add(ground);

const soilMat = new THREE.MeshLambertMaterial({ color: 0x2a1f0e });
const soil = new THREE.Mesh(new THREE.BoxGeometry(140, 12, 140), soilMat);
soil.position.y = -3.15 - 0.05 - 6;
envGroup.add(soil);

/* ── Vegetation builders ─────────────────────────────────── */
function makePine(x, z, scale) {
    const g = new THREE.Group();
    g.position.set(x, -3.15, z);
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07*scale, 0.12*scale, 1.0*scale, 7),
        new THREE.MeshLambertMaterial({ color: 0x5c3a1e })
    );
    trunk.position.y = 0.5 * scale;
    trunk.castShadow = true;
    g.add(trunk);
    const coneData = [
        { r:0.70, h:0.70, y:0.90, color:0x1e5c20 },
        { r:0.55, h:0.75, y:1.28, color:0x256e28 },
        { r:0.40, h:0.80, y:1.65, color:0x2e8232 },
    ];
    for (const d of coneData) {
        const cone = new THREE.Mesh(
            new THREE.ConeGeometry(d.r*scale, d.h*scale, 8),
            new THREE.MeshLambertMaterial({ color: d.color })
        );
        cone.position.y = d.y * scale;
        cone.castShadow = true;
        g.add(cone);
    }
    return g;
}

function makeBroadleaf(x, z, scale) {
    const g = new THREE.Group();
    g.position.set(x, -3.15, z);
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.10*scale, 0.16*scale, 1.4*scale, 8),
        new THREE.MeshLambertMaterial({ color: 0x4a2e12 })
    );
    trunk.position.y = 0.7 * scale;
    trunk.castShadow = true;
    g.add(trunk);
    const canopyPuffs = [
        { dx:0,    dy:2.0, dz:0,    r:0.80, color:0x2d7a25 },
        { dx:-0.5, dy:1.6, dz:0.3,  r:0.65, color:0x246b1e },
        { dx: 0.6, dy:1.7, dz:-0.2, r:0.60, color:0x358a2c },
        { dx: 0.1, dy:1.4, dz:-0.5, r:0.55, color:0x1f6018 },
        { dx:-0.3, dy:1.5, dz:-0.4, r:0.50, color:0x2e7824 },
    ];
    for (const p of canopyPuffs) {
        const m = new THREE.Mesh(
            new THREE.SphereGeometry(p.r*scale, 8, 6),
            new THREE.MeshLambertMaterial({ color: p.color })
        );
        m.position.set(p.dx*scale, p.dy*scale, p.dz*scale);
        m.castShadow = true;
        g.add(m);
    }
    return g;
}

function makePoplar(x, z, scale) {
    const g = new THREE.Group();
    g.position.set(x, -3.15, z);
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05*scale, 0.08*scale, 1.2*scale, 6),
        new THREE.MeshLambertMaterial({ color: 0x5a3515 })
    );
    trunk.position.y = 0.6 * scale;
    g.add(trunk);
    const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(0.28*scale, 2.6*scale, 7),
        new THREE.MeshLambertMaterial({ color: 0x1a5c1a })
    );
    foliage.position.y = 2.2 * scale;
    foliage.castShadow = true;
    g.add(foliage);
    return g;
}

function makeShrub(x, z, scale) {
    const g = new THREE.Group();
    g.position.set(x, -3.15, z);
    const puffs = [
        { dx:0,    dy:0.28, dz:0,    r:0.38, color:0x2a6e22 },
        { dx:-0.3, dy:0.20, dz:0.2,  r:0.32, color:0x347a2a },
        { dx: 0.35,dy:0.22, dz:-0.1, r:0.30, color:0x225e1c },
        { dx: 0.1, dy:0.18, dz:0.38, r:0.28, color:0x3a8030 },
        { dx:-0.28,dy:0.16, dz:-0.3, r:0.26, color:0x286020 },
    ];
    for (const p of puffs) {
        const m = new THREE.Mesh(
            new THREE.SphereGeometry(p.r*scale, 7, 5),
            new THREE.MeshLambertMaterial({ color: p.color })
        );
        m.position.set(p.dx*scale, p.dy*scale, p.dz*scale);
        m.castShadow = true;
        g.add(m);
    }
    return g;
}

function makeDeadTree(x, z, scale) {
    const g = new THREE.Group();
    g.position.set(x, -3.15, z);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3d2810 });
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06*scale, 0.11*scale, 1.8*scale, 6),
        trunkMat
    );
    trunk.position.y = 0.9 * scale;
    trunk.castShadow = true;
    g.add(trunk);
    const branches = [
        { ry:0.6,  rz:0.5,  len:0.7, y:1.4 },
        { ry:2.2,  rz:-0.4, len:0.6, y:1.6 },
        { ry:3.8,  rz:0.6,  len:0.5, y:1.9 },
        { ry:1.4,  rz:-0.5, len:0.45,y:2.2 },
    ];
    for (const b of branches) {
        const br = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025*scale, 0.04*scale, b.len*scale, 5),
            trunkMat
        );
        br.position.y = b.y * scale;
        br.rotation.y = b.ry;
        br.rotation.z = b.rz;
        br.position.x += Math.sin(b.ry) * b.len * 0.4 * scale;
        br.position.z += Math.cos(b.ry) * b.len * 0.4 * scale;
        g.add(br);
    }
    return g;
}

function makePlant(type, x, z, scale) {
    switch (type % 5) {
        case 0: return makePine(x, z, scale);
        case 1: return makeBroadleaf(x, z, scale);
        case 2: return makePoplar(x, z, scale);
        case 3: return makeShrub(x, z, scale);
        case 4: return makeDeadTree(x, z, scale);
    }
}

/* ── Forest ring — much denser, mixed types ─────────────── */
const treeData = [
    [-6.5,-7.2,1.15,0], [-4.0,-8.8,0.95,1], [-1.2,-9.5,1.10,2],
    [ 2.0,-9.0,1.05,0], [ 4.8,-8.2,0.90,3], [ 7.0,-6.8,1.20,1],
    [-8.5,-5.5,0.85,2], [ 9.2,-5.0,0.92,0], [-10.5,-3.0,1.05,4],
    [ 10.8,-2.5,0.88,1],[-11.0,-0.5,1.00,3],[ 11.2, 0.8,0.95,2],
    [-3.5,-11.0,0.80,1],[ 0.5,-12.0,1.00,0],[ 3.5,-11.5,0.85,2],
    [-5.5,-9.8,0.88,2], [ 1.2,-10.8,0.92,3], [-9.0,-6.5,0.95,1],
    [ 9.8,-4.0,0.82,4], [-2.0,-10.0,1.02,0], [ 6.5,-8.0,0.90,1],
    [-9.0, 1.5,1.10,1], [-9.8, 4.0,0.90,2], [-8.5, 6.5,1.05,0],
    [-7.0, 8.5,0.85,3], [-5.0,10.0,0.95,1], [-11.5, 6.0,0.80,4],
    [-10.5, 2.8,0.92,2],[-8.0, 9.5,0.88,1], [-12.5, 4.5,0.78,0],
    [-6.5, 11.5,0.82,3],[-4.0,12.5,0.85,2],
    [ 9.2, 1.8,1.00,3], [ 10.0, 4.5,0.88,0], [ 8.8, 7.0,1.12,1],
    [ 6.5, 9.0,0.92,2], [ 4.0,10.5,0.85,4], [ 11.5, 6.5,0.80,1],
    [ 10.8, 3.2,0.90,2],[ 8.0, 9.8,0.86,0], [ 12.5, 5.0,0.76,3],
    [ 5.5,12.0,0.80,1], [ 3.0,13.0,0.84,2],
    [-5.5, 3.5,0.70,3], [ 5.8, 3.2,0.72,1], [-4.5, 5.5,0.68,2],
    [ 4.2, 5.8,0.65,3], [-7.0, 2.0,0.75,0], [ 7.2, 2.2,0.73,4],
    [-6.2, 4.8,0.66,1], [ 6.0, 5.0,0.68,2],
    [-3.0,-13.5,0.78,1], [ 5.5,-13.0,0.82,0], [-8.0,-10.0,0.90,2],
    [ 8.5,-10.5,0.88,3], [ 0.0,-14.0,0.75,1], [-13.0,-1.0,0.85,4],
    [ 13.0, 1.0,0.82,2], [-15.0, 3.5,0.72,0], [ 14.5, 5.0,0.74,1],
    [-14.0,-4.5,0.80,3], [ 13.5,-5.0,0.78,2], [-5.0,-15.5,0.70,0],
    [ 4.5,-15.0,0.72,1], [-11.5,-8.5,0.85,2], [ 11.0,-9.0,0.83,3],
    [-16.0, 1.0,0.68,1], [ 15.8, 2.5,0.70,0], [ 0.0,-16.0,0.65,4],
    [-7.5,-14.0,0.75,2], [ 7.0,-13.5,0.77,1],
];

for (const [x, z, s, type] of treeData) {
    envGroup.add(makePlant(type, x, z, s));
}

/* ── Undergrowth bushes — denser, varied sizes ───────────── */
const bushMat = new THREE.MeshLambertMaterial({ color: 0x2d6628 });
const bushPositions = [
    [-2.8,-4.2], [2.5,-4.8], [-4.0,-3.0], [3.8,-3.2],
    [-1.5,-5.5], [1.2,-6.0], [-5.2,-1.5], [5.0,-1.8],
    [-3.5, 1.8], [3.2, 2.0], [-2.0, 3.5], [1.8, 3.8],
    [-6.0, 0.5], [6.2, 0.8], [-4.8, 4.5], [4.5, 4.2],
    [ 0.5,-7.0], [-6.5,-4.5],[6.8,-4.0], [-0.8, 5.2],
    [-3.2,-2.5], [3.0,-2.8], [-1.0,-3.8], [1.5,-4.0],
    [-5.8, 2.5], [5.5, 2.8], [-2.8, 5.0], [2.5, 5.5],
    [ 0.0,-8.0], [-7.5,-2.0],[7.0,-3.5], [-4.0, 6.5],
    [ 4.5,-7.5], [-8.0, 0.0],[ 7.8, 1.5], [ 0.5, 6.8],
];
for (const [bx, bz] of bushPositions) {
    const r = 0.18 + (Math.abs(bx * bz) % 0.28);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), bushMat);
    bush.position.set(bx, -3.15 + r * 0.5, bz);
    bush.castShadow = true;
    envGroup.add(bush);
}

/* ── Flower / wildflower patches ────────────────────────── */
const flowerColors = [0xe8d44d, 0xe05c8a, 0xf07030, 0xc0e040, 0xffffff];
const flowerSpots = [
    [1.5,-3.0], [-2.2,-3.5], [3.5,-2.0], [-3.8,-2.2],
    [0.8,-5.0], [-1.8,-6.2], [2.8,-6.0], [-5.0, 0.8],
    [4.8, 0.6], [-3.0, 3.0], [2.5, 3.5], [-1.5, 4.8],
];
for (let fi = 0; fi < flowerSpots.length; fi++) {
    const [fx, fz] = flowerSpots[fi];
    for (let k = 0; k < 5; k++) {
        const ox = (k * 0.31 % 0.4) - 0.2;
        const oz = (k * 0.47 % 0.4) - 0.2;
        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.012, 0.015, 0.22, 4),
            new THREE.MeshLambertMaterial({ color: 0x4a8c30 })
        );
        stem.position.set(fx + ox, -3.15 + 0.11, fz + oz);
        envGroup.add(stem);
        const petal = new THREE.Mesh(
            new THREE.SphereGeometry(0.055, 5, 4),
            new THREE.MeshLambertMaterial({ color: flowerColors[(fi + k) % flowerColors.length] })
        );
        petal.position.set(fx + ox, -3.15 + 0.24, fz + oz);
        envGroup.add(petal);
    }
}

/* ── Horizon relief — continuous terrain ring ───────────── */
function makeHorizonRing(innerR, outerR, yBase, peaks, colorOuter, colorInner) {
    const segments = peaks.length;
    const positions = [];
    const colors    = [];
    const indices   = [];
    const cOut = new THREE.Color(colorOuter);
    const cIn  = new THREE.Color(colorInner);

    for (let i = 0; i <= segments; i++) {
        const idx = i % segments;
        const a   = (i / segments) * TAU;
        const h   = peaks[idx];
        const cos = Math.cos(a), sin = Math.sin(a);

        positions.push(cos * outerR, yBase,     sin * outerR);
        colors.push(cOut.r, cOut.g, cOut.b);
        positions.push(cos * outerR, yBase + h, sin * outerR);
        colors.push(cOut.r, cOut.g, cOut.b);
        positions.push(cos * innerR, yBase + h * 0.2, sin * innerR);
        colors.push(cIn.r, cIn.g, cIn.b);
        positions.push(cos * innerR, yBase,     sin * innerR);
        colors.push(cIn.r, cIn.g, cIn.b);
    }

    for (let i = 0; i < segments; i++) {
        const a = i * 4, b = (i + 1) * 4;
        indices.push(a, b, a+1,  b, b+1, a+1);   
        indices.push(a+1, b+1, a+2,  b+1, b+2, a+2); 
        indices.push(a+2, b+2, a+3,  b+2, b+3, a+3); 
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(colors), 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        fog: false,
    }));
}

const hazeCol = new THREE.Color(0x9ec8db); 
function hazeBlend(baseHex, t) {
    return new THREE.Color().lerpColors(new THREE.Color(baseHex), hazeCol, t);
}

function makeHorizonRingHazed(innerR, outerR, yBase, peaks, colorOuter, colorInner, hazeAmt) {
    const segments = peaks.length;
    const positions = [], colors = [], indices = [];

    const cOutTop  = hazeBlend(colorOuter, hazeAmt);
    const cOutBase = hazeBlend(colorOuter, hazeAmt * 0.35);
    const cInTop   = hazeBlend(colorInner, hazeAmt * 0.80);
    const cInBase  = hazeBlend(colorInner, hazeAmt * 0.25);

    for (let i = 0; i <= segments; i++) {
        const idx = i % segments;
        const a = (i / segments) * TAU;
        const h = peaks[idx];
        const cos = Math.cos(a), sin = Math.sin(a);

        positions.push(cos * outerR, yBase,     sin * outerR);
        colors.push(cOutBase.r, cOutBase.g, cOutBase.b);
        positions.push(cos * outerR, yBase + h, sin * outerR);
        colors.push(cOutTop.r, cOutTop.g, cOutTop.b);
        positions.push(cos * innerR, yBase + h * 0.2, sin * innerR);
        colors.push(cInTop.r, cInTop.g, cInTop.b);
        positions.push(cos * innerR, yBase,     sin * innerR);
        colors.push(cInBase.r, cInBase.g, cInBase.b);
    }

    for (let i = 0; i < segments; i++) {
        const a = i * 4, b = (i + 1) * 4;
        indices.push(a, b, a+1,  b, b+1, a+1);
        indices.push(a+1, b+1, a+2,  b+1, b+2, a+2);
        indices.push(a+2, b+2, a+3,  b+2, b+3, a+3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(colors), 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        fog: false,
    }));
}

const nearCount = 90;
const nearPeaks = Array.from({ length: nearCount }, (_, i) => {
    const a = (i / nearCount) * TAU;
    return 5
        + Math.sin(a * 3 + 0.5) * 2.5
        + Math.sin(a * 7 + 1.2) * 1.2
        + Math.sin(a * 15 + 2.1) * 0.5;
});
const nearRing = makeHorizonRingHazed(62, 78, -3.15, nearPeaks, 0x3a6b2a, 0x2a4e1e, 0.06);
envGroup.add(nearRing);

const farCount = 120;
const farPeaks = Array.from({ length: farCount }, (_, i) => {
    const a = (i / farCount) * TAU;
    return 16
        + Math.sin(a * 5 + 0.8) * 8
        + Math.sin(a * 11 + 2.3) * 4
        + Math.sin(a * 19 + 1.0) * 1.5;
});
const farRing = makeHorizonRingHazed(105, 130, -3.15, farPeaks, 0x3a5c28, 0x2a4018, 0.18);
envGroup.add(farRing);

/* ── Mountain-base vegetation ring (r=18–30, scale < 1) ──── */
{
    const mbPlants = [];
    const mbCount = 48;
    const jitterSeq = [0.06,-0.09,0.13,-0.05,0.18,-0.11,0.04,-0.15,0.09,-0.07,
                       0.14,-0.03,0.11,-0.13,0.07,-0.08,0.16,-0.06,0.03,-0.12,
                       0.10,-0.04,0.17,-0.10,0.05,-0.14,0.08,-0.02,0.15,-0.09,
                       0.12,-0.06,0.19,-0.11,0.04,-0.16,0.07,-0.03,0.13,-0.08,
                       0.18,-0.05,0.09,-0.13,0.06,-0.10,0.14,-0.07];
    const rSeq = [20,22,19,24,21,26,18,23,25,20,22,27,19,21,24,28,
                  20,23,18,26,21,25,22,19,27,20,24,18,22,26,21,23,
                  25,19,20,28,22,24,18,21,26,23,20,25,19,22,27,21];
    const typeSeq = [3,0,1,3,2,4,3,1,0,3,2,3,1,4,3,0,
                     3,2,1,3,0,4,3,2,1,3,0,3,2,4,1,3,
                     0,3,2,1,3,4,0,3,2,3,1,0,3,2,4,3];
    const scaleSeq = [0.48,0.62,0.55,0.40,0.70,0.52,0.45,0.65,0.58,0.42,
                      0.68,0.50,0.44,0.72,0.56,0.38,0.60,0.46,0.74,0.53,
                      0.41,0.66,0.49,0.57,0.43,0.71,0.47,0.63,0.39,0.69,
                      0.54,0.45,0.64,0.50,0.42,0.73,0.48,0.61,0.37,0.67,
                      0.52,0.44,0.70,0.55,0.40,0.65,0.50,0.58];

    for (let i = 0; i < mbCount; i++) {
        const angle = (i / mbCount) * TAU + jitterSeq[i];
        const r = rSeq[i];
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        envGroup.add(makePlant(typeSeq[i], x, z, scaleSeq[i]));
    }

    const mb2Count = 32;
    for (let i = 0; i < mb2Count; i++) {
        const angle = ((i + 0.5) / mb2Count) * TAU + jitterSeq[i % jitterSeq.length] * 0.7;
        const r = 29 + (rSeq[i % rSeq.length] % 9);
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const s = 0.30 + (scaleSeq[i % scaleSeq.length] * 0.55); 
        envGroup.add(makePlant(typeSeq[(i + 3) % typeSeq.length], x, z, s));
    }
}

/* ── Grass tufts ────────────────────────────────────────── */
const grassMat = new THREE.MeshLambertMaterial({ color: 0x4d8c3a, side: THREE.DoubleSide });
const grassAngles = Array.from({ length: 90 }, (_, i) => i * (TAU / 90));
for (let i = 0; i < grassAngles.length; i++) {
    const a = grassAngles[i];
    const r = 1.8 + (i % 7) * 1.1;
    const tuft = new THREE.Mesh(new THREE.PlaneGeometry(0.10 + (i % 3) * 0.04, 0.22), grassMat);
    tuft.position.set(Math.cos(a) * r, -3.02, Math.sin(a) * r);
    tuft.rotation.y = a + Math.PI * 0.25 * (i % 4);
    envGroup.add(tuft);
}

/* ═══════════════════════════════════════════════════════════
   GLSL — Plastic material (polished ABS / painted steel)
════════════════════════════════════════════════════════════ */
const PLASTIC_VERT = `
    uniform float uScale;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldNormal;
    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position * uScale, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * mvPos;
    }
`;

const PLASTIC_FRAG = `
    uniform vec3 uAlbedo;
    uniform vec3 uSpecColor;
    uniform float uGloss;
    uniform float uFresnelStr;
    uniform float uHover;
    uniform float uTime;
    
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldNormal;
    
    const vec3 L_KEY = normalize(vec3(4.0, 7.0, 5.0));
    const vec3 L_FILL = normalize(vec3(-5.0, 2.0, 3.0));
    const vec3 L_RIM = normalize(vec3(-3.0, -4.0, -6.0));
    
    void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewDir);
        
        float ndotl_key = max(dot(n, L_KEY), 0.0);
        float ndotl_fill = max(dot(n, L_FILL), 0.0);
        float ndotl_rim = max(dot(n, L_RIM), 0.0);
        
        vec3 diff = uAlbedo * (ndotl_key * 1.2 + ndotl_fill * 0.6 + ndotl_rim * 0.3 + 0.2); 
        
        vec3 h_key = normalize(L_KEY + v);
        float spec_key = pow(max(dot(n, h_key), 0.0), uGloss);
        vec3 spec = uSpecColor * spec_key * 0.5;
        
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 4.0) * uFresnelStr;
        vec3 col = diff + spec + (fresnel * uSpecColor);
        
        col += uHover * vec3(0.2, 0.2, 0.2); // Hover glow effect
        
        gl_FragColor = vec4(col, 1.0);
        
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`;

const timedMats = [];
const hTargets = [];

// Base Turbine Material using Custom Shader
const turbineMat = new THREE.ShaderMaterial({
    vertexShader: PLASTIC_VERT,
    fragmentShader: PLASTIC_FRAG,
    uniforms: {
        uScale: { value: 1.0 },
        uAlbedo: { value: new THREE.Color(0xf4f4f4) },
        uSpecColor: { value: new THREE.Color(0xffffff) },
        uGloss: { value: 64.0 },
        uFresnelStr: { value: 0.2 },
        uHover: { value: 0.0 },
        uTime: { value: 0.0 }
    }
});
timedMats.push(turbineMat);

/* ═══════════════════════════════════════════════════════════
   WIND TURBINE ASSEMBLY (FULLY PATCHED AERODYNAMIC GEOMETRY)
════════════════════════════════════════════════════════════ */
const turbineGroup = new THREE.Group();
turbineGroup.position.y = -3.15;
turbineGroup.scale.set(0.5, 0.5, 0.5);
scene.add(turbineGroup);

// 1. TOWER
const towerHeight = 12;
const towerGeo = new THREE.CylinderGeometry(0.3, 0.6, towerHeight, 32);
const towerMesh = new THREE.Mesh(towerGeo, turbineMat);
towerMesh.position.y = towerHeight / 2;
turbineGroup.add(towerMesh);
hTargets.push(towerMesh);

// 2. AERODYNAMIC NACELLE (Housing)
const nacelleGroup = new THREE.Group();
nacelleGroup.position.y = towerHeight;
turbineGroup.add(nacelleGroup);

const nacelleGeo = new THREE.CapsuleGeometry(0.4, 1.5, 16, 32);
nacelleGeo.rotateX(Math.PI / 2); // Lay flat
nacelleGeo.translate(0, 0, -0.2); // Offset back from tower center
const nacelleMesh = new THREE.Mesh(nacelleGeo, turbineMat);
nacelleGroup.add(nacelleMesh);
hTargets.push(nacelleMesh);

// 3. AVIATION BEACON (Red blinking light on top)
const glowGeo = new THREE.SphereGeometry(0.08, 16, 16);
const glowMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0 });
const glowMesh = new THREE.Mesh(glowGeo, glowMat);
glowMesh.position.set(0, 0.45, -0.5); // Top/back
nacelleGroup.add(glowMesh);

// 4. ROTOR GROUP
const rotorGroup = new THREE.Group();
rotorGroup.position.set(0, 0, 0.9); // Attached to the front of the nacelle
nacelleGroup.add(rotorGroup);

// 5. AERODYNAMIC SPINNER (Bullet-shaped nose cone)
const spinnerGeo = new THREE.SphereGeometry(0.45, 32, 16);
spinnerGeo.scale(1, 1, 1.4); // Stretch into an ellipsoid bullet shape
const spinnerMesh = new THREE.Mesh(spinnerGeo, turbineMat);
rotorGroup.add(spinnerMesh);
hTargets.push(spinnerMesh);

// 6. AERODYNAMIC BLADES (Twisted airfoil profile)
const bladeLength = 6.5;
const bladeGeo = new THREE.CylinderGeometry(0.02, 0.25, bladeLength, 16);
bladeGeo.scale(1, 1, 0.15); // Flatten into a blade shape
bladeGeo.translate(0, bladeLength / 2 + 0.3, 0); // Move pivot to root

const positions = bladeGeo.attributes.position;
for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const twist = (y / bladeLength) * DEG(-15); // Twist 15 degrees root-to-tip
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setX(i, x * Math.cos(twist) - z * Math.sin(twist));
    positions.setZ(i, x * Math.sin(twist) + z * Math.cos(twist));
}
bladeGeo.computeVertexNormals();

const bladeMat = turbineMat.clone(); // Clone uniform settings
bladeMat.uniforms.uAlbedo.value = new THREE.Color(0xffffff); // Slightly brighter white

for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.rotation.z = i * (TAU / 3); // 120 degrees apart
    rotorGroup.add(blade);
    hTargets.push(blade);
}

/* ── Interaction ────────────────────────────────────────── */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
});

window.addEventListener('resize', () => {
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
});

/* ── Animation Loop ─────────────────────────────────────── */
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    const dt = clock.getDelta();
    const t = clock.getElapsedTime();

    // Update sky and materials
    skyMat.uniforms.uTime.value = t;
    for (const mat of timedMats) mat.uniforms.uTime.value = t;

    // Drift clouds
    for (const cg of cloudGroups) {
        const a = cg.userData.originAngle + t * cg.userData.driftSpeed;
        const r = cg.userData.radius;
        cg.position.x = Math.cos(a) * r;
        cg.position.z = Math.sin(a) * r;
    }

    // ── Blade + spinner rotation — only on Z axis ───────────────
    rotorGroup.rotation.z -= dt * 0.75; 

    // ── Beacon glow pulse synced with blink ──────────────────────
    const cycle = t % 2.0;
    const blinkOn = cycle < 0.25;
    glowMesh.material.opacity = blinkOn ? (0.18 + 0.10 * Math.sin(cycle * TAU / 0.25)) : 0;

    // ── Hover detection ─────────────────────────────────────────
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(hTargets, false);

    // Reset emission
    hTargets.forEach(obj => {
        if(obj.material && obj.material.uniforms) {
            obj.material.uniforms.uHover.value = 0.0;
        }
    });

    // Highlight hovered object
    if (hits.length > 0) {
        const hitObj = hits[0].object;
        if(hitObj.material && hitObj.material.uniforms) {
            hitObj.material.uniforms.uHover.value = 1.0;
        }
    }

    controls.update();
    renderer.render(scene, camera);
}

animate();