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
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 200);
camera.position.set(0, 0.3, 11);

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
controls.enableDamping    = true;
controls.dampingFactor    = 0.05;
controls.enableZoom       = false;
controls.enablePan        = false;
controls.autoRotate       = true;
controls.autoRotateSpeed  = 0.5;
controls.minPolarAngle    = DEG(15);
controls.maxPolarAngle    = DEG(165);

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
            // Drifting cloud wisps
            float cx = vPos.x / 120.0, cz = vPos.z / 120.0;
            float w1 = sin(cx * 3.8 + uTime * 0.04) * sin(cz * 2.7 + uTime * 0.03);
            float w2 = sin(cx * 6.1 - uTime * 0.025) * sin(cz * 5.2 + uTime * 0.035);
            float cloud = smoothstep(0.48, 0.88, w1 * 0.5 + 0.5) * 0.28
                        + smoothstep(0.55, 0.90, w2 * 0.5 + 0.5) * 0.18;
            col = mix(col, vec3(1.0), cloud * t);
            gl_FragColor = vec4(col, 1.0);
        }
    `,
});
envGroup.add(new THREE.Mesh(skyGeo, skyMat));

/* ── Ground ─────────────────────────────────────────────── */
const groundMat = new THREE.MeshLambertMaterial({ color: 0x3b6830 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -3.15;
ground.receiveShadow = true;
envGroup.add(ground);

/* ── Tree builder ───────────────────────────────────────── */
function makeTree(x, z, scale) {
    const g = new THREE.Group();
    g.position.set(x, -3.15, z);

    // Trunk
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07 * scale, 0.12 * scale, 1.0 * scale, 7),
        new THREE.MeshLambertMaterial({ color: 0x5c3a1e })
    );
    trunk.position.y = 0.5 * scale;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    g.add(trunk);

    // Three layered cones — classic pine silhouette
    const coneData = [
        { r: 0.70, h: 0.70, y: 0.90, color: 0x1e5c20 },
        { r: 0.55, h: 0.75, y: 1.28, color: 0x256e28 },
        { r: 0.40, h: 0.80, y: 1.65, color: 0x2e8232 },
    ];
    for (const d of coneData) {
        const cone = new THREE.Mesh(
            new THREE.ConeGeometry(d.r * scale, d.h * scale, 8),
            new THREE.MeshLambertMaterial({ color: d.color })
        );
        cone.position.y = d.y * scale;
        cone.castShadow = true;
        g.add(cone);
    }
    return g;
}

/* ── Forest ring ────────────────────────────────────────── */
// Deterministic-ish spread using a seeded-like pattern
const treeData = [
    // Back arc (behind turbine, dense)
    [-6.5, -7.2, 1.15], [-4.0, -8.8, 0.95], [-1.2, -9.5, 1.10],
    [ 2.0, -9.0, 1.05], [ 4.8, -8.2, 0.90], [ 7.0, -6.8, 1.20],
    [-8.5, -5.5, 0.85], [ 9.2, -5.0, 0.92], [-10.5,-3.0, 1.05],
    [ 10.8,-2.5, 0.88], [-11.0,-0.5, 1.00], [ 11.2, 0.8, 0.95],
    [-3.5,-11.0, 0.80], [ 0.5,-12.0, 1.00], [ 3.5,-11.5, 0.85],
    // Left arc
    [-9.0, 1.5,  1.10], [-9.8, 4.0,  0.90], [-8.5, 6.5,  1.05],
    [-7.0, 8.5,  0.85], [-5.0, 10.0, 0.95], [-11.5, 6.0, 0.80],
    // Right arc
    [ 9.2, 1.8,  1.00], [ 10.0, 4.5, 0.88], [ 8.8, 7.0,  1.12],
    [ 6.5, 9.0,  0.92], [ 4.0, 10.5, 0.85], [ 11.5, 6.5, 0.80],
    // Front sides (sparse, shorter so turbine reads clearly)
    [-5.5, 3.5,  0.70], [ 5.8, 3.2,  0.72], [-4.5, 5.5,  0.68],
    [ 4.2, 5.8,  0.65], [-7.0, 2.0,  0.75], [ 7.2, 2.2,  0.73],
    // Deep background fill
    [-3.0,-13.5, 0.78], [ 5.5,-13.0, 0.82], [-8.0,-10.0, 0.90],
    [ 8.5,-10.5, 0.88], [ 0.0,-14.0, 0.75], [-13.0,-1.0, 0.85],
    [ 13.0, 1.0, 0.82],
];

for (const [x, z, s] of treeData) {
    envGroup.add(makeTree(x, z, s));
}

/* ── Undergrowth bushes ─────────────────────────────────── */
const bushMat = new THREE.MeshLambertMaterial({ color: 0x2d6628 });
const bushPositions = [
    [-2.8,-4.2], [2.5,-4.8], [-4.0,-3.0], [3.8,-3.2],
    [-1.5,-5.5], [1.2,-6.0], [-5.2,-1.5], [5.0,-1.8],
    [-3.5, 1.8], [3.2, 2.0], [-2.0, 3.5], [1.8, 3.8],
    [-6.0, 0.5], [6.2, 0.8], [-4.8, 4.5], [4.5, 4.2],
    [ 0.5,-7.0], [-6.5,-4.5],[6.8,-4.0], [-0.8, 5.2],
];
for (const [bx, bz] of bushPositions) {
    const r = 0.20 + (Math.abs(bx * bz) % 0.22);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), bushMat);
    bush.position.set(bx, -3.15 + r * 0.5, bz);
    bush.castShadow = true;
    envGroup.add(bush);
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
        vViewDir   = normalize(-mvPos.xyz);
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * mvPos;
    }
`;

const PLASTIC_FRAG = `
    uniform vec3  uAlbedo;
    uniform vec3  uSpecColor;
    uniform float uGloss;
    uniform float uFresnelStr;
    uniform float uHover;
    uniform float uTime;

    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldNormal;

    const vec3 L_KEY  = normalize(vec3(4.0, 7.0, 5.0));
    const vec3 L_FILL = normalize(vec3(-5.0, 2.0, 3.0));
    const vec3 L_RIM  = normalize(vec3(-3.0, -4.0, -6.0));

    const vec3 C_KEY  = vec3(1.00, 0.98, 0.95) * 2.4;
    const vec3 C_FILL = vec3(0.85, 0.92, 1.00) * 0.6;
    const vec3 C_RIM  = vec3(0.69, 0.85, 0.94) * 0.9;
    const vec3 C_AMB  = vec3(1.0) * 0.30;
    const vec3 C_HEMI_SKY = vec3(0.96, 0.94, 0.88) * 0.45;
    const vec3 C_HEMI_GND = vec3(0.78, 0.87, 0.78) * 0.45;

    void main() {
        vec3  N   = normalize(vNormal);
        vec3  V   = normalize(vViewDir);
        float NdV = max(dot(N, V), 0.0);

        float dKey  = max(dot(N, L_KEY),  0.0);
        float dFill = max(dot(N, L_FILL), 0.0);
        float dRim  = max(dot(N, L_RIM),  0.0);

        float hemi = vWorldNormal.y * 0.5 + 0.5;
        vec3  hemiColor = mix(C_HEMI_GND, C_HEMI_SKY, hemi);

        vec3 diffuse = uAlbedo * (
            C_AMB + hemiColor +
            C_KEY  * dKey  +
            C_FILL * dFill +
            C_RIM  * dRim
        );

        vec3  H_key  = normalize(L_KEY + V);
        float spec   = pow(max(dot(N, H_key), 0.0), uGloss);
        vec3  H_fill = normalize(L_FILL + V);
        float spec2  = pow(max(dot(N, H_fill), 0.0), uGloss * 0.4) * 0.15;
        vec3 specular = uSpecColor * (spec + spec2);

        float fresnel = pow(1.0 - NdV, 4.5) * uFresnelStr;
        vec3  rimCol  = vec3(0.72, 0.88, 1.0) * fresnel;

        vec3 hoverLift = uAlbedo * uHover * 0.12;

        vec3 col = diffuse + specular + rimCol + hoverLift;
        gl_FragColor = vec4(col, 1.0);
    }
`;

/* ── Beacon / emissive material for aviation light ──────── */
const BEACON_FRAG = `
    uniform vec3  uAlbedo;
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldNormal;

    void main() {
        float cycle  = mod(uTime, 2.0);
        float blink  = step(cycle, 0.25);

        vec3 N   = normalize(vNormal);
        vec3 V   = normalize(vViewDir);
        float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);

        vec3 emissive = uAlbedo * (blink * (1.5 + rim * 2.0));
        gl_FragColor = vec4(emissive, 1.0);
    }
`;

/* ═══════════════════════════════════════════════════════════
   MATERIAL FACTORY
════════════════════════════════════════════════════════════ */
function makePlasticMat({ albedo, specColor, gloss, fresnelStr }) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uAlbedo:     { value: new THREE.Color(albedo) },
            uSpecColor:  { value: new THREE.Color(specColor) },
            uGloss:      { value: gloss },
            uFresnelStr: { value: fresnelStr },
            uHover:      { value: 0 },
            uTime:       { value: 0 },
            uScale:      { value: 1 },
        },
        vertexShader:   PLASTIC_VERT,
        fragmentShader: PLASTIC_FRAG,
    });
}

function makeBeaconMat(color) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uAlbedo: { value: new THREE.Color(color) },
            uTime:   { value: 0 },
        },
        vertexShader:   PLASTIC_VERT.replace('uniform float uScale;', 'uniform float uScale;').replace('* uScale', ''),
        fragmentShader: BEACON_FRAG,
    });
}

/* ═══════════════════════════════════════════════════════════
   WIND TURBINE CONSTRUCTION
   Tower  → Nacelle → RotorGroup (Hub + 3 Blades)
════════════════════════════════════════════════════════════ */
const turbine = new THREE.Group();

/* ── Foundation / Base ──────────────────────────────────── */
const baseMat = makePlasticMat({
    albedo:     0x9aa4ae,
    specColor:  0xd0dce8,
    gloss:      55,
    fresnelStr: 0.15,
});
const baseMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.62, 0.22, 20),
    baseMat
);
baseMesh.position.set(0, -2.90, 0);
baseMesh.castShadow = true;
baseMesh.receiveShadow = true;
turbine.add(baseMesh);

/* ── Foundation anchor bolt ring ────────────────────────── */
const boltMat = makePlasticMat({ albedo: 0x555e66, specColor: 0x99aabb, gloss: 140, fresnelStr: 0.10 });
for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * TAU;
    const boltMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.10, 8),
        boltMat
    );
    boltMesh.position.set(
        Math.cos(angle) * 0.49,
        -2.84,
        Math.sin(angle) * 0.49
    );
    turbine.add(boltMesh);
    const nutMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.026, 0.026, 0.022, 6),
        boltMat
    );
    nutMesh.position.set(
        Math.cos(angle) * 0.49,
        -2.78,
        Math.sin(angle) * 0.49
    );
    turbine.add(nutMesh);
}

/* ── Tower — tapered cylinder, off-white industrial paint ─ */
const towerMat = makePlasticMat({
    albedo:     0xdde3ea,
    specColor:  0xffffff,
    gloss:      95,
    fresnelStr: 0.20,
});
const towerMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.27, 4.5, 20),
    towerMat
);
towerMesh.position.set(0, -0.55, 0);
towerMesh.castShadow = true;
towerMesh.receiveShadow = true;
turbine.add(towerMesh);

/* ── Tower maintenance door ─────────────────────────────── */
const doorMat = makePlasticMat({ albedo: 0x7a8a96, specColor: 0xaabbcc, gloss: 70, fresnelStr: 0.18 });
const doorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.20, 0.015),
    doorMat
);
doorMesh.position.set(0, -2.50, 0.268);
turbine.add(doorMesh);

const frameMat = makePlasticMat({ albedo: 0x555f6a, specColor: 0x9ab0c0, gloss: 60, fresnelStr: 0.12 });
const frameMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.115, 0.215, 0.012),
    frameMat
);
frameMesh.position.set(0, -2.50, 0.266);
turbine.add(frameMesh);

const handleMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.035, 6),
    boltMat
);
handleMesh.rotation.z = DEG(90);
handleMesh.position.set(0.031, -2.50, 0.278);
turbine.add(handleMesh);

/* ── Vertical cable conduit along tower ─────────────────── */
const conduitMat = makePlasticMat({ albedo: 0xb0bcc8, specColor: 0xddeeff, gloss: 60, fresnelStr: 0.12 });
const conduitMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 4.0, 8),
    conduitMat
);
conduitMesh.position.set(0, -0.70, -0.23);
turbine.add(conduitMesh);
for (let i = 0; i < 3; i++) {
    const clamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.025, 0.04),
        frameMat
    );
    clamp.position.set(0, -0.70 + (i - 1) * 1.3, -0.22);
    turbine.add(clamp);
}

/* ── Nacelle — rectangular housing, slate grey ──────────── */
const nacelleMat = makePlasticMat({
    albedo:     0x697480,
    specColor:  0xadc4d8,
    gloss:      80,
    fresnelStr: 0.28,
});
const nacelleMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.50, 0.62),
    nacelleMat
);
nacelleMesh.position.set(0, 1.96, 0.05);
nacelleMesh.castShadow = true;
turbine.add(nacelleMesh);

/* ── Nacelle top cover ──────────────────────────────────── */
const roofMat = makePlasticMat({ albedo: 0x5f6d7a, specColor: 0x90aabb, gloss: 75, fresnelStr: 0.25 });
const roofMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.40, 1.18, 12, 1, false, 0, Math.PI),
    roofMat
);
roofMesh.rotation.z = DEG(90);
roofMesh.position.set(0, 2.18, 0.05);
turbine.add(roofMesh);

/* ── Nacelle ventilation grilles (side louvers) ─────────── */
const louverMat = makePlasticMat({ albedo: 0x4a5560, specColor: 0x7a9aaa, gloss: 50, fresnelStr: 0.10 });
for (let i = 0; i < 4; i++) {
    const louverL = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.035, 0.15), louverMat);
    louverL.position.set(-0.592, 1.88 + i * 0.052, 0.05);
    turbine.add(louverL);

    const louverR = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.035, 0.15), louverMat);
    louverR.position.set(0.592, 1.88 + i * 0.052, 0.05);
    turbine.add(louverR);
}

/* ── Anemometer + wind vane mast on nacelle top ─────────── */
const mastMat = makePlasticMat({ albedo: 0x8090a0, specColor: 0xccddee, gloss: 120, fresnelStr: 0.22 });
const mastMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8),
    mastMat
);
mastMesh.position.set(0.35, 2.38, 0.05);
turbine.add(mastMesh);

const cupMat = makePlasticMat({ albedo: 0xcc3333, specColor: 0xff6666, gloss: 100, fresnelStr: 0.20 });
for (let i = 0; i < 3; i++) {
    const armAngle = (i / 3) * TAU;
    const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.09, 6),
        mastMat
    );
    arm.rotation.z = DEG(90);
    arm.rotation.y = armAngle;
    arm.position.set(
        0.35 + Math.cos(armAngle) * 0.045,
        2.49,
        0.05 + Math.sin(armAngle) * 0.045
    );
    turbine.add(arm);
    const cup = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 8, 8),
        cupMat
    );
    cup.position.set(
        0.35 + Math.cos(armAngle) * 0.09,
        2.49,
        0.05 + Math.sin(armAngle) * 0.09
    );
    turbine.add(cup);
}

const vaneMat = makePlasticMat({ albedo: 0xcc3333, specColor: 0xff8888, gloss: 90, fresnelStr: 0.18 });
const vaneMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.005, 0.06, 0.12),
    vaneMat
);
vaneMesh.position.set(0.35, 2.46, -0.01);
turbine.add(vaneMesh);

/* ── Aviation obstacle / warning beacon ─────────────────── */
const beaconBaseMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.030, 0.034, 0.038, 10),
    makePlasticMat({ albedo: 0x444e58, specColor: 0x8899aa, gloss: 80, fresnelStr: 0.15 })
);
beaconBaseMesh.position.set(-0.38, 2.28, 0.05);
turbine.add(beaconBaseMesh);

const beaconMat  = makeBeaconMat(0xff2200);
const beaconMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.030, 12, 12),
    beaconMat
);
beaconMesh.position.set(-0.38, 2.31, 0.05);
turbine.add(beaconMesh);

const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff2200,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
});
const glowMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 10, 10),
    glowMat
);
glowMesh.position.copy(beaconMesh.position);
turbine.add(glowMesh);

/* ── Rotor Group — spins only around Z axis ─────────────── */
/* Spinner cone lives INSIDE rotorGroup so it co-rotates     */
/* automatically — no per-frame rotation assignment needed.   */
const rotorGroup = new THREE.Group();
rotorGroup.position.set(0, 1.96, 0.60);

/* ── Spinner cone — child of rotorGroup ─────────────────── */
const spinnerMat = makePlasticMat({
    albedo:     0x4e5a68,
    specColor:  0x90aabf,
    gloss:      120,
    fresnelStr: 0.32,
});
const spinnerMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.19, 0.38, 18),
    spinnerMat
);
// Cone tip points along +Z (towards wind), achieved by rotating X -90°
// Position is relative to rotorGroup origin (0,0,0 = hub centre)
spinnerMesh.rotation.x = DEG(90);
spinnerMesh.position.set(0, 0, 0.20);
rotorGroup.add(spinnerMesh);

/* Hub — sphere ──────────────────────────────────────────── */
const hubMat = makePlasticMat({
    albedo:     0x4e5a68,
    specColor:  0x90aabf,
    gloss:      115,
    fresnelStr: 0.32,
});
const hubMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 18, 18),
    hubMat
);
rotorGroup.add(hubMesh);

/* Blade geometry — tapered airfoil via ExtrudeGeometry ──── */
const BL = 2.15;

function makeBladeShape() {
    const s = new THREE.Shape();
    s.moveTo(-0.14, 0.17);
    s.bezierCurveTo(-0.13, BL * 0.30, -0.04, BL * 0.72, -0.015, BL);
    s.lineTo(0.035, BL);
    s.bezierCurveTo(0.19, BL * 0.58, 0.21, BL * 0.22, 0.21, 0.17);
    s.closePath();
    return s;
}

const bladeGeo = new THREE.ExtrudeGeometry(makeBladeShape(), {
    steps:            1,
    depth:            0.040,
    bevelEnabled:     true,
    bevelThickness:   0.009,
    bevelSize:        0.008,
    bevelSegments:    2,
});

const bladeMat = makePlasticMat({
    albedo:     0xd6dde6,
    specColor:  0xffffff,
    gloss:      130,
    fresnelStr: 0.22,
});

function makeLightningStrip() {
    const stripShape = new THREE.Shape();
    stripShape.moveTo(0.16, 0.17);
    stripShape.bezierCurveTo(0.19, BL * 0.22, 0.19, BL * 0.58, 0.033, BL);
    stripShape.lineTo(0.035, BL);
    stripShape.bezierCurveTo(0.19, BL * 0.58, 0.21, BL * 0.22, 0.21, 0.17);
    stripShape.closePath();
    return new THREE.ExtrudeGeometry(stripShape, {
        steps:        1,
        depth:        0.042,
        bevelEnabled: false,
    });
}

const stripMat = makePlasticMat({
    albedo:     0x2a3038,
    specColor:  0x445566,
    gloss:      60,
    fresnelStr: 0.08,
});

for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.z = (i / 3) * TAU;

    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.rotation.y = DEG(-14);
    blade.position.set(-0.035, 0.18, -0.020);
    blade.castShadow = true;
    pivot.add(blade);

    const strip = new THREE.Mesh(makeLightningStrip(), stripMat);
    strip.rotation.y = DEG(-14);
    strip.position.set(-0.035, 0.18, -0.020);
    pivot.add(strip);

    const rootFairing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.075, 0.12, 12),
        hubMat
    );
    rootFairing.rotation.z = DEG(90);
    rootFairing.position.set(0, 0.17, 0);
    pivot.add(rootFairing);

    rotorGroup.add(pivot);
}

turbine.add(rotorGroup);

/* ── Ambient background particles ───────────────────────── */
const pCount  = isMobile ? 60 : 120;
const pGeo    = new THREE.BufferGeometry();
const pPosArr = new Float32Array(pCount * 3);
for (let i = 0; i < pCount; i++) {
    const r   = 4.5 + Math.random() * 1.8;
    const phi = Math.acos(2 * Math.random() - 1);
    const tht = Math.random() * TAU;
    pPosArr[i*3]   = r * Math.sin(phi) * Math.cos(tht);
    pPosArr[i*3+1] = r * Math.sin(phi) * Math.sin(tht);
    pPosArr[i*3+2] = r * Math.cos(phi);
}
pGeo.setAttribute('position', new THREE.BufferAttribute(pPosArr, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    color: 0x88aacc, size: 0.028, transparent: true, opacity: 0.28,
    depthWrite: false, sizeAttenuation: true,
}));
turbine.add(particles);

scene.add(turbine);

/* ═══════════════════════════════════════════════════════════
   RAYCASTING — hover on static parts
════════════════════════════════════════════════════════════ */
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2(-9, -9);
const hTargets  = [towerMesh, nacelleMesh, hubMesh];
const hoverVals = [0, 0, 0];

function updateMouse(x, y) {
    const r = canvas.getBoundingClientRect();
    mouse.x =  ((x - r.left) / r.width)  * 2 - 1;
    mouse.y = -((y - r.top)  / r.height) * 2 + 1;
}
canvas.addEventListener('mousemove',  e => { updateMouse(e.clientX, e.clientY); resetIdle(); });
canvas.addEventListener('mouseleave', () => mouse.set(-9, -9));
canvas.addEventListener('touchmove', e => {
    if (e.touches.length) updateMouse(e.touches[0].clientX, e.touches[0].clientY);
    resetIdle();
}, { passive: true });

/* ═══════════════════════════════════════════════════════════
   RESIZE
════════════════════════════════════════════════════════════ */
function resize() {
    const w = wrap.clientWidth  || 460;
    const h = wrap.clientHeight || w;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}
new ResizeObserver(resize).observe(wrap);
resize();

/* ═══════════════════════════════════════════════════════════
   ANIMATION LOOP
════════════════════════════════════════════════════════════ */
const clock   = new THREE.Clock();
let   prevT   = 0;

// Collect timed materials
const timedMats = [];
turbine.traverse(node => {
    if (node.isMesh && node.material?.uniforms?.uTime !== undefined) {
        timedMats.push(node.material);
    }
});

// Anemometer cup group for spinning
const anemometerParts = [];
turbine.traverse(node => {
    if (node.isMesh && node.material === cupMat) anemometerParts.push(node);
});

function tick() {
    requestAnimationFrame(tick);
    const t  = clock.getElapsedTime();
    const dt = t - prevT;
    prevT = t;

    // Update sky time
    skyMat.uniforms.uTime.value = t;

    for (const mat of timedMats) mat.uniforms.uTime.value = t;

    // ── Blade + spinner rotation — only on Z axis ───────────────
    // spinnerMesh is a child of rotorGroup, so it co-rotates automatically
    rotorGroup.rotation.z += dt * 0.75;

    // ── Anemometer spins fast (wind instrument) ──────────────────
    turbine.traverse(node => {
        if (node.isMesh && node.material === cupMat) {
            const angle = t * 4.5 + anemometerParts.indexOf(node) * (TAU / 3);
            node.position.set(
                0.35 + Math.cos(angle) * 0.09,
                2.49,
                0.05 + Math.sin(angle) * 0.09
            );
        }
    });

    // ── Beacon glow pulse synced with blink ──────────────────────
    const cycle = t % 2.0;
    const blinkOn = cycle < 0.25;
    glowMesh.material.opacity = blinkOn ? (0.18 + 0.10 * Math.sin(cycle * TAU / 0.25)) : 0;

    // ── Hover detection ─────────────────────────────────────────
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(hTargets, false);

    hTargets.forEach((part, i) => {
        const hit = hits.length > 0 && hits[0].object === part;
        hoverVals[i] += ((hit ? 1 : 0) - hoverVals[i]) * 0.10;
        part.material.uniforms.uHover.value = hoverVals[i];
        part.material.uniforms.uScale.value = 1.0 + hoverVals[i] * 0.04;
    });

    // ── No turbine self-rotation or sway — camera pivots via OrbitControls

    controls.update();
    renderer.render(scene, camera);
}

tick();