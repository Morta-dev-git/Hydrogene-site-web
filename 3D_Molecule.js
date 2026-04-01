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

/* ── Camera ─────────────────────────────────────────────── */
const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
camera.position.set(0, 0.4, 9.5);

/* ── Renderer — NO post-processing, direct render ─────── */
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
renderer.toneMappingExposure = 0.95;          // slightly under-exposed = richer colors
renderer.outputColorSpace    = THREE.SRGBColorSpace;
renderer.shadowMap.enabled   = false;         // transparency background — no shadow

/* ── Controls ───────────────────────────────────────────── */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping    = true;
controls.dampingFactor    = 0.05;
controls.enableZoom       = false;
controls.enablePan        = false;
controls.autoRotate       = true;
controls.autoRotateSpeed  = 0.7;
controls.minPolarAngle    = DEG(22);
controls.maxPolarAngle    = DEG(158);

let idleTimer;
const resetIdle = () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { controls.autoRotate = true; }, 2800);
};
controls.addEventListener('start', resetIdle);

/* ═══════════════════════════════════════════════════════════
   LIGHTING — designed for plastic / matte-glossy surface
   Three-point setup: key warm | fill cool | rim edge
════════════════════════════════════════════════════════════ */

// Very soft ambient so dark sides aren't pitch black
scene.add(new THREE.AmbientLight(0xffffff, 0.30));

// Hemisphere — sky top is warm cream, ground is muted green
// Gives the atom a natural color cast that reads as environment
scene.add(new THREE.HemisphereLight(0xf5efe0, 0xc8ddc8, 0.45));

// Key light — upper right front, warm white, moderate
const keyLight = new THREE.DirectionalLight(0xfffaf2, 2.4);
keyLight.position.set(4, 7, 5);
scene.add(keyLight);

// Fill light — left, slightly cool, very soft
const fillLight = new THREE.DirectionalLight(0xd8eaf5, 0.6);
fillLight.position.set(-5, 2, 3);
scene.add(fillLight);

// Rim / back light — cool edge separation, low intensity
// Just enough to lift the silhouette edge
const rimLight = new THREE.DirectionalLight(0xb0d8f0, 0.9);
rimLight.position.set(-3, -4, -6);
scene.add(rimLight);

/* ═══════════════════════════════════════════════════════════
   GLSL — Plastic material
   Goal: looks like polished ABS plastic or resin model
   • Lambert diffuse base (smooth gradient)
   • Blinn-Phong specular — tight highlight, NOT blown out
   • Thin Fresnel rim — subtle, adds depth not glow
   • No emissive / additive tricks that cause the bloom look
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
    uniform vec3  uAlbedo;      // base material color
    uniform vec3  uSpecColor;   // specular highlight tint (near-white for plastic)
    uniform float uGloss;       // shininess — higher = tighter highlight
    uniform float uFresnelStr;  // how strong the rim lift is (keep low)
    uniform float uHover;
    uniform float uTime;

    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldNormal;

    // Light directions (must match scene setup)
    const vec3 L_KEY  = normalize(vec3(4.0, 7.0, 5.0));
    const vec3 L_FILL = normalize(vec3(-5.0, 2.0, 3.0));
    const vec3 L_RIM  = normalize(vec3(-3.0, -4.0, -6.0));

    // Light colors & intensities (in linear)
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

        // ── Diffuse — Lambert per light ──────────────────
        float dKey  = max(dot(N, L_KEY),  0.0);
        float dFill = max(dot(N, L_FILL), 0.0);
        float dRim  = max(dot(N, L_RIM),  0.0);

        // Hemisphere gradient (world normal Y component)
        float hemi = vWorldNormal.y * 0.5 + 0.5; // 0=ground, 1=sky
        vec3  hemiColor = mix(C_HEMI_GND, C_HEMI_SKY, hemi);

        vec3 diffuse  = uAlbedo * (
            C_AMB +
            hemiColor +
            C_KEY  * dKey  +
            C_FILL * dFill +
            C_RIM  * dRim
        );

        // ── Specular — Blinn-Phong, key light only ───────
        // Only key light drives the main highlight for cleanliness
        vec3  H_key  = normalize(L_KEY + V);
        float spec   = pow(max(dot(N, H_key), 0.0), uGloss);

        // Secondary soft fill spec (much weaker)
        vec3  H_fill = normalize(L_FILL + V);
        float spec2  = pow(max(dot(N, H_fill), 0.0), uGloss * 0.4) * 0.15;

        vec3 specular = uSpecColor * (spec + spec2);

        // ── Fresnel rim — SUBTLE, just lifts the edge ────
        // Schlick, but clamped so it never blows out
        float fresnel = pow(1.0 - NdV, 4.5) * uFresnelStr;
        // Rim color tinted toward fill light color (cool edge)
        vec3  rimCol  = vec3(0.72, 0.88, 1.0) * fresnel;

        // ── Hover highlight — gentle brightness lift ─────
        vec3 hoverLift = uAlbedo * uHover * 0.12;

        // ── Final composite ─────────────────────────────
        vec3 col = diffuse + specular + rimCol + hoverLift;

        gl_FragColor = vec4(col, 1.0);
    }
`;

/* Bond shader — same plastic feel, slightly translucent */
const BOND_VERT = `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
    }
`;

const BOND_FRAG = `
    uniform vec3  uColor;
    varying vec3  vNormal;
    varying vec3  vViewDir;

    const vec3 L_KEY  = normalize(vec3(4.0, 7.0, 5.0));
    const vec3 L_FILL = normalize(vec3(-5.0, 2.0, 3.0));
    const vec3 C_AMB  = vec3(1.0) * 0.35;

    void main() {
        vec3  N  = normalize(vNormal);
        vec3  V  = normalize(vViewDir);
        float d1 = max(dot(N, L_KEY),  0.0);
        float d2 = max(dot(N, L_FILL), 0.0) * 0.4;

        vec3  H    = normalize(L_KEY + V);
        float spec = pow(max(dot(N, H), 0.0), 60.0) * 0.4;

        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.5) * 0.25;

        vec3 col = uColor * (C_AMB + vec3(d1 + d2));
        col += vec3(0.9, 0.95, 1.0) * spec;
        col += uColor * fres;

        gl_FragColor = vec4(col, 0.88);
    }
`;

/* Electron — Soft emissive energy point, no harsh plastic specular */
const ELECTRON_VERT = `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
        vNormal  = normalize(normalMatrix * normal);
        vec4 mv  = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
    }
`;

const ELECTRON_FRAG = `
    uniform vec3  uColor;
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
        vec3  N  = normalize(vNormal);
        vec3  V  = normalize(vViewDir);
        
        // Soft fresnel rim to make it look like a glowing particle
        float rim = pow(1.0 - max(dot(N, V), 0.0), 1.8);
        
        // Gentle pulse
        float pulse = sin(uTime * 4.0) * 0.15 + 0.85;
        
        // Emissive core + glowing edge
        vec3 col = (uColor * 0.9 * pulse) + (uColor * rim * 1.2);

        gl_FragColor = vec4(col, 1.0);
    }
`;

/* Orbital ring — simple translucent tube */
const RING_VERT = `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
        vNormal  = normalize(normalMatrix * normal);
        vec4 mv  = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
    }
`;

const RING_FRAG = `
    uniform vec3  uColor;
    uniform float uOpacity;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
        float edge  = abs(dot(normalize(vNormal), normalize(vViewDir)));
        float alpha = (1.0 - edge) * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
    }
`;

/* ═══════════════════════════════════════════════════════════
   MATERIAL FACTORIES
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

function makeBondMat(color) {
    return new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) } },
        vertexShader:   BOND_VERT,
        fragmentShader: BOND_FRAG,
        transparent: true,
    });
}

function makeElectronMat(color) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(color) },
            uTime:  { value: 0 },
        },
        vertexShader:   ELECTRON_VERT,
        fragmentShader: ELECTRON_FRAG,
        // solid, depth-tested — electrons read as real small spheres
    });
}

function makeRingMat(color, opacity) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor:   { value: new THREE.Color(color) },
            uOpacity: { value: opacity },
        },
        vertexShader:   RING_VERT,
        fragmentShader: RING_FRAG,
        transparent: true,
        depthWrite:  false,
        side:        THREE.DoubleSide,
    });
}

/* ═══════════════════════════════════════════════════════════
   GEOMETRY HELPERS
════════════════════════════════════════════════════════════ */
const SEG = isMobile ? 48 : 96;

function makeAtom({ radius, mat, pos }) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, SEG, SEG), mat);
    mesh.position.copy(pos);
    return mesh;
}

function makeBond(a, b, color, r = 0.058) {
    const dir  = new THREE.Vector3().subVectors(b, a);
    const len  = dir.length();
    const mid  = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const geo  = new THREE.CylinderGeometry(r, r, len, isMobile ? 20 : 36, 1);
    const mesh = new THREE.Mesh(geo, makeBondMat(color));
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return mesh;
}



function makeElectron(color) {
    return new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 12, 12),
        makeElectronMat(color)
    );
}

/* ═══════════════════════════════════════════════════════════
   H₂O MOLECULE
   HOH angle: 104.45° | O–H bond scaled to 2.18 scene units
   CPK colors: Oxygen #CC2200 (red), Hydrogen #DDDDDD (light grey)
════════════════════════════════════════════════════════════ */
const mol      = new THREE.Group();
const BOND_LEN = 2.18;
const HALF_A   = DEG(104.45 / 2);

const oPos  = new THREE.Vector3(0, 0.72, 0);
const h1Pos = new THREE.Vector3( Math.sin(HALF_A) * BOND_LEN, oPos.y - Math.cos(HALF_A) * BOND_LEN, 0);
const h2Pos = new THREE.Vector3(-Math.sin(HALF_A) * BOND_LEN, oPos.y - Math.cos(HALF_A) * BOND_LEN, 0);

/* ── Oxygen — deep CPK red plastic ─────────────────────── */
// Plastic: moderate gloss (120), tight specular, subtle rim
const oMat = makePlasticMat({
    albedo:     0xbc2215,   // CPK red, slightly desaturated so it reads as solid not candy
    specColor:  0xfff5f0,   // very warm near-white highlight
    gloss:      120,
    fresnelStr: 0.28,
});
const oAtom = makeAtom({ radius: 0.72, mat: oMat, pos: oPos });
mol.add(oAtom);

/* ── Hydrogens — pearlescent light grey plastic ──────────  */
// Slightly higher gloss for smaller atoms — looks accurate to CPK models
const hConf = {
    albedo:     0xcccccc,   // CPK near-white / light grey
    specColor:  0xffffff,
    gloss:      160,        // tighter, shinier spec on small atom
    fresnelStr: 0.22,
};
const h1Mat  = makePlasticMat(hConf);
const h2Mat  = makePlasticMat(hConf);
const h1Atom = makeAtom({ radius: 0.46, mat: h1Mat, pos: h1Pos });
const h2Atom = makeAtom({ radius: 0.46, mat: h2Mat, pos: h2Pos });
mol.add(h1Atom, h2Atom);

/* ── O–H bonds — light grey-blue semi-transparent tube ── */
// Bond color: neutral, slightly desaturated — doesn't steal focus
const bondCol = 0x8eaabb;
const bond1 = makeBond(oPos, h1Pos, bondCol);
const bond2 = makeBond(oPos, h2Pos, bondCol);
mol.add(bond1, bond2);

/* ═══════════════════════════════════════════════════════════
   ELECTRON ORBITALS
════════════════════════════════════════════════════════════ */
const allElectrons = [];

function bondOrbital(posA, posB, speed, phase0) {
    const dir = new THREE.Vector3().subVectors(posB, posA).normalize();
    const len = posA.distanceTo(posB);
    const mid = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);

    const grp = new THREE.Group();
    grp.position.copy(mid);
    grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    const rA   = len * 0.40;
    const rB   = len * 0.16;
    

    for (let i = 0; i < 2; i++) {
        const el = makeElectron(0x44aadd); // solid blue electron
        grp.add(el);
        allElectrons.push({ mesh: el, phase: phase0 + i * Math.PI, spd: speed, rA, rB, type: 'bond' });
    }
    mol.add(grp);
}

function lonePairOrbital(offset, tiltX, tiltY, speed, phase0) {
    const grp = new THREE.Group();
    grp.position.copy(oPos).add(offset);
    grp.rotation.x = tiltX;
    grp.rotation.y = tiltY;

    const r    = 1.05;
    

    for (let i = 0; i < 2; i++) {
        const el = makeElectron(0x33cc88); // solid green for lone pairs
        el.scale.setScalar(0.95);
        grp.add(el);
        allElectrons.push({ mesh: el, phase: phase0 + i * Math.PI, spd: speed, rA: r, rB: r * 0.28, type: 'lone' });
    }
    mol.add(grp);
}

bondOrbital(oPos, h1Pos,  1.25, 0.0);
bondOrbital(oPos, h2Pos, -1.10, Math.PI * 0.3);
lonePairOrbital(new THREE.Vector3( 0.55, 1.10, 0), DEG(20),  DEG(50),  0.72, 0.0);
lonePairOrbital(new THREE.Vector3(-0.55, 1.10, 0), DEG(20), -DEG(50), -0.68, 1.2);

/* ── Ambient particles — very faint, just dot ambiance ── */
const pCount  = isMobile ? 60 : 120;
const pGeo    = new THREE.BufferGeometry();
const pPosArr = new Float32Array(pCount * 3);
for (let i = 0; i < pCount; i++) {
    const r   = 4.0 + Math.random() * 1.5;
    const phi = Math.acos(2 * Math.random() - 1);
    const tht = Math.random() * TAU;
    pPosArr[i*3]   = r * Math.sin(phi) * Math.cos(tht);
    pPosArr[i*3+1] = r * Math.sin(phi) * Math.sin(tht);
    pPosArr[i*3+2] = r * Math.cos(phi);
}
pGeo.setAttribute('position', new THREE.BufferAttribute(pPosArr, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    color: 0x88aacc, size: 0.028, transparent: true, opacity: 0.30,
    depthWrite: false, sizeAttenuation: true,
}));
mol.add(particles);
scene.add(mol);

/* ═══════════════════════════════════════════════════════════
   RAYCASTING — hover
════════════════════════════════════════════════════════════ */
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2(-9, -9);
const hTargets  = [oAtom, h1Atom, h2Atom];

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
   ANIMATION LOOP — direct renderer.render(), no composer
════════════════════════════════════════════════════════════ */
const clock     = new THREE.Clock();
const hoverVals = [0, 0, 0];

// Collect all shader mats that need uTime
const timedMats = [];
mol.traverse(node => {
    if (node.isMesh && node.material?.uniforms?.uTime !== undefined) {
        timedMats.push(node.material);
    }
});

function tick() {
    requestAnimationFrame(tick);
    const t = clock.getElapsedTime();

    for (const mat of timedMats) mat.uniforms.uTime.value = t;

    // Hover detection
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(hTargets, false);

    hTargets.forEach((atom, i) => {
        const hit = hits.length > 0 && hits[0].object === atom;
        hoverVals[i] += ((hit ? 1 : 0) - hoverVals[i]) * 0.10;
        atom.material.uniforms.uHover.value = hoverVals[i];
        // Gentle scale on hover via uScale
        atom.material.uniforms.uScale.value = 1.0 + hoverVals[i] * 0.055;
    });

    // Electron orbits
    for (const e of allElectrons) {
        const a = t * e.spd + e.phase;
        if (e.type === 'bond') {
            e.mesh.position.set(0, Math.cos(a) * e.rA, Math.sin(a) * e.rB);
        } else {
            e.mesh.position.set(Math.cos(a) * e.rA, 0, Math.sin(a) * e.rB);
        }
    }

    // Gentle float — whole molecule breathes
    mol.position.y = Math.sin(t * 0.50) * 0.07;

    // Slow ambient particle drift
    particles.rotation.y = t * 0.050;
    particles.rotation.x = t * 0.028;

    controls.update();
    renderer.render(scene, camera); // Direct render — no bloom composer
}

tick();