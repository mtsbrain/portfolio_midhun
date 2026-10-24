import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/*
 * True 3D Deep-Space Navigation & Relativistic Astrophysics Simulation:
 *
 *   1. Origin Vantage          (   0,    0,    14)
 *   2. Saturn Sector           (  52,  -18,   -48) — camera arcs starboard-low alongside Saturn's rings
 *   3. Red Emission Nebula     ( -62,   34,  -142) — camera flies DIRECTLY THROUGH the volumetric heart of
 *      this multi-plane H-alpha crimson/amber nebula, surrounded by glowing pillars & embedded protostars,
 *      then emerges out the far side and banks across to a completely different side of space!
 *   4. Spiral Galaxy Sector    ( 108,   68,  -256) — emerges from the red nebula & sweeps far starboard-high
 *   5. Binary Neutron Merger   ( -68,  -46,  -378) — dives port-low to witness photorealistic relativistic
 *      neutron stars (gravitational light-bending self-lensing, ultra-hot blue-white thermal atmosphere,
 *      subtle curved synchrotron pulsar plumes) & a seamless organic volumetric fluid kilonova nebula
 *   6. Relativistic Black Hole (  24,  -12,  -510) — spirals inward & plunges through the event horizon
 *   7. Long Continuously-Curving Wormhole (~720 units of non-stop 3D curvature in pure dark space)
 *   8. Emergence into the Second Universe — opens onto two colliding, tidally mixing spiral galaxies
 */

// ~2.5-minute realistic pulsar spin + GW inspiral -> collision -> nebula born from star -> rebirth from nebula
const MERGE_CYCLE = 150.0;
const MERGE_CONTACT_T = 118.0;

// Distinct 3D coordinates for each major cosmic landmark
const POS_SATURN: [number, number, number] = [52, -18, -48];
const POS_RED_NEBULA = new THREE.Vector3(-62, 34, -142);
const POS_GALAXY_1: [number, number, number] = [108, 68, -256];
const POS_MERGER: [number, number, number] = [-68, -46, -378];
const POS_BLACKHOLE = new THREE.Vector3(24, -12, -510);
const POS_MERGING_GALAXIES = new THREE.Vector3(-125, 107, -1280);

function scrollProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
}

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function smoothstepJS(edge0: number, edge1: number, x: number) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

// Pre-allocated vectors at module scope to prevent GC churn in render loop
const _targetPos = new THREE.Vector3();
const _tmpLook = new THREE.Vector3();
const _curvePt = new THREE.Vector3();
const _curveTan = new THREE.Vector3();
const _focusTarget = new THREE.Vector3();

function createGlowTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.2, "rgba(255,255,255,0.45)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.08)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAnisotropy;
  return t;
}

function createBandTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 512;
  const g = c.getContext("2d")!;
  const r = seeded(3);
  const tones = ["#e8d3a8", "#d6b98a", "#c9a676", "#efdcb8", "#b8935f", "#dcc497"];
  for (let y = 0; y < 512; ) {
    const h = 4 + r() * 24;
    g.fillStyle = tones[Math.floor(r() * tones.length)] ?? "#d6b98a";
    g.globalAlpha = 0.6 + r() * 0.4;
    g.fillRect(0, y, 4, h);
    y += h;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAnisotropy;
  return t;
}

function createRingTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 4;
  const g = c.getContext("2d")!;
  const r = seeded(11);
  for (let x = 0; x < 1024; x++) {
    const t = x / 1024;
    let a = 0.25 + r() * 0.5;
    if (t > 0.58 && t < 0.63) a *= 0.08;
    if (t < 0.08) a *= t / 0.08;
    if (t > 0.94) a *= (1 - t) / 0.06;
    const l = 190 + Math.floor(r() * 50);
    g.fillStyle = `rgba(${l},${l - 18},${l - 45},${a})`;
    g.fillRect(x, 0, 1, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/*
 * Pre-bakes a 256x256 2x2 Nebula Cloud Atlas ONCE on CPU (~4ms) using a fast
 * integer-hash lookup table. Eliminates >99.8% of per-pixel FBM shader math
 * during the Red Nebula interior fly-through on every device.
 *   R = domain-warped gas density
 *   G = H-alpha shock-front pillar ridges
 *   B = Bok-globule dust lane contrast
 *   A = seamless radial cloud mask (zero at tile borders so mipmaps never bleed)
 */
function createNebulaAtlasTexture(maxAnisotropy: number): THREE.DataTexture {
  const size = 256;
  const tile = 128;
  const data = new Uint8Array(size * size * 4);

  const perm = new Uint8Array(512);
  const rnd = seeded(1337);
  const pBase = new Uint8Array(256);
  for (let i = 0; i < 256; i++) pBase[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = pBase[i];
    pBase[i] = pBase[j];
    pBase[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = pBase[i & 255];

  const vnoise = (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3.0 - 2.0 * xf);
    const v = yf * yf * (3.0 - 2.0 * yf);
    const X = xi & 255;
    const Y = yi & 255;
    const aa = perm[perm[X] + Y] / 255.0;
    const ba = perm[perm[X + 1] + Y] / 255.0;
    const ab = perm[perm[X] + Y + 1] / 255.0;
    const bb = perm[perm[X + 1] + Y + 1] / 255.0;
    const x1 = aa + (ba - aa) * u;
    const x2 = ab + (bb - ab) * u;
    return x1 + (x2 - x1) * v;
  };

  const fbm5 = (px: number, py: number): number => {
    let val = 0.0;
    let amp = 0.5;
    let x = px;
    let y = py;
    for (let o = 0; o < 5; o++) {
      val += amp * vnoise(x, y);
      x *= 2.03;
      y *= 2.03;
      amp *= 0.5;
    }
    return val;
  };

  const seeds = [2.3, 11.7, 23.9, 37.4];

  for (let ty = 0; ty < 2; ty++) {
    for (let tx = 0; tx < 2; tx++) {
      const seed = seeds[ty * 2 + tx];
      for (let ly = 0; ly < tile; ly++) {
        const ny = (ly / (tile - 1)) * 2.0 - 1.0;
        for (let lx = 0; lx < tile; lx++) {
          const nx = (lx / (tile - 1)) * 2.0 - 1.0;

          // Strictly zero out before tile edge so bilinear & mipmaps never show quad seams
          const boxEdge = Math.max(Math.abs(nx), Math.abs(ny));
          if (boxEdge >= 0.95) continue;

          const px = nx * 1.55 + 16.0;
          const py = ny * 1.55 + 16.0;

          const qx = fbm5(px + seed, py + seed * 0.65);
          const qy = fbm5(px - seed * 0.7 + 4.2, py + seed * 1.25);
          const n = fbm5(px * 1.35 + qx * 1.85 + seed, py * 1.35 + qy * 1.85);
          const rRaw = fbm5(px * 2.55 + qx * 2.1, py * 2.55 + qy * 2.1);
          const ridge = Math.pow(Math.max(0.0, 1.0 - Math.abs(rRaw - 0.5) * 2.0), 3.0);

          const warpedRad = Math.hypot(nx + (qx - 0.5) * 0.36, ny + (qy - 0.5) * 0.36);
          const borderGuard = 1.0 - smoothstepJS(0.76, 0.94, boxEdge);
          const mask = smoothstepJS(1.02, 0.14, warpedRad) * borderGuard;
          const dust = smoothstepJS(0.24, 0.66, n);

          const gx = tx * tile + lx;
          const gy = ty * tile + ly;
          const idx = (gy * size + gx) * 4;
          data[idx] = Math.min(255, Math.max(0, Math.round(n * 255)));
          data[idx + 1] = Math.min(255, Math.max(0, Math.round(ridge * 255)));
          data[idx + 2] = Math.min(255, Math.max(0, Math.round(dust * 255)));
          data[idx + 3] = Math.min(255, Math.max(0, Math.round(mask * 255)));
        }
      }
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/*
 * Pre-bakes a 100% seamless, periodic 256x256 multi-octave FBM turbulence texture ONCE (~3ms).
 * Used by the Black Hole relativistic accretion disk, Wormhole lensing sky, Neutron Star
 * magneto-thermal atmosphere, and Kilonova filaments to eliminate expensive per-pixel FBM loops
 * while preserving identical relativistic visual detail.
 */
function createSeamlessNoiseTexture(maxAnisotropy: number): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);

  const makePerm = (seed: number) => {
    const rnd = seeded(seed);
    const pBase = new Uint8Array(256);
    for (let i = 0; i < 256; i++) pBase[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = pBase[i];
      pBase[i] = pBase[j];
      pBase[j] = tmp;
    }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = pBase[i & 255];
    return perm;
  };

  const permA = makePerm(901);
  const permB = makePerm(2749);
  const permC = makePerm(6151);

  const pNoise = (perm: Uint8Array, x: number, y: number, period: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3.0 - 2.0 * xf);
    const v = yf * yf * (3.0 - 2.0 * yf);
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const aa = perm[perm[x0 & 255] + (y0 & 255)] / 255.0;
    const ba = perm[perm[x1 & 255] + (y0 & 255)] / 255.0;
    const ab = perm[perm[x0 & 255] + (y1 & 255)] / 255.0;
    const bb = perm[perm[x1 & 255] + (y1 & 255)] / 255.0;
    const l1 = aa + (ba - aa) * u;
    const l2 = ab + (bb - ab) * u;
    return l1 + (l2 - l1) * v;
  };

  const fbmPeriodic = (perm: Uint8Array, u: number, v: number, baseFreq: number): number => {
    let sum = 0.0;
    let amp = 0.5;
    let freq = baseFreq;
    for (let o = 0; o < 5; o++) {
      sum += amp * pNoise(perm, u * freq, v * freq, freq);
      freq *= 2;
      amp *= 0.5;
    }
    return sum;
  };

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const n1 = fbmPeriodic(permA, u, v, 8);
      const n2 = fbmPeriodic(permB, u, v, 12);
      const n3Raw = fbmPeriodic(permC, u, v, 8);
      const ridge = Math.pow(Math.max(0.0, 1.0 - Math.abs(n3Raw - 0.5) * 2.0), 2.4);

      const idx = (y * size + x) * 4;
      data[idx] = Math.min(255, Math.max(0, Math.round(n1 * 255)));
      data[idx + 1] = Math.min(255, Math.max(0, Math.round(n2 * 255)));
      data[idx + 2] = Math.min(255, Math.max(0, Math.round(ridge * 255)));
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/*
 * Outer Universe 3D Navigation Curve (p = 0.00 -> 0.55):
 *   - Flies close beside Saturn (52, -18, -48)
 *   - Banks across space and plunges STRAIGHT THROUGH the interior core of the Red Emission Nebula
 *     from (-46, 26, -112) -> (-62, 34, -142) -> (-74, 41, -168)
 *   - Breaks out of the back of the red nebula and banks dramatically across to the opposite
 *     starboard-high side of space (+108, +68, -256) to explore the Spiral Galaxy
 *   - Dives diagonally down-port to (-60, -44, -362) to witness the Binary Neutron-Star Merger
 *   - Curves into the gravitational capture funnel of the Black Hole at (24, -12, -510)
 */
function createOuterExplorationCurve(): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, 0, 14),          // u ~ 0.00: Origin vantage
      new THREE.Vector3(24, -9, -12),       // Banking starboard-low toward Saturn
      new THREE.Vector3(44, -17, -36),      // u ~ 0.16: Close flyby of Saturn at (52, -18, -48)
      new THREE.Vector3(-12, 10, -82),      // Climbing & banking port toward the Red Nebula
      new THREE.Vector3(-48, 27, -116),     // Entering the glowing outer veil of the Red Nebula
      new THREE.Vector3(-62, 34, -142),     // u ~ 0.38: Flying RIGHT INSIDE the core of the Red Nebula!
      new THREE.Vector3(-68, 40, -168),     // Exiting the far side of the Red Nebula clouds
      new THREE.Vector3(18, 56, -202),      // Sweeping across to the opposite side of deep space!
      new THREE.Vector3(82, 60, -230),      // u ~ 0.62: Exploring the Spiral Galaxy at (108, 68, -256)
      new THREE.Vector3(14, 10, -298),      // Diving diagonally across space toward the pulsar sector
      new THREE.Vector3(-59, -43, -362),    // u ~ 0.82: Close vantage of Binary Neutron-Star Merger at (-68, -46, -378)
      new THREE.Vector3(-18, -28, -430),    // Leaving merger sector toward the Black Hole
      new THREE.Vector3(18, -14, -468),     // u = 1.00: Entering Black Hole capture funnel at (24, -12, -510)
    ],
    false,
    "catmullrom",
    0.5
  );
}

/*
 * Extended Continuously-Curving Wormhole & Second-Universe Curve (p = 0.65 -> 1.00):
 * Non-stop 9-bend 3D serpentine/corkscrew spacetime throat (~720 spatial units)
 */
function createWormholeAndEmergenceCurve(): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(24, -12, -510),     // u=0.00: Black Hole Horizon entry
      new THREE.Vector3(58, -34, -548),     // Bend 1
      new THREE.Vector3(96, 8, -598),       // Bend 2
      new THREE.Vector3(48, 62, -656),      // Bend 3
      new THREE.Vector3(-34, 46, -716),     // Bend 4
      new THREE.Vector3(-88, -18, -776),    // Bend 5
      new THREE.Vector3(-42, -68, -838),    // Bend 6
      new THREE.Vector3(36, -38, -898),     // Bend 7
      new THREE.Vector3(64, 28, -958),      // Bend 8
      new THREE.Vector3(12, 74, -1018),     // Bend 9: Approaching throat exit mouth (u ~ 0.80)
      new THREE.Vector3(-38, 88, -1075),    // Stepping out through the curved throat into the Other Universe
      new THREE.Vector3(-76, 96, -1140),    // Gently curving glide into the new cosmos
      new THREE.Vector3(-104, 102, -1205),  // Resting panoramic vantage in the Other Universe
    ],
    false,
    "catmullrom",
    0.5
  );
}

export default function Cosmos({ paused = false }: { paused?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement("canvas").getContext("webgl2");
        if (!gl) return true;
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const isSmall = window.innerWidth < 768;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }

    const pr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, isSmall ? 1.25 : 1.5);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();
    const baseBg = new THREE.Color("#03050a");
    const redNebulaTint = new THREE.Color("#16050a");
    const activeBg = new THREE.Color("#03050a");
    scene.background = activeBg;
    const sceneFog = new THREE.FogExp2("#03050a", 0.0028);
    scene.fog = sceneFog;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.14;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      900
    );
    camera.position.set(0, 0, 14);

    const hemiLight = new THREE.HemisphereLight("#b4cfff", "#080b14", 0.12);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight("#fff1dc", 3.2);
    dirLight.position.set(-25, 18, 15);
    dirLight.castShadow = !isSoftwareGl;
    if (!isSoftwareGl) {
      dirLight.shadow.mapSize.set(1024, 1024);
      dirLight.shadow.bias = -0.0005;
      dirLight.shadow.normalBias = 0.02;
    }
    scene.add(dirLight);

    const disposables: Array<{ dispose: () => void }> = [envTarget];
    const glowTex = createGlowTexture(maxAniso);
    disposables.push(glowTex);

    const outerCurve = createOuterExplorationCurve();
    const wormholeCurve = createWormholeAndEmergenceCurve();
    const WORMHOLE_MOUTH_U = 0.80;
    const throatMouthPos = wormholeCurve.getPointAt(WORMHOLE_MOUTH_U);

    function makeGlowSprite(
      color: string,
      scale: number,
      opacity = 1,
      pos: [number, number, number] = [0, 0, 0]
    ) {
      const mat = new THREE.SpriteMaterial({
        map: glowTex,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(pos[0], pos[1], pos[2]);
      sprite.scale.set(scale, scale, 1);
      return sprite;
    }

    /* ---------- 1. First Universe Stars ---------- */
    const starCount = isSmall ? 8000 : 18000;
    const starGeo = new THREE.BufferGeometry();
    {
      const r = seeded(7);
      const p = new Float32Array(starCount * 3);
      const c = new Float32Array(starCount * 3);
      const s = new Float32Array(starCount);
      const warm = new THREE.Color("#ffd2a8");
      const cool = new THREE.Color("#b4cfff");
      const white = new THREE.Color("#ffffff");
      const samplePt = new THREE.Vector3();

      for (let i = 0; i < starCount; i++) {
        const u = r();
        outerCurve.getPointAt(u, samplePt);
        const rad = 28 + Math.pow(r(), 0.65) * 260;
        const th = r() * Math.PI * 2;
        const zJitter = (r() - 0.5) * 90;
        const zFinal = Math.max(samplePt.z + zJitter, POS_BLACKHOLE.z - 12);

        p[i * 3] = samplePt.x + Math.cos(th) * rad;
        p[i * 3 + 1] = samplePt.y + Math.sin(th) * rad;
        p[i * 3 + 2] = zFinal;

        const col = r() < 0.15 ? warm : r() < 0.35 ? cool : white;
        c.set([col.r, col.g, col.b], i * 3);
        s[i] = Math.pow(r(), 7) * 4 + 0.35;
      }
      starGeo.setAttribute("position", new THREE.BufferAttribute(p, 3));
      starGeo.setAttribute("color", new THREE.BufferAttribute(c, 3));
      starGeo.setAttribute("size", new THREE.BufferAttribute(s, 1));
    }
    const starMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPR: { value: pr },
      },
      vertexShader: `
        attribute float size; attribute vec3 color; varying vec3 vColor; varying float vTw;
        uniform float uTime; uniform float uPR;
        void main(){
          vColor = color;
          vTw = 0.7 + 0.3 * sin(uTime * (0.6 + fract(position.x * 0.13) * 2.5) + position.y);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uPR * (140.0 / max(-mv.z, 0.6));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor; varying float vTw;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = pow(smoothstep(0.5, 0.0, d), 2.2);
          gl_FragColor = vec4(vColor * vTw, a);
        }
      `,
    });
    disposables.push(starGeo, starMat);
    const starsPoints = new THREE.Points(starGeo, starMat);
    starsPoints.frustumCulled = false;
    scene.add(starsPoints);

    /* ---------- 2. Subtle Cosmic Dust ---------- */
    const dustCount = isSmall ? 500 : 1200;
    const dustGeo = new THREE.BufferGeometry();
    {
      const r = seeded(99);
      const p = new Float32Array(dustCount * 3);
      const samplePt = new THREE.Vector3();
      for (let i = 0; i < dustCount; i++) {
        outerCurve.getPointAt(r(), samplePt);
        p[i * 3] = samplePt.x + (r() - 0.5) * 55;
        p[i * 3 + 1] = samplePt.y + (r() - 0.5) * 38;
        p[i * 3 + 2] = samplePt.z + (r() - 0.5) * 60;
      }
      dustGeo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    }
    const dustMat = new THREE.PointsMaterial({
      size: 0.065,
      color: "#cfd8e8",
      transparent: true,
      opacity: 0.45,
      sizeAttenuation: true,
      depthWrite: false,
    });
    disposables.push(dustGeo, dustMat);
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    dustPoints.frustumCulled = false;
    scene.add(dustPoints);

    /* ---------- 3. Saturn (Sector 1: [52, -18, -48]) ---------- */
    const saturnGroup = new THREE.Group();
    saturnGroup.position.set(POS_SATURN[0], POS_SATURN[1], POS_SATURN[2]);
    saturnGroup.rotation.set(0.35, -0.22, -0.32);

    const bandsTex = createBandTexture(maxAniso);
    const ringsTex = createRingTexture(maxAniso);
    disposables.push(bandsTex, ringsTex);

    const saturnBodyGeo = new THREE.SphereGeometry(2.4, 96, 96);
    const saturnBodyMat = new THREE.MeshStandardMaterial({
      map: bandsTex,
      roughness: 0.85,
      metalness: 0.05,
    });
    const saturnBody = new THREE.Mesh(saturnBodyGeo, saturnBodyMat);
    saturnBody.castShadow = !isSoftwareGl;
    saturnBody.receiveShadow = !isSoftwareGl;
    saturnGroup.add(saturnBody);

    const saturnAtmoGeo = new THREE.SphereGeometry(2.4, 48, 48);
    const saturnAtmoMat = new THREE.MeshBasicMaterial({
      color: "#f3d9a6",
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const saturnAtmo = new THREE.Mesh(saturnAtmoGeo, saturnAtmoMat);
    saturnAtmo.scale.setScalar(1.04);
    saturnGroup.add(saturnAtmo);

    const saturnRingGeo = new THREE.RingGeometry(3.2, 6.7, 256, 1);
    {
      const inner = 3.2;
      const outer = 6.7;
      const pos = saturnRingGeo.getAttribute("position") as THREE.BufferAttribute;
      const uv = saturnRingGeo.getAttribute("uv") as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
      }
    }
    const saturnRingMat = new THREE.MeshStandardMaterial({
      map: ringsTex,
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.6,
      metalness: 0.15,
      depthWrite: false,
    });
    const saturnRings = new THREE.Mesh(saturnRingGeo, saturnRingMat);
    saturnRings.rotation.x = -Math.PI / 2;
    saturnRings.receiveShadow = !isSoftwareGl;
    saturnGroup.add(saturnRings);

    disposables.push(
      saturnBodyGeo,
      saturnBodyMat,
      saturnAtmoGeo,
      saturnAtmoMat,
      saturnRingGeo,
      saturnRingMat
    );
    scene.add(saturnGroup);

    /* =========================================================================
     * 4. ULTRA-OPTIMIZED VOLUMETRIC FLY-THROUGH RED H-ALPHA EMISSION NEBULA
     *    Sector 2: [-62, 34, -142] — Camera flies directly through its 3D interior!
     *    Engineered for zero lag on every mobile/integrated/software GPU:
     *      - Pre-baked 2x2 FBM/ridge/Bok-globule atlas sampled in 1 mediump lookup
     *      - 1 single THREE.InstancedMesh draw call (12 sculpted curtains framing the
     *        3D stellar-nursery tunnel to minimize full-screen overdraw)
     *      - Hardware vertex-shader culling for passed/distant layers
     *      - 1 single THREE.Points draw call combining OB protostars + ionized embers
     *        with capped screen-space point sizes so close pass-throughs never stall fill-rate
     * ========================================================================= */
    const nebulaAtlasTex = createNebulaAtlasTexture(maxAniso);
    disposables.push(nebulaAtlasTex);

    interface NebulaInstance {
      group: THREE.Group;
      mat: THREE.ShaderMaterial;
      baseRot: number;
      minP: number;
      maxP: number;
    }
    const nebulae: NebulaInstance[] = [];

    const redNebulaGroup = new THREE.Group();
    redNebulaGroup.position.copy(POS_RED_NEBULA);
    scene.add(redNebulaGroup);

    const redNebulaMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uAtlas: { value: nebulaAtlasTex },
        uTime: { value: 0 },
        uSectorFade: { value: 1 },
      },
      vertexShader: `
        attribute vec2 aTile;
        attribute vec3 aColorA;
        attribute vec3 aColorB;
        attribute vec3 aParams; // x = opacity, y = spinSpeed, z = flipUv

        uniform float uTime;
        uniform float uSectorFade;

        varying vec2 vAtlasUv;
        varying vec3 vColorA;
        varying vec3 vColorB;
        varying float vOpacity;
        varying float vCamDist;

        void main() {
          vec4 mvCenter = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float centerDist = -mvCenter.z;

          // Hardware vertex clip when curtain is behind camera or beyond visible range
          if (uSectorFade <= 0.002 || centerDist < -14.0 || centerDist > 235.0) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            vOpacity = 0.0;
            vCamDist = 0.0;
            vAtlasUv = vec2(0.0);
            vColorA = vec3(0.0);
            vColorB = vec3(0.0);
            return;
          }

          float ang = uTime * aParams.y;
          float cs = cos(ang);
          float sn = sin(ang);
          vec3 spunPos = vec3(
            position.x * cs - position.y * sn,
            position.x * sn + position.y * cs,
            position.z
          );

          vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(spunPos, 1.0);
          vCamDist = -mvPos.z;

          float farFade = 1.0 - smoothstep(155.0, 230.0, centerDist);
          vOpacity = aParams.x * farFade * uSectorFade;

          vec2 localUv = uv;
          if (aParams.z > 0.5) localUv.x = 1.0 - localUv.x;
          vAtlasUv = aTile + mix(vec2(0.02), vec2(0.48), localUv);
          vColorA = aColorA;
          vColorB = aColorB;

          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        precision mediump float;
        uniform sampler2D uAtlas;
        varying vec2 vAtlasUv;
        varying vec3 vColorA;
        varying vec3 vColorB;
        varying float vOpacity;
        varying float vCamDist;

        void main() {
          // Smoothly part gas veils as the camera glides through them (zero plane pop!)
          float nearFade = smoothstep(1.2, 10.5, vCamDist);
          float w = vOpacity * nearFade;
          if (w <= 0.003) discard;

          vec4 s = texture2D(uAtlas, vAtlasUv);
          float mask = s.a * w;
          if (mask <= 0.003) discard;

          float n = s.r;
          float ridge = s.g * 1.55;
          float dust = 0.54 + 0.66 * s.b;

          vec3 col = mix(vColorA, vColorB, smoothstep(0.30, 0.76, n)) * (n * 1.32 + ridge * 0.85) * dust;
          float a = clamp((n * n * 0.90 + ridge * 0.18) * mask, 0.0, 0.68);
          if (a <= 0.002) discard;

          gl_FragColor = vec4(col * a, a);
        }
      `,
    });

    const redNebulaPointMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPR: { value: pr },
        uSectorFade: { value: 1 },
      },
      vertexShader: `
        attribute float aSize;
        attribute vec3 color;
        uniform float uPR;
        uniform float uSectorFade;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = -mv.z;
          if (uSectorFade <= 0.002 || dist < 0.6 || dist > 235.0) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            vColor = vec3(0.0);
            vAlpha = 0.0;
            return;
          }
          vColor = color;
          vAlpha = smoothstep(0.8, 5.5, dist) * (1.0 - smoothstep(160.0, 230.0, dist)) * uSectorFade;
          // Cap screen-space size so close flyby particles never cause mobile fill-rate spikes
          gl_PointSize = min(aSize * uPR * (115.0 / max(dist, 3.0)), 72.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision mediump float;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d2 = dot(p, p);
          if (d2 > 0.25) discard;
          // Fast radial falloff (exp-like soft halo + crisp core, zero texture fetch)
          float falloff = 1.0 - d2 * 4.0;
          float glow = falloff * falloff * (0.45 + 0.55 * falloff);
          float a = glow * vAlpha;
          if (a <= 0.003) discard;
          gl_FragColor = vec4(vColor * a, a);
        }
      `,
    });
    disposables.push(redNebulaMat, redNebulaPointMat);

    {
      const r = seeded(42);
      const curtainCount = 12;
      const basePlaneGeo = new THREE.PlaneGeometry(1, 1);
      const instMesh = new THREE.InstancedMesh(basePlaneGeo, redNebulaMat, curtainCount);

      const tileArr = new Float32Array(curtainCount * 2);
      const colAArr = new Float32Array(curtainCount * 3);
      const colBArr = new Float32Array(curtainCount * 3);
      const paramArr = new Float32Array(curtainCount * 3);

      const dummy = new THREE.Object3D();
      const cA1 = new THREE.Color("#d92648");
      const cA2 = new THREE.Color("#ff3d62");
      const cA3 = new THREE.Color("#b81d3d");
      const cB1 = new THREE.Color("#ff9e64");
      const cB2 = new THREE.Color("#ff6b8b");
      const tiles: Array<[number, number]> = [
        [0.0, 0.0],
        [0.5, 0.0],
        [0.0, 0.5],
        [0.5, 0.5],
      ];

      for (let i = 0; i < curtainCount; i++) {
        const zFrac = i / (curtainCount - 1) - 0.5; // -0.5 .. +0.5 -> z = -32 .. +32
        // Sculpted stellar-nursery tunnel around camera trajectory (+14,-7,+26) -> (0,0,0) -> (-6,+6,-26)
        const pathX = -zFrac * 18.0;
        const pathY = -zFrac * 12.0;
        const ringAngle = i * 2.39996; // golden-angle distribution around tunnel walls
        const wallOffset = i % 4 === 1 ? 3.5 + r() * 4.0 : 10.5 + r() * 9.5;

        const offsetX = pathX + Math.cos(ringAngle) * wallOffset;
        const offsetY = pathY + Math.sin(ringAngle) * wallOffset * 0.82;
        const offsetZ = zFrac * 64.0 + (r() - 0.5) * 4.0;
        const planeScale = 44.0 + r() * 22.0;

        dummy.position.set(offsetX, offsetY, offsetZ);
        dummy.rotation.set((r() - 0.5) * 0.36, (r() - 0.5) * 0.36, r() * Math.PI * 2);
        dummy.scale.set(planeScale, planeScale, 1);
        dummy.updateMatrix();
        instMesh.setMatrixAt(i, dummy.matrix);

        const tCoord = tiles[i % 4];
        tileArr[i * 2] = tCoord[0];
        tileArr[i * 2 + 1] = tCoord[1];

        const colA = i % 3 === 0 ? cA1 : i % 3 === 1 ? cA2 : cA3;
        const colB = i % 2 === 0 ? cB1 : cB2;
        colAArr.set([colA.r, colA.g, colA.b], i * 3);
        colBArr.set([colB.r, colB.g, colB.b], i * 3);

        const op = 0.30 + (1.0 - Math.abs(zFrac)) * 0.22;
        const spin = (i % 2 === 0 ? 1 : -1) * (0.008 + r() * 0.008);
        paramArr.set([op, spin, i % 2], i * 3);
      }

      instMesh.instanceMatrix.needsUpdate = true;
      basePlaneGeo.setAttribute("aTile", new THREE.InstancedBufferAttribute(tileArr, 2));
      basePlaneGeo.setAttribute("aColorA", new THREE.InstancedBufferAttribute(colAArr, 3));
      basePlaneGeo.setAttribute("aColorB", new THREE.InstancedBufferAttribute(colBArr, 3));
      basePlaneGeo.setAttribute("aParams", new THREE.InstancedBufferAttribute(paramArr, 3));
      instMesh.frustumCulled = false; // Visibility gated cleanly by redNebulaGroup + vertex shader
      redNebulaGroup.add(instMesh);
      disposables.push(basePlaneGeo);

      // Single combined Points draw call for OB protostar knots + warm ionized dust embers
      const knotDefs: Array<[number, number, number, string, number]> = [
        [-6, 4, -8, "#ffd6e0", 11.0],
        [-6, 4, -8, "#ffffff", 3.6],
        [8, -5, 6, "#ffb899", 12.0],
        [8, -5, 6, "#ffffff", 3.8],
        [-3, -6, 16, "#ffe8d6", 9.5],
        [-3, -6, 16, "#ffffff", 3.2],
        [5, 7, -18, "#ff8fa3", 12.5],
        [5, 7, -18, "#ffffff", 4.0],
        [2, 1.5, 0, "#ffeef4", 7.0],
      ];
      const emberCount = isSmall ? 320 : 620;
      const totalPts = knotDefs.length + emberCount;
      const ptGeo = new THREE.BufferGeometry();
      const pPos = new Float32Array(totalPts * 3);
      const pCol = new Float32Array(totalPts * 3);
      const pSize = new Float32Array(totalPts);
      const tmpC = new THREE.Color();

      for (let k = 0; k < knotDefs.length; k++) {
        const [kx, ky, kz, hex, sz] = knotDefs[k];
        pPos[k * 3] = kx;
        pPos[k * 3 + 1] = ky;
        pPos[k * 3 + 2] = kz;
        tmpC.set(hex);
        pCol.set([tmpC.r, tmpC.g, tmpC.b], k * 3);
        pSize[k] = sz;
      }

      const cCrimson = new THREE.Color("#ff5c7c");
      const cGold = new THREE.Color("#ffc085");
      const cHot = new THREE.Color("#ffeef2");
      for (let i = 0; i < emberCount; i++) {
        const idx = knotDefs.length + i;
        const rad = Math.pow(r(), 0.7) * 32;
        const th = r() * Math.PI * 2;
        pPos[idx * 3] = Math.cos(th) * rad;
        pPos[idx * 3 + 1] = Math.sin(th) * rad * 0.85;
        pPos[idx * 3 + 2] = (r() - 0.5) * 72;
        const c = r() < 0.45 ? cCrimson : r() < 0.8 ? cGold : cHot;
        pCol.set([c.r * 0.85, c.g * 0.85, c.b * 0.85], idx * 3);
        pSize[idx] = 0.55 + r() * 0.75;
      }

      ptGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
      ptGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
      ptGeo.setAttribute("aSize", new THREE.BufferAttribute(pSize, 1));
      const redParticles = new THREE.Points(ptGeo, redNebulaPointMat);
      redParticles.frustumCulled = false;
      redNebulaGroup.add(redParticles);
      disposables.push(ptGeo);
    }

    // Ultra-fast InstancedMesh helper for distant background nebulae (1 draw call, 1 texture lookup)
    function buildDistantNebula(
      position: [number, number, number],
      colorA: string,
      colorB: string,
      size: number,
      seed: number,
      rot = 0,
      maxOpacity = 0.35,
      minP = 0.0,
      maxP = 1.01
    ) {
      const group = new THREE.Group();
      group.position.set(position[0], position[1], position[2]);
      const layers = 3;

      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uAtlas: { value: nebulaAtlasTex },
          uA: { value: new THREE.Color(colorA) },
          uB: { value: new THREE.Color(colorB) },
        },
        vertexShader: `
          attribute vec3 aTileOp; // xy = tile offset, z = opacity
          varying vec2 vAtlasUv;
          varying float vOp;
          void main() {
            vAtlasUv = aTileOp.xy + mix(vec2(0.02), vec2(0.48), uv);
            vOp = aTileOp.z;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          uniform sampler2D uAtlas;
          uniform vec3 uA, uB;
          varying vec2 vAtlasUv;
          varying float vOp;
          void main() {
            vec4 s = texture2D(uAtlas, vAtlasUv);
            float mask = s.a * vOp;
            if (mask <= 0.003) discard;
            float n = s.r;
            float fil = s.g * 1.4;
            vec3 col = mix(uA, uB, smoothstep(0.34, 0.76, n)) * (n * 1.35 + fil * 0.7);
            float a = clamp((n * n * 0.95 + fil * 0.2) * mask, 0.0, 0.85);
            if (a <= 0.002) discard;
            gl_FragColor = vec4(col * a, a);
          }
        `,
      });

      const geo = new THREE.PlaneGeometry(1, 1);
      const inst = new THREE.InstancedMesh(geo, mat, layers);
      const tileOp = new Float32Array(layers * 3);
      const dummy = new THREE.Object3D();
      const tileOffset = Math.floor(seed) % 4;
      const tiles: Array<[number, number]> = [
        [0.0, 0.0],
        [0.5, 0.0],
        [0.0, 0.5],
        [0.5, 0.5],
      ];

      for (let i = 0; i < layers; i++) {
        const s = size * (1 + i * 0.16);
        dummy.position.set(0, 0, -i * 6);
        dummy.rotation.set(0, 0, i * 1.05);
        dummy.scale.set(s, s, 1);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);

        const tc = tiles[(tileOffset + i) % 4];
        tileOp[i * 3] = tc[0];
        tileOp[i * 3 + 1] = tc[1];
        tileOp[i * 3 + 2] = Math.max(0.08, maxOpacity - i * 0.07);
      }
      inst.instanceMatrix.needsUpdate = true;
      geo.setAttribute("aTileOp", new THREE.InstancedBufferAttribute(tileOp, 3));
      inst.computeBoundingSphere();
      group.add(inst);
      disposables.push(geo, mat);

      group.add(makeGlowSprite(colorB, size * 0.3, maxOpacity * 0.42));
      scene.add(group);
      nebulae.push({ group, mat, baseRot: rot, minP, maxP });
    }

    buildDistantNebula([92, -62, -195], "#3b5bdb", "#66d9e8", 64, 4.9, -0.4, 0.30, 0.02, 0.46);

    /* ---------- 5. Spiral Galaxy (Sector 3: Far Starboard-High at [108, 68, -256]) ---------- */
    const galaxyGroup = new THREE.Group();
    galaxyGroup.position.set(POS_GALAXY_1[0], POS_GALAXY_1[1], POS_GALAXY_1[2]);
    galaxyGroup.rotation.set(0.88, -0.28, 0.32);

    const galaxyCount = isSmall ? 9000 : 22000;
    const galaxyGeo = new THREE.BufferGeometry();
    {
      const r = seeded(21);
      const p = new Float32Array(galaxyCount * 3);
      const c = new Float32Array(galaxyCount * 3);
      const core = new THREE.Color("#ffe2b8");
      const arm = new THREE.Color("#8fb4ff");
      const pink = new THREE.Color("#ff8fb0");
      const col = new THREE.Color();
      const arms = 3;
      for (let i = 0; i < galaxyCount; i++) {
        const rad = Math.pow(r(), 1.6) * 30;
        const branch = ((i % arms) / arms) * Math.PI * 2;
        const spin = rad * 0.32;
        const spread = Math.pow(r(), 3) * (r() < 0.5 ? 1 : -1) * (1.2 + rad * 0.12);
        const spreadY = Math.pow(r(), 3) * (r() < 0.5 ? 1 : -1) * (0.6 + (30 - rad) * 0.03);
        p[i * 3] = Math.cos(branch + spin) * rad + spread;
        p[i * 3 + 1] = spreadY;
        p[i * 3 + 2] = Math.sin(branch + spin) * rad + spread * 0.7;
        col.copy(core).lerp(r() < 0.06 ? pink : arm, Math.min(rad / 16, 1));
        c.set([col.r, col.g, col.b], i * 3);
      }
      galaxyGeo.setAttribute("position", new THREE.BufferAttribute(p, 3));
      galaxyGeo.setAttribute("color", new THREE.BufferAttribute(c, 3));
    }
    const galaxyMat = new THREE.PointsMaterial({
      size: 0.19,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: glowTex,
    });
    disposables.push(galaxyGeo, galaxyMat);
    const galaxyPoints = new THREE.Points(galaxyGeo, galaxyMat);
    galaxyGroup.add(galaxyPoints);
    galaxyGroup.add(makeGlowSprite("#ffd9a8", 17, 0.8));
    galaxyGroup.add(makeGlowSprite("#ffffff", 4.5, 1.0));
    scene.add(galaxyGroup);

    /* =========================================================================
     * 6. REALISTIC BINARY NEUTRON-STAR SPIN (~2 MINUTES), GRAVITATIONAL WAVES,
     *    STAR-BORN KILONOVA NEBULA & SEAMLESS REBIRTH FROM THAT NEBULA
     *    Sector 4: (-68, -46, -378)
     *
     *    Full Astrophysical Lifecycle (150s continuous loop):
     *      1) ~2 Minutes of Realistic Pulsar Spin & Inspiral (0..118s):
     *         - Ultra-compact 1.4 M_sun neutron stars with Beloborodov GR light-bending
     *           self-lensing, NICER magnetic polar hot caps, magneto-thermal crustal streaks,
     *           and tilted sweeping synchrotron pulsar plumes.
     *         - Clearly visible quadrupole Archimedes-spiral gravitational waves (h_+ / h_x)
     *           rippling outward across spacetime, tightening in wavelength and rising in
     *           amplitude as the orbit chirps toward Roche tidal contact & L1 mass transfer.
     *      2) Nebula Forming Directly From the Merged Star (118..150s):
     *         - Shock-breakout flash at coalescence expands directly from the merged star core
     *           into a multi-layered volumetric kilonova nebula (blue-white shock -> radioactive
     *           gold/amber r-process cloud -> deep crimson/teal filamentary nebula with dark
     *           equatorial lanthanide dust lanes).
     *      3) Seamless Rebirth From That Nebula -> Repeat:
     *         - Inside the glowing heart of that expanding nebula, two newborn neutron-star
     *           cores condense, ignite, and spiral smoothly outward as the parent nebula's
     *           outer filaments disperse into deep space — repeating seamlessly!
     * ========================================================================= */
    const seamlessNoiseTex = createSeamlessNoiseTexture(maxAniso);
    disposables.push(seamlessNoiseTex);

    const mergerGroup = new THREE.Group();
    mergerGroup.position.set(POS_MERGER[0], POS_MERGER[1], POS_MERGER[2]);
    mergerGroup.rotation.set(0.48, 0.22, -0.12);
    scene.add(mergerGroup);

    const nsSphereGeo = new THREE.SphereGeometry(0.50, 56, 56);
    disposables.push(nsSphereGeo);

    function createRealisticNeutronStar(magTilt: number, seedOffset: number) {
      const orbitalRoot = new THREE.Group();

      // Photorealistic Relativistic Neutron Star Surface + Beloborodov Self-Lensing Shader (zero FBM loops!)
      const starMatNS = new THREE.ShaderMaterial({
        uniforms: {
          uNoiseTex: { value: seamlessNoiseTex },
          uTime: { value: 0 },
          uSpinPhase: { value: 0 },
          uTidal: { value: 0 },
          uShockHeat: { value: 0 },
          uMagTilt: { value: magTilt },
          uSeed: { value: seedOffset },
        },
        vertexShader: `
          uniform float uTidal;
          varying vec3 vNormalView;
          varying vec3 vObjNormal;
          varying vec3 vViewDir;

          void main() {
            vec3 n = normalize(position);
            // Smooth fluid Roche-lobe tidal potential deformation toward companion (+X)
            float cosA = n.x;
            float p2 = 0.5 * (3.0 * cosA * cosA - 1.0);
            float p3 = 0.5 * (5.0 * cosA * cosA * cosA - 3.0 * cosA);
            // Rotational oblateness from millisecond spin
            float oblate = -0.065 * (n.y * n.y - 0.33);
            float rScale = 1.0 + uTidal * (0.34 * p2 + 0.17 * smoothstep(-0.2, 1.0, cosA) * p3) + oblate;

            vec3 deformed = position * rScale;
            vec3 pertN = normalize(n - vec3(uTidal * 0.24 * cosA, 0.0, 0.0));

            vObjNormal = n;
            vNormalView = normalize(normalMatrix * pertN);
            vec4 mvPos = modelViewMatrix * vec4(deformed, 1.0);
            vViewDir = normalize(-mvPos.xyz);
            gl_Position = projectionMatrix * mvPos;
          }
        `,
        fragmentShader: `
          precision highp float;
          uniform sampler2D uNoiseTex;
          uniform float uTime;
          uniform float uSpinPhase;
          uniform float uTidal;
          uniform float uShockHeat;
          uniform float uMagTilt;
          uniform float uSeed;
          varying vec3 vNormalView;
          varying vec3 vObjNormal;
          varying vec3 vViewDir;

          void main() {
            vec3 V = normalize(vViewDir);
            vec3 Nv = normalize(vNormalView);
            float mu = clamp(dot(Nv, V), 0.0, 1.0);

            // Beloborodov General-Relativistic Light Bending (R = 2.4 r_s):
            // Bends rays near the limb around the neutron star's deep gravity well so rear hot spots curve into view
            vec3 nObj = normalize(vObjNormal);
            vec3 lensedDir = normalize(mix(-nObj, nObj, 0.30 + 0.70 * pow(mu, 0.62)));

            float cs = cos(uSpinPhase);
            float sn = sin(uSpinPhase);
            vec3 sp = vec3(
              lensedDir.x * cs - lensedDir.z * sn,
              lensedDir.y,
              lensedDir.x * sn + lensedDir.z * cs
            );

            // Tilted magnetic dipole + multipolar NICER X-ray polar caps
            vec3 magAxis = normalize(vec3(sin(uMagTilt), cos(uMagTilt), 0.0));
            float spotNorth = pow(max(dot(sp, magAxis), 0.0), 3.4);
            vec3 southAxis = normalize(vec3(-sin(uMagTilt * 1.12), -cos(uMagTilt * 0.92), 0.20));
            float spotSouth = pow(max(dot(sp, southAxis), 0.0), 4.0);
            float magEquator = exp(-pow(dot(sp, magAxis) / 0.22, 2.0)) * 0.18;
            float polarHeat = clamp(spotNorth + spotSouth * 0.88, 0.0, 1.25);

            // Magneto-thermal crustal & atmospheric shear patterns (seamless lookup, zero FBM cost)
            vec2 atmUv = vec2(atan(sp.z, sp.x) * 0.15915494 * 2.0, sp.y * 0.55) + uSeed * 0.13;
            vec4 nt = texture2D(uNoiseTex, atmUv);
            float fine = texture2D(uNoiseTex, atmUv * 2.5 + vec2(uTime * 0.03, 0.0)).g;
            float surfaceFlux = 0.68 + 0.32 * (nt.r * 0.6 + fine * 0.4) + magEquator * nt.b;

            // Tidal resonant crust heating toward inner Roche nose
            float noseHeat = smoothstep(0.0, 0.95, nObj.x) * uShockHeat;

            vec3 limbSapphire = vec3(0.24, 0.48, 0.96);
            vec3 photosphere  = vec3(0.68, 0.86, 1.00);
            vec3 hotPolarCap  = vec3(1.00, 0.99, 1.00);
            vec3 shockGold    = vec3(1.00, 0.90, 0.78);

            // Electron-scattering atmosphere + GR self-lensing rim brightening
            float limbProfile = 0.46 + 0.54 * pow(mu, 0.52) + 0.32 * pow(1.0 - mu, 2.8);

            vec3 col = mix(limbSapphire, photosphere, clamp(surfaceFlux * limbProfile, 0.0, 1.0));
            col = mix(col, hotPolarCap, clamp(polarHeat * 0.90 + pow(mu, 2.4) * 0.42, 0.0, 1.0));
            col += shockGold * noseHeat * 0.90;
            col *= 1.38 + 0.48 * polarHeat + 0.42 * uShockHeat;

            gl_FragColor = vec4(col, 1.0);
          }
        `,
      });
      disposables.push(starMatNS);

      const starMesh = new THREE.Mesh(nsSphereGeo, starMatNS);
      orbitalRoot.add(starMesh);

      // Realistic Dipolar Magnetosphere & Sweeping Relativistic Pulsar Radiation Plumes
      const plumeGeo = new THREE.PlaneGeometry(7.2, 7.2);
      const plumeMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uNoiseTex: { value: seamlessNoiseTex },
          uTime: { value: 0 },
          uSpinPhase: { value: 0 },
          uMagTilt: { value: magTilt },
          uIntensity: { value: 1.0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          varying vec2 vUv;
          uniform sampler2D uNoiseTex;
          uniform float uTime;
          uniform float uSpinPhase;
          uniform float uMagTilt;
          uniform float uIntensity;

          void main() {
            vec2 p = (vUv - 0.5) * 2.0;
            float r = length(p);
            if (r >= 1.0 || uIntensity <= 0.005) discard;

            // Project 3D tilted spinning magnetic dipole axis onto view plane
            float beamAngle = uMagTilt * sin(uSpinPhase);
            float lighthouseBoost = 0.52 + 0.48 * pow(0.5 + 0.5 * cos(uSpinPhase), 2.4);

            vec2 bDir = vec2(sin(beamAngle), cos(beamAngle));
            vec2 bPerp = vec2(-bDir.y, bDir.x);
            float along = dot(p, bDir);
            float perp = dot(p, bPerp);

            // Gently curved relativistic synchrotron polar pulsar plumes (swept back slightly by rapid spin)
            float spinSweep = perp - 0.14 * along * abs(along) * cos(uSpinPhase);
            float width = 0.038 + abs(along) * 0.21;
            float plume = exp(-pow(spinSweep / width, 2.0)) * exp(-abs(along) * 2.65) * smoothstep(0.05, 0.20, abs(along));
            float wisp = 0.72 + 0.28 * texture2D(uNoiseTex, vec2(along * 0.85 - uTime * 0.45, perp * 1.2)).r;

            // Subtle closed-dipole equatorial magnetospheric plasma torus (r = sin^2(theta) dipole shell)
            float sinTheta2 = (perp * perp) / max(r * r, 1e-4);
            float dipoleShell = exp(-pow((r - 0.34 * sinTheta2) / 0.085, 2.0)) * sinTheta2 * smoothstep(0.08, 0.22, r) * 0.22;

            // Natural inverse-square X-ray atmospheric corona
            float corona = exp(-r * 6.8) * 0.56 + exp(-r * 15.0) * 0.68;

            float total = (corona + plume * wisp * lighthouseBoost * 0.68 + dipoleShell) * uIntensity;
            total *= 1.0 - smoothstep(0.74, 1.0, r);
            if (total <= 0.002) discard;

            vec3 col = mix(vec3(0.38, 0.68, 1.0), vec3(0.94, 0.98, 1.0), clamp(corona * 1.15 + plume * 0.4, 0.0, 1.0));
            gl_FragColor = vec4(col * total * 1.15, clamp(total, 0.0, 0.92));
          }
        `,
      });
      disposables.push(plumeGeo, plumeMat);
      const plumeBillboard = new THREE.Mesh(plumeGeo, plumeMat);
      orbitalRoot.add(plumeBillboard);

      return { orbitalRoot, starMatNS, plumeBillboard, plumeMat };
    }

    const star1 = createRealisticNeutronStar(0.48, 1.3);
    const star2 = createRealisticNeutronStar(0.40, 7.9);
    mergerGroup.add(star1.orbitalRoot);
    mergerGroup.add(star2.orbitalRoot);

    // 6b. Realistic Propagating Spacetime Gravitational Waves (h_+ / h_x Quadrupole Archimedes Spirals)
    //     + Late-Inspiral Tidal Roche Plasma Streams & L1 Mass-Transfer Bridge
    const spiralGasGeo = new THREE.PlaneGeometry(30, 30);
    const spiralGasMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uNoiseTex: { value: seamlessNoiseTex },
        uTime: { value: 0 },
        uOrbitalPhase: { value: 0 },
        uSep: { value: 5.5 },
        uProximity: { value: 0 },
        uChirp: { value: 0 },
        uWaveFade: { value: 1 },
      },
      vertexShader: `
        varying vec2 vPos;
        void main() {
          vPos = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vPos;
        uniform sampler2D uNoiseTex;
        uniform float uTime;
        uniform float uOrbitalPhase;
        uniform float uSep;
        uniform float uProximity;
        uniform float uChirp;
        uniform float uWaveFade;

        void main() {
          float r = length(vPos);
          if (r > 15.0 || uWaveFade <= 0.002) discard;

          float phi = atan(vPos.y, vPos.x);

          // 1) Physical Quadrupole (m = 2) Spacetime Gravitational Waves radiating outward at c:
          //    Wavelength tightens & strain amplitude grows as the binary chirps inward
          float kWave = 1.65 + uChirp * 1.95;
          float gwArg = 2.0 * (phi - uOrbitalPhase) + r * kWave;
          float waveSin = 0.5 + 0.5 * cos(gwArg);
          float gwBody = pow(waveSin, 2.6);
          float gwCaustic = pow(0.5 + 0.5 * cos(gwArg - 0.22), 9.0);

          // Inner wave-zone cut-in outside the binary orbit + 1/r radiative decay + smooth outer edge
          float innerCut = smoothstep(uSep * 0.36, uSep * 0.85 + 0.8, r);
          float outerTap = (1.0 - smoothstep(9.5, 14.8, r)) / (1.0 + r * 0.22);
          float strainAmp = (0.14 + 0.16 * uChirp + 0.08 * uProximity) * uWaveFade;
          float gw = (gwBody * 0.72 + gwCaustic * 0.55) * innerCut * outerTap * strainAmp;

          // 2) Tidally stripped Kelvin-Helmholtz plasma streams & L1 bridge in late inspiral
          float tailStrength = smoothstep(0.14, 0.92, uProximity) * uWaveFade;
          float tail = 0.0;
          if (tailStrength > 0.002) {
            float spiralArm = cos(2.0 * (phi - uOrbitalPhase + r * 0.88));
            float gasTurb = texture2D(uNoiseTex, vec2(phi * 0.47746 - uOrbitalPhase * 0.15915, r * 0.25 - uTime * 0.18)).r;
            tail = pow(max(spiralArm, 0.0), 3.4) * (0.45 + 0.75 * gasTurb)
                   * smoothstep(uSep * 0.35, uSep * 0.65, r)
                   * exp(-max(r - uSep * 0.5, 0.0) * 0.85) * tailStrength * 0.58;
          }

          vec2 rotP = vec2(
            vPos.x * cos(uOrbitalPhase) + vPos.y * sin(uOrbitalPhase),
            -vPos.x * sin(uOrbitalPhase) + vPos.y * cos(uOrbitalPhase)
          );
          float bridge = exp(-pow(rotP.y / 0.24, 2.0)) * smoothstep(uSep * 0.56, 0.0, abs(rotP.x))
                         * smoothstep(0.28, 0.96, uProximity) * uWaveFade * 0.68;

          float a = clamp(gw + tail + bridge, 0.0, 0.88);
          if (a < 0.002) discard;

          vec3 colGw = mix(vec3(0.32, 0.58, 0.96), vec3(0.76, 0.90, 1.0), gwCaustic);
          vec3 colPlasma = mix(vec3(0.62, 0.84, 1.0), vec3(1.0, 0.94, 0.86), clamp(bridge * 1.4, 0.0, 1.0));
          vec3 col = (colGw * gw + colPlasma * (tail + bridge)) / max(a, 1e-4);

          gl_FragColor = vec4(col * a * 1.32, a);
        }
      `,
    });
    disposables.push(spiralGasGeo, spiralGasMat);
    const spiralGasMesh = new THREE.Mesh(spiralGasGeo, spiralGasMat);
    spiralGasMesh.rotation.x = -Math.PI / 2;
    mergerGroup.add(spiralGasMesh);

    // 6c. STAR-BORN VOLUMETRIC KILONOVA NEBULA & STELLAR REBIRTH NURSERY
    //     Expands directly from the merged star core, evolves into a rich filamentary remnant nebula,
    //     and cradles the condensation of the reborn binary neutron stars before dispersing.
    //     Uses pre-baked seamless textures (zero slow per-pixel FBM loops!).
    const kilonovaBillboardGeo = new THREE.PlaneGeometry(34, 34);
    const kilonovaCloudMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uAtlas: { value: nebulaAtlasTex },
        uNoiseTex: { value: seamlessNoiseTex },
        uTime: { value: 0 },
        uKiloTime: { value: 0 },
        uRebirthGlow: { value: 0 },
        uFade: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uAtlas;
        uniform sampler2D uNoiseTex;
        uniform float uTime;
        uniform float uKiloTime;
        uniform float uRebirthGlow;
        uniform float uFade;

        void main() {
          if (uFade <= 0.002 || uKiloTime <= 0.0) discard;

          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          if (r >= 1.0) discard;

          // Homologous expansion directly from the merged star core (r ~ 0.032 -> 0.88 over ~32s)
          float expand = 0.032 + 0.85 * pow(clamp(uKiloTime / 24.0, 0.0, 1.30), 0.64);
          vec2 q = p / max(expand, 0.028);
          float qr = length(q);
          if (qr > 1.55) discard;

          float tilt = -0.22;
          vec2 pq = vec2(q.x * cos(tilt) - q.y * sin(tilt), q.x * sin(tilt) + q.y * cos(tilt));

          // Fast texture-based fluid advection & shock filaments (replaces 24-octave FBM!)
          vec2 nUv = pq * 0.28 + 0.5;
          vec4 turbA = texture2D(uNoiseTex, nUv - pq * (0.012 * min(uKiloTime, 28.0)));
          vec4 turbB = texture2D(uNoiseTex, nUv * 2.1 + (turbA.rg - 0.5) * 0.32 + vec2(uTime * 0.012, 0.0));
          float filaments = turbA.r * 0.52 + turbB.g * 0.30 + turbB.b * 0.28;

          // Sample pre-baked organic Bok-globule / H-alpha cloud tile for natural billowing silhouette
          vec2 tileUv = vec2(0.02) + clamp(pq * 0.42 + 0.5, 0.0, 1.0) * 0.46;
          vec4 cloudSample = texture2D(uAtlas, tileUv);

          vec2 oblateQ = vec2(pq.x * 0.82, pq.y * 1.16);
          float rOblate = length(oblateQ) - (filaments - 0.5) * 0.38;
          float mainCloud = smoothstep(1.22, 0.14, rOblate) * (0.55 + 0.45 * cloudSample.a);

          // Soft relativistic bipolar shock-breakout cocoon emerging along the polar axis
          float polarDist = abs(pq.y);
          float polarWidth = 0.14 + polarDist * 0.28 + (turbB.g - 0.5) * 0.12;
          float jetStretch = smoothstep(0.15, 3.2, uKiloTime) * (1.0 - smoothstep(14.0, 28.0, uKiloTime));
          float polarOutflow = exp(-pow(pq.x / max(polarWidth, 0.05), 2.0))
                               * smoothstep(0.08, 0.45, polarDist)
                               * smoothstep(1.85, 0.35, polarDist / (0.65 + 0.55 * jetStretch))
                               * (0.55 + 0.55 * turbB.g) * jetStretch;

          // Central star remnant engine -> dims slightly as nebula matures -> re-ignites during stellar rebirth!
          float coreEngine = exp(-qr * qr * 14.0) * (0.35 + 0.65 * exp(-uKiloTime * 0.24) + uRebirthGlow * 1.35);

          // Physical Thermal Evolution over the ~32s nebula phase:
          //   0..3.5s: Blue-white shock breakout from the merged star
          //   3.5..14s: Luminous gold/amber r-process radioactive nebula
          //   14..38s: Rich deep-crimson, rose & ionized sapphire-teal filamentary stellar nursery nebula
          float cool = clamp(uKiloTime / 18.0, 0.0, 1.0);

          vec3 colShock   = vec3(0.84, 0.93, 1.00);
          vec3 colGold    = vec3(1.00, 0.74, 0.42);
          vec3 colCrimson = vec3(0.78, 0.20, 0.28);
          vec3 colTealRim = vec3(0.26, 0.62, 0.86);
          vec3 colDust    = vec3(0.12, 0.03, 0.05);

          float localTemp = clamp(cool * (0.65 + 0.52 * rOblate) - coreEngine * 0.50, 0.0, 1.0);
          vec3 gasCol = mix(colShock, colGold, smoothstep(0.02, 0.38, localTemp));
          gasCol = mix(gasCol, colCrimson, smoothstep(0.35, 0.85, localTemp));
          // Ionized O-III sapphire/teal shock ridges in the mature nebula
          gasCol = mix(gasCol, colTealRim, smoothstep(0.45, 0.95, cool) * turbB.b * 0.42);

          // Equatorial heavy-lanthanide dark dust absorption lane
          float eqBand = exp(-pow(pq.y / 0.28, 2.0)) * smoothstep(0.22, 0.95, abs(pq.x));
          float dustAbsorb = eqBand * smoothstep(0.25, 0.72, 1.0 - filaments) * smoothstep(1.8, 7.5, uKiloTime);
          gasCol = mix(gasCol, colDust, clamp(dustAbsorb * 0.76, 0.0, 0.78));

          gasCol *= 0.55 + 0.90 * filaments + coreEngine * 2.1;

          vec3 jetCol = mix(vec3(0.65, 0.84, 1.0), vec3(1.0, 0.93, 0.85), exp(-polarDist * 1.2));
          vec3 totalCol = gasCol * mainCloud + jetCol * polarOutflow * 0.85 + vec3(0.86, 0.94, 1.0) * coreEngine * 1.35;

          // Prompt merger flash in the first 1.2s as the nebula bursts from the colliding stars
          float promptFlash = exp(-uKiloTime * 1.8) * exp(-r * 5.0) * 2.2;
          totalCol += vec3(0.86, 0.94, 1.0) * promptFlash;

          // Central cavity gently clears at late times as the reborn neutron stars emerge from inside the nebula
          float centralClear = 1.0 - uRebirthGlow * exp(-r * r * 36.0) * 0.65;

          float densityAlpha = clamp(
            (mainCloud * (0.36 + 0.62 * filaments) + polarOutflow * 0.48 + coreEngine * 0.75 + promptFlash * 0.5) * centralClear,
            0.0,
            0.92
          );

          float outerEdge = 1.0 - smoothstep(0.78, 1.0, r);
          float finalAlpha = densityAlpha * outerEdge * uFade;

          if (finalAlpha < 0.002) discard;
          gl_FragColor = vec4(totalCol * outerEdge * uFade, finalAlpha);
        }
      `,
    });
    disposables.push(kilonovaBillboardGeo, kilonovaCloudMat);
    const kilonovaCloud = new THREE.Mesh(kilonovaBillboardGeo, kilonovaCloudMat);
    kilonovaCloud.renderOrder = 4;
    mergerGroup.add(kilonovaCloud);

    // Secondary parallax filament layer for volumetric 3D depth
    const kilonovaForeMat = kilonovaCloudMat.clone();
    kilonovaForeMat.blending = THREE.AdditiveBlending;
    kilonovaForeMat.uniforms = THREE.UniformsUtils.clone(kilonovaCloudMat.uniforms);
    kilonovaForeMat.uniforms.uAtlas.value = nebulaAtlasTex;
    kilonovaForeMat.uniforms.uNoiseTex.value = seamlessNoiseTex;
    disposables.push(kilonovaForeMat);
    const kilonovaForeLayer = new THREE.Mesh(kilonovaBillboardGeo, kilonovaForeMat);
    kilonovaForeLayer.position.set(0, 0, 1.3);
    kilonovaForeLayer.scale.setScalar(0.80);
    kilonovaForeLayer.rotation.z = 0.85;
    kilonovaForeLayer.renderOrder = 5;
    mergerGroup.add(kilonovaForeLayer);

    mergerGroup.add(makeGlowSprite("#4e7fd4", 12, 0.11));

    // Sector-active clock initialized at 4.0s so the spinning neutron stars & waves are immediately visible
    let mergerClock = 4.0;
    let hasMergedOnce = false;
    let orbitalAngle = 0;
    let spinPhase1 = 0;
    let spinPhase2 = 1.7;
    let lastCycleT = 4.0;
    star1.orbitalRoot.position.set(2.75, 0, 0);
    star2.orbitalRoot.position.set(-2.75, 0, 0);
    star1.orbitalRoot.rotation.y = Math.PI;
    kilonovaCloud.visible = false;
    kilonovaForeLayer.visible = false;

    /* =========================================================================
     * 7. ULTRA-OPTIMIZED GENERAL-RELATIVISTIC BLACK HOLE (Sector 5: [24, -12, -510])
     *    Identical Novikov-Thorne Doppler-beamed accretion disk, Schwarzschild shadow,
     *    photon ring & lensed secondary arches — ~20x faster via seamless periodic
     *    turbulence texture lookup, analytic impact-parameter culling & receding-ray exit.
     * ========================================================================= */
    const bhSteps = isSoftwareGl ? 36 : 54;
    const bhGeo = new THREE.PlaneGeometry(98, 98);
    const bhMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      uniforms: {
        uNoiseTex: { value: seamlessNoiseTex },
        uTime: { value: 0 },
        uBhPos: { value: POS_BLACKHOLE.clone() },
        uOpacity: { value: 1 },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vWorldPos;
        varying vec2 vUv;
        uniform sampler2D uNoiseTex;
        uniform float uTime;
        uniform vec3 uBhPos;
        uniform float uOpacity;

        vec3 blackbodyColor(float temp, float dopplerShift) {
          float T = clamp(temp * dopplerShift, 0.0, 2.0);
          vec3 deepRed   = vec3(0.38, 0.05, 0.01);
          vec3 orange    = vec3(0.92, 0.36, 0.06);
          vec3 warmWhite = vec3(1.00, 0.85, 0.65);
          vec3 softBlue  = vec3(0.76, 0.88, 1.00);
          vec3 c = mix(deepRed, orange, smoothstep(0.02, 0.38, T));
          c = mix(c, warmWhite, smoothstep(0.35, 0.88, T));
          c = mix(c, softBlue, smoothstep(0.88, 1.75, T));
          return c;
        }

        vec4 sampleAccretionDisk(vec3 p, vec3 rayDir, float rs) {
          float r2Disk = dot(p.xz, p.xz);
          float rIsco = 2.65 * rs;
          float rOuter = 10.5 * rs;
          if (r2Disk < rIsco * rIsco * 0.846 || r2Disk > rOuter * rOuter) return vec4(0.0);

          float r = sqrt(r2Disk);
          float angle = atan(p.z, p.x);
          float omega = 2.8 / pow(max(r / rs, 1.2), 1.5);
          float swirlTurn = (angle - uTime * omega) * 0.15915494;
          float logR = log(r);

          // 2 mipmapped periodic texture lookups instead of 12 slow 6-octave procedural FBM loops!
          float turb1 = texture2D(uNoiseTex, vec2(swirlTurn * 2.0 + logR * 0.475, r * 0.106)).r;
          float turb2 = texture2D(uNoiseTex, vec2(swirlTurn * 6.0 + logR * 0.938, r * 0.30 - uTime * 0.031)).g;
          float rings = 0.72 + 0.28 * sin(r * 3.4 - turb1 * 4.0);
          float density = (0.32 + 0.68 * turb1) * (0.55 + 0.45 * turb2) * rings;

          float innerTap = smoothstep(rIsco * 0.92, rIsco * 1.18, r);
          float outerTap = 1.0 - smoothstep(rOuter * 0.52, rOuter, r);
          density *= innerTap * outerTap;

          float rsOverR = rs / r;
          float ntFactor = max(0.0001, (rsOverR * rsOverR * rsOverR) * max(0.0, 1.0 - sqrt(min(rIsco / r, 0.995))));
          float temp = pow(ntFactor * 26.0, 0.28);

          float beta = clamp(sqrt(0.5 * rs / max(r - 0.85 * rs, 0.35 * rs)), 0.0, 0.65);
          vec3 vHat = vec3(-p.z, 0.0, p.x) / max(r, 1e-4);
          float cosTheta = dot(vHat, -rayDir);
          float gamma = inversesqrt(max(1.0 - beta * beta, 0.08));
          float doppler = 1.0 / (gamma * (1.0 - beta * cosTheta));
          float gravRed = sqrt(clamp(1.0 - rsOverR, 0.05, 1.0));
          float totalShift = doppler * gravRed;

          float beaming = pow(clamp(totalShift, 0.25, 2.3), 3.4);

          vec3 col = blackbodyColor(temp, totalShift) * density * beaming * 1.45;
          float alpha = clamp(density * (0.55 + 0.45 * temp) * clamp(beaming * 0.5, 0.15, 1.15), 0.0, 0.95);
          return vec4(col, alpha);
        }

        void main() {
          vec2 centeredUv = (vUv - 0.5) * 2.0;
          float uvR2 = dot(centeredUv, centeredUv);
          if (uvR2 >= 1.0) discard;
          float quadMask = 1.0 - smoothstep(0.78, 1.0, sqrt(uvR2));
          if (quadMask <= 0.001) discard;

          const float rs = 2.35;
          vec3 roWorld = cameraPosition - uBhPos;
          vec3 rdWorld = normalize(vWorldPos - cameraPosition);

          // Precomputed inclination (0.19) & roll (-0.14) rotation matrix
          const float cx = 0.98200424;
          const float sx = 0.18885889;
          const float cz = 0.99021600;
          const float sz = -0.13954311;
          const mat3 toLocal = mat3(
            1.0, 0.0, 0.0,
            0.0, cx, -sx,
            0.0, sx, cx
          ) * mat3(
            cz, -sz, 0.0,
            sz, cz, 0.0,
            0.0, 0.0, 1.0
          );

          vec3 pos = toLocal * roWorld;
          vec3 vel = normalize(toLocal * rdWorld);

          const float Rbound = 30.0;
          float bProj = dot(pos, vel);
          float cBound = dot(pos, pos) - Rbound * Rbound;
          float disc = bProj * bProj - cBound;
          if (disc <= 0.0) discard;

          float tEnter = max(0.0, -bProj - sqrt(disc));
          pos += vel * tEnter;

          vec3 angMom = cross(pos, vel);
          float h2 = dot(angMom, angMom);

          // Analytic impact-parameter cull: rays outside b > 27.0 cannot hit disk (rOuter = 24.675) or photon ring
          if (cBound > 0.0 && h2 > 730.0) discard;

          vec3 accumCol = vec3(0.0);
          float transmittance = 1.0;
          bool captured = false;
          float minR = 1000.0;
          float gravCoeff = -1.5 * rs * h2;

          for (int i = 0; i < ${bhSteps}; i++) {
            float r2 = dot(pos, pos);
            float invR = inversesqrt(max(r2, 1e-4));
            float r = r2 * invR;
            minR = min(minR, r);

            if (r <= rs * 1.015) {
              captured = true;
              break;
            }
            // Early exit once ray is outside disk radius, receding radially, and moving away from y = 0 plane
            if (i > 3 && (r > 31.8 || (r > 25.4 && dot(pos, vel) > 0.0 && pos.y * vel.y >= 0.0))) {
              break;
            }

            float dt = clamp((r - rs * 0.85) * 0.21, 0.06, 1.45);
            float invR5 = (invR * invR) * (invR * invR) * invR;
            vec3 accel = gravCoeff * pos * invR5;

            vec3 nextVel = normalize(vel + accel * dt);
            vec3 nextPos = pos + 0.5 * (vel + nextVel) * dt;

            if (pos.y * nextPos.y <= 0.0) {
              float frac = abs(pos.y) / (abs(pos.y) + abs(nextPos.y) + 1e-6);
              vec3 hitPos = mix(pos, nextPos, frac);
              vec4 diskSample = sampleAccretionDisk(hitPos, nextVel, rs);
              accumCol += transmittance * diskSample.rgb;
              transmittance *= (1.0 - diskSample.a);
              if (transmittance < 0.02) break;
            }

            pos = nextPos;
            vel = nextVel;
          }

          float photonRingProx = exp(-pow((minR - 1.5 * rs) / (0.14 * rs), 2.0));
          if (!captured) {
            accumCol += transmittance * vec3(1.0, 0.84, 0.64) * photonRingProx * 0.48;
          } else {
            accumCol += transmittance * vec3(1.0, 0.80, 0.55) * photonRingProx * 0.25;
          }

          float shadowAlpha = captured ? 1.0 : clamp(1.0 - transmittance + photonRingProx * 0.35, 0.0, 1.0);
          float finalAlpha = shadowAlpha * quadMask * uOpacity;

          if (finalAlpha < 0.002 && dot(accumCol, accumCol) < 0.000004) discard;
          gl_FragColor = vec4(accumCol * quadMask * uOpacity, finalAlpha);
        }
      `,
    });
    const bhBillboard = new THREE.Mesh(bhGeo, bhMat);
    bhBillboard.position.copy(POS_BLACKHOLE);
    bhBillboard.renderOrder = 5;
    scene.add(bhBillboard);
    disposables.push(bhGeo, bhMat);

    /* =========================================================================
     * 8. EXTENDED CONTINUOUSLY-CURVING WORMHOLE CORRIDOR (~720 units of 3D arc)
     * ========================================================================= */
    const bendStarCount = isSmall ? 5500 : 11500;
    const bendGeo = new THREE.BufferGeometry();
    {
      const r = seeded(314);
      const posArr = new Float32Array(bendStarCount * 3);
      const tanArr = new Float32Array(bendStarCount * 3);
      const colArr = new Float32Array(bendStarCount * 3);
      const sizeArr = new Float32Array(bendStarCount);

      const frameCount = 280;
      const frames = wormholeCurve.computeFrenetFrames(frameCount, false);
      const cA = new THREE.Color("#9db8dc");
      const cB = new THREE.Color("#d8c8b4");
      const cC = new THREE.Color("#7f9ec4");
      const tmpP = new THREE.Vector3();

      for (let i = 0; i < bendStarCount; i++) {
        const u = 0.02 + r() * 0.80;
        wormholeCurve.getPointAt(u, tmpP);
        const idx = Math.min(Math.floor(u * frameCount), frameCount);
        const N = frames.normals[idx];
        const B = frames.binormals[idx];
        const T = frames.tangents[idx];

        const entryFlare = Math.pow(Math.max(0, 0.16 - u) / 0.16, 2.0) * 18.0;
        const exitFlare = Math.pow(Math.max(0, u - 0.68) / 0.14, 2.0) * 20.0;
        const throatRadius = 7.2 + Math.sin(u * Math.PI * 5.0) * 1.4 + entryFlare + exitFlare + Math.pow(r(), 1.35) * 15.0;
        const theta = r() * Math.PI * 2;

        const twist = u * 14.5;
        const ca = Math.cos(theta + twist);
        const sa = Math.sin(theta + twist);

        posArr[i * 3] = tmpP.x + (N.x * ca + B.x * sa) * throatRadius;
        posArr[i * 3 + 1] = tmpP.y + (N.y * ca + B.y * sa) * throatRadius;
        posArr[i * 3 + 2] = tmpP.z + (N.z * ca + B.z * sa) * throatRadius;

        tanArr[i * 3] = T.x;
        tanArr[i * 3 + 1] = T.y;
        tanArr[i * 3 + 2] = T.z;

        const col = r() < 0.35 ? cA : r() < 0.7 ? cB : cC;
        const dim = 0.44 + 0.46 * r();
        colArr.set([col.r * dim, col.g * dim, col.b * dim], i * 3);
        sizeArr[i] = Math.pow(r(), 5) * 2.3 + 0.34;
      }

      bendGeo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
      bendGeo.setAttribute("aTangent", new THREE.BufferAttribute(tanArr, 3));
      bendGeo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
      bendGeo.setAttribute("size", new THREE.BufferAttribute(sizeArr, 1));
    }

    const bendMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uPR: { value: pr },
        uTime: { value: 0 },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        attribute vec3 aTangent;
        varying vec3 vColor;
        varying vec2 vStretchDir;
        uniform float uPR;
        uniform float uTime;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 viewTan = normalize((viewMatrix * vec4(aTangent, 0.0)).xyz);
          vStretchDir = viewTan.xy;
          gl_PointSize = size * uPR * (135.0 / max(-mv.z, 1.2));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying vec2 vStretchDir;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          vec2 dir = length(vStretchDir) > 0.01 ? normalize(vStretchDir) : vec2(0.0, 1.0);
          vec2 perp = vec2(-dir.y, dir.x);
          float along = dot(uv, dir) * 0.62;
          float across = dot(uv, perp) * 1.48;
          float d = sqrt(along * along + across * across);
          float a = pow(smoothstep(0.48, 0.0, d), 2.0);
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a * 0.85);
        }
      `,
    });
    disposables.push(bendGeo, bendMat);
    const bendStars = new THREE.Points(bendGeo, bendMat);
    bendStars.frustumCulled = false;
    scene.add(bendStars);

    /* =========================================================================
     * 9. GRAVITATIONAL LENSING THROAT APERTURE AT THE END OF THE WORMHOLE
     * ========================================================================= */
    const whGeo = new THREE.PlaneGeometry(56, 56);
    const whMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uNoiseTex: { value: seamlessNoiseTex },
        uTime: { value: 0 },
        uFade: { value: 1 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uNoiseTex;
        uniform float uTime;
        uniform float uFade;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

        vec3 otherUniverseSky(vec2 dir, float t) {
          vec2 p = dir * 0.28 + 0.5;
          vec4 q = texture2D(uNoiseTex, p + vec2(t * 0.002, -t * 0.0015));
          float dust = texture2D(uNoiseTex, p * 1.8 + (q.rg - 0.5) * 0.22).r;
          float wisp = q.b;

          vec3 voidBg   = vec3(0.012, 0.018, 0.032);
          vec3 slateNeb = vec3(0.055, 0.115, 0.185);
          vec3 warmDust = vec3(0.18, 0.13, 0.09);

          vec3 col = mix(voidBg, slateNeb, smoothstep(0.35, 0.82, dust));
          col += warmDust * smoothstep(0.45, 0.92, wisp) * 0.38;

          // Subtle lensed preview of the two colliding galactic cores waiting beyond the throat
          float coreA = exp(-dot(dir - vec2(-0.14, 0.04), dir - vec2(-0.14, 0.04)) * 28.0);
          float coreB = exp(-dot(dir - vec2(0.12, -0.05), dir - vec2(0.12, -0.05)) * 34.0);
          col += vec3(1.0, 0.86, 0.68) * coreA * 0.45 + vec3(0.78, 0.90, 1.0) * coreB * 0.38;

          vec2 grid = dir * 46.0;
          vec2 cell = floor(grid);
          vec2 f = fract(grid) - 0.5;
          float rnd = hash(cell);
          if (rnd > 0.952) {
            vec2 jit = vec2(hash(cell + 11.3), hash(cell + 27.9)) - 0.5;
            float d = length(f - jit * 0.65);
            float b = smoothstep(0.14, 0.0, d) * ((rnd - 0.952) / 0.048);
            vec3 sCol = mix(vec3(0.88, 0.92, 1.0), vec3(1.0, 0.88, 0.72), hash(cell + 5.4));
            col += sCol * b * 1.35;
          }
          return col;
        }

        void main() {
          if (uFade <= 0.002) discard;

          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          if (r >= 1.0) discard;

          float b0 = 0.42;
          float ratio = r / b0;
          float angle = atan(p.y, p.x);

          if (ratio < 1.0) {
            float chi = clamp(ratio, 0.0, 0.998);
            float bend = -0.45 * log(max(1.0 - chi * chi, 0.008));
            float bentAngle = angle + bend * 0.38;
            float radialMap = asin(chi) / 1.5707963;
            vec2 dir = vec2(cos(bentAngle), sin(bentAngle)) * radialMap;

            vec3 sky = otherUniverseSky(dir, uTime);
            float lipWarp = exp(-pow((1.0 - ratio) / 0.06, 2.0)) * 0.09;
            sky += vec3(0.45, 0.58, 0.75) * lipWarp;

            gl_FragColor = vec4(sky, 0.96 * uFade);
          } else {
            float exteriorWarp = exp(-(ratio - 1.0) * 5.5);
            float arcNoise = texture2D(uNoiseTex, vec2(angle * 0.15915494 * 3.0, log(max(ratio, 1.001)) * 1.4)).r;
            float lensedStarArc = smoothstep(0.62, 0.84, arcNoise) * exteriorWarp * 0.22;

            vec3 col = vec3(0.55, 0.68, 0.85) * lensedStarArc;
            float edgeFade = (1.0 - smoothstep(b0, 0.95, r)) * exteriorWarp * 0.75;
            float a = clamp(edgeFade, 0.0, 0.85) * uFade;
            if (a < 0.003) discard;
            gl_FragColor = vec4(col, a);
          }
        }
      `,
    });
    const whMouth = new THREE.Mesh(whGeo, whMat);
    whMouth.position.copy(throatMouthPos);
    whMouth.renderOrder = 6;
    scene.add(whMouth);
    disposables.push(whGeo, whMat);

    /* =========================================================================
     * 10. THE SECOND UNIVERSE & REAL-PHYSICS N-BODY GALAXY COLLISION
     *     (Toomre & Toomre Gravitational Tidal Dynamics + Chandrasekhar Halo Friction
     *      + Collisional Gas Ram-Pressure Starburst Shocks + Volumetric Dark Dust Lanes)
     *
     *     Real-time astrophysical simulation running smoothly when in the Second Universe:
     *       1) Two inclined prograde spiral galaxies (Plummer bulge + flat-rotation-curve
     *          dark-matter halo) orbit under exact momentum-conserving gravity + halo drag:
     *          First Pericenter Slash -> Sweeping 50-unit Toomre Tidal Tails & Bridge ->
     *          Fallback & Second Plunge -> Core Coalescence & Violent Relaxation!
     *       2) Volumetric Galactic Disks (NormalBlending): Sérsic R^(1/4) golden bulges,
     *          unresolved spiral starlight, and dark chocolate-umber molecular dust lanes
     *          that genuinely silhouette across the background galaxy.
     *       3) Collisionless Stars vs. Collisional Gas: Gas clouds suffer ram-pressure drag
     *          and shock-heat into luminous Hubble H-alpha pink & OB-blue starburst knots
     *          along the active collision bridge.
     * ========================================================================= */
    const otherUniverseGroup = new THREE.Group();
    scene.add(otherUniverseGroup);

    const otherStarCount = isSmall ? 5500 : 12000;
    const otherStarGeo = new THREE.BufferGeometry();
    {
      const r = seeded(777);
      const p = new Float32Array(otherStarCount * 3);
      const c = new Float32Array(otherStarCount * 3);
      const s = new Float32Array(otherStarCount);
      const tealTint = new THREE.Color("#b8e2f4");
      const goldTint = new THREE.Color("#f5dec0");
      const crispWhite = new THREE.Color("#eef4ff");

      for (let i = 0; i < otherStarCount; i++) {
        const rad = 28 + Math.pow(r(), 0.65) * 240;
        const th = r() * Math.PI * 2;
        p[i * 3] = -110 + Math.cos(th) * rad;
        p[i * 3 + 1] = 104 + Math.sin(th) * rad;
        p[i * 3 + 2] = -1035 - r() * 360;
        const col = r() < 0.28 ? tealTint : r() < 0.52 ? goldTint : crispWhite;
        c.set([col.r, col.g, col.b], i * 3);
        s[i] = Math.pow(r(), 6.5) * 3.5 + 0.35;
      }
      otherStarGeo.setAttribute("position", new THREE.BufferAttribute(p, 3));
      otherStarGeo.setAttribute("color", new THREE.BufferAttribute(c, 3));
      otherStarGeo.setAttribute("size", new THREE.BufferAttribute(s, 1));
    }
    const otherStars = new THREE.Points(otherStarGeo, starMat);
    otherStars.frustumCulled = false;
    otherUniverseGroup.add(otherStars);
    disposables.push(otherStarGeo);

    buildDistantNebula([-182, 128, -1350], "#163854", "#3b7a8c", 86, 12.4, 0.5, 0.24, 0.86, 1.01);

    const mergingGalaxiesGroup = new THREE.Group();
    mergingGalaxiesGroup.position.copy(POS_MERGING_GALAXIES);
    otherUniverseGroup.add(mergingGalaxiesGroup);

    // Physical potential constants (consistent bulge + dark-matter halo rotation curves)
    const mGalA = 1.0;
    const mGalB = 0.76;
    const mGalTot = mGalA + mGalB;
    const muBulgeA = 44.0, bA2 = 4.41;   // b_A = 2.1
    const muHaloA = 140.0, hA2 = 72.25;  // h_A = 8.5
    const muBulgeB = 33.44, bB2 = 3.61;  // b_B = 1.9
    const muHaloB = 106.4, hB2 = 57.76;  // h_B = 7.6

    // Inclined prograde 3D disk orientations (aligned with binary orbit L_z < 0 to produce grand Toomre tails)
    const eulerGalA = new THREE.Euler(0.36, 0.24, -0.18);
    const eulerGalB = new THREE.Euler(-0.48, -0.32, 0.34);
    const mat3GalA = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(eulerGalA));
    const mat3GalB = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(eulerGalB));
    const eA = mat3GalA.elements; // column-major: col0=(e0,e1,e2), col1=(e3,e4,e5), col2=(e6,e7,e8)
    const eB = mat3GalB.elements;

    // Volumetric Galactic Disk + Sérsic Bulge + Dark Obscuring Dust Lane Shader
    function createGalacticDiskMesh(
      planeSize: number,
      diskRadius: number,
      euler: THREE.Euler,
      coreHex: string,
      armHex: string,
      seedShift: number
    ) {
      const geo = new THREE.PlaneGeometry(planeSize, planeSize);
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uNoiseTex: { value: seamlessNoiseTex },
          uDiskRadius: { value: diskRadius },
          uPatternPhase: { value: 0 },
          uCompanionDir: { value: new THREE.Vector2(1, 0) },
          uTidalStrain: { value: 0.25 },
          uCoherence: { value: 1.0 },
          uFade: { value: 1.0 },
          uSeed: { value: seedShift },
          uCoreCol: { value: new THREE.Color(coreHex) },
          uArmCol: { value: new THREE.Color(armHex) },
        },
        vertexShader: `
          varying vec2 vDiskPos;
          void main() {
            vDiskPos = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          varying vec2 vDiskPos;
          uniform sampler2D uNoiseTex;
          uniform float uDiskRadius;
          uniform float uPatternPhase;
          uniform vec2 uCompanionDir;
          uniform float uTidalStrain;
          uniform float uCoherence;
          uniform float uFade;
          uniform float uSeed;
          uniform vec3 uCoreCol;
          uniform vec3 uArmCol;

          void main() {
            if (uFade <= 0.002) discard;

            float maxR = uDiskRadius * 1.28;
            float rawR = length(vDiskPos);
            if (rawR >= maxR) discard;

            // Quadrupole (m=2) tidal stretching along companion axis
            vec2 tAxis = uCompanionDir;
            float along = dot(vDiskPos, tAxis);
            vec2 perpVec = vDiskPos - tAxis * along;
            float stretch = 1.0 + uTidalStrain * smoothstep(0.15, 1.0, rawR / uDiskRadius) * 0.42;
            vec2 p = tAxis * (along / stretch) + perpVec * (1.0 + (stretch - 1.0) * 0.28);

            float r = length(p);
            float rNorm = r / uDiskRadius;
            if (rNorm >= 1.15) discard;

            float theta = atan(p.y, p.x) - uPatternPhase;

            // Seamless turbulence lookup in polar/Cartesian disk space
            vec2 uvTurb = p / (uDiskRadius * 1.65) + 0.5 + uSeed;
            vec4 nt = texture2D(uNoiseTex, uvTurb);
            vec4 ntFine = texture2D(uNoiseTex, uvTurb * 2.7 + (nt.rg - 0.5) * 0.18);

            // 1) Sérsic R^(1/4)-style warm galactic bulge + exponential stellar disk
            float bulge = exp(-3.55 * pow(max(rNorm, 0.002), 0.44));
            float expDisk = exp(-rNorm * 2.55) * (1.0 - smoothstep(0.82, 1.12, rNorm));

            // 2) Trailing 2-arm logarithmic spiral density wave + feathered secondary spurs
            float logSpiral = 2.0 * (theta - 2.35 * log(1.0 + r / 2.2));
            float armWave = pow(0.5 + 0.5 * cos(logSpiral + (nt.r - 0.5) * 0.85), 2.3);
            float spurWave = pow(0.5 + 0.5 * cos(4.0 * theta - 4.8 * log(1.0 + r / 2.0) + ntFine.g * 2.2), 3.5) * 0.35;
            float spiralProfile = (armWave + spurWave) * smoothstep(0.06, 0.26, rNorm) * exp(-rNorm * 1.65) * uCoherence;

            // Turbulent post-merger starlight envelope as disks violently relax into a remnant
            float relaxedHalo = (1.0 - uCoherence) * exp(-rNorm * 2.1) * (0.65 + 0.55 * nt.r);

            // 3) Roberts inner-edge obscuring molecular dust lanes (NormalBlending optical extinction!)
            float dustSpiral = pow(0.5 + 0.5 * cos(logSpiral + 0.62 + (nt.g - 0.5) * 0.9), 3.4);
            float dustWeb = smoothstep(0.42, 0.86, ntFine.b) * smoothstep(0.32, 0.78, nt.r);
            float dustOpticalDepth = (dustSpiral * uCoherence * 0.85 + dustWeb * 0.65)
                                     * smoothstep(0.04, 0.22, rNorm)
                                     * (1.0 - smoothstep(0.68, 1.02, rNorm));

            // 4) Shock-compressed H-alpha starburst complexes along the dust/tidal front
            float towardCompanion = 0.5 + 0.5 * dot(p / max(r, 1e-3), tAxis);
            float h2Knots = pow(armWave, 3.0) * smoothstep(0.56, 0.86, ntFine.r)
                            * smoothstep(0.10, 0.30, rNorm) * exp(-rNorm * 1.5)
                            * (0.55 + 0.95 * uTidalStrain * towardCompanion);

            vec3 starlight = uCoreCol * (bulge * 1.55 + expDisk * 0.32 + relaxedHalo * 0.48)
                           + uArmCol * (spiralProfile * 0.78 + expDisk * 0.22)
                           + vec3(1.0, 0.32, 0.56) * h2Knots * 1.15;

            // Apply realistic dust extinction & warm reddening across the disk and bulge
            vec3 darkDustCol = vec3(0.032, 0.016, 0.020);
            float dustExtinct = clamp(dustOpticalDepth * 0.82, 0.0, 0.80);
            vec3 finalCol = mix(starlight, darkDustCol, dustExtinct * 0.82);

            float lumAlpha = clamp(bulge * 0.82 + spiralProfile * 0.46 + expDisk * 0.24 + relaxedHalo * 0.35 + h2Knots * 0.45, 0.0, 0.88);
            float totalAlpha = clamp(max(lumAlpha, dustExtinct * 0.72), 0.0, 0.90);
            float rimFade = 1.0 - smoothstep(0.86, 1.14, rNorm);
            totalAlpha *= rimFade * uFade;

            if (totalAlpha <= 0.002) discard;
            gl_FragColor = vec4(finalCol * rimFade, totalAlpha);
          }
        `,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.copy(euler);
      mesh.renderOrder = 2;
      disposables.push(geo, mat);
      return { mesh, mat };
    }

    const galADisk = createGalacticDiskMesh(46, 18.0, eulerGalA, "#ffe3b8", "#8eb8ff", 0.11);
    const galBDisk = createGalacticDiskMesh(38, 14.8, eulerGalB, "#ffd4ab", "#7ad0f0", 0.47);
    mergingGalaxiesGroup.add(galADisk.mesh);
    mergingGalaxiesGroup.add(galBDisk.mesh);

    // Live N-Body Tracer Arrays (Collisionless Stars + Collisional Shock-Heated Gas Parcels)
    const nBodyCount = isSmall ? 5800 : 11800;
    const countGalA = Math.floor(nBodyCount * 0.56);
    const nbPos = new Float32Array(nBodyCount * 3);
    const nbVel = new Float32Array(nBodyCount * 3);
    const nbCol = new Float32Array(nBodyCount * 3);
    const nbSize = new Float32Array(nBodyCount);
    const nbShock = new Float32Array(nBodyCount);
    // 0 = old bulge/disk star, 1 = blue spiral star, 2 = gas cloud in Gal A, 3 = gas cloud in Gal B
    const nbKind = new Uint8Array(nBodyCount);

    let relX = 0, relY = 0, relZ = 0;
    let relVx = 0, relVy = 0, relVz = 0;
    let coreAx = 0, coreAy = 0, coreAz = 0, coreAvx = 0, coreAvy = 0, coreAvz = 0;
    let coreBx = 0, coreBy = 0, coreBz = 0, coreBvx = 0, coreBvy = 0, coreBvz = 0;
    let galSimTime = 0;
    let galCycleElapsed = 0;
    let galHasLooped = false;
    const GAL_COLLISION_CYCLE = 112.0; // ~2 minutes from first pericenter -> tidal tails -> fallback -> merger

    function syncCoresFromRelative() {
      const wA = -mGalB / mGalTot;
      const wB = mGalA / mGalTot;
      coreAx = relX * wA; coreAy = relY * wA; coreAz = relZ * wA;
      coreBx = relX * wB; coreBy = relY * wB; coreBz = relZ * wB;
      coreAvx = relVx * wA; coreAvy = relVy * wA; coreAvz = relVz * wA;
      coreBvx = relVx * wB; coreBvy = relVy * wB; coreBvz = relVz * wB;
    }

    function populateEquilibriumGalaxyCollision() {
      const r = seeded(2026);
      // Initial prograde inclined approach before pre-warming right to First Pericenter Slash
      relX = 33.0; relY = -11.5; relZ = 5.5;
      relVx = -2.02; relVy = -0.58; relVz = -0.22;
      syncCoresFromRelative();
      galSimTime = 0;

      const cBulgeA = new THREE.Color("#ffe5be");
      const cArmA = new THREE.Color("#9cc4ff");
      const cBulgeB = new THREE.Color("#ffd5ad");
      const cArmB = new THREE.Color("#7fd2f2");
      const cGasBase = new THREE.Color("#9bc8f5");
      const cH2Init = new THREE.Color("#ff709e");
      const tmpC = new THREE.Color();

      for (let i = 0; i < nBodyCount; i++) {
        const isA = i < countGalA;
        const maxR = isA ? 18.0 : 14.8;
        const muB = isA ? muBulgeA : muBulgeB;
        const b2 = isA ? bA2 : bB2;
        const muH = isA ? muHaloA : muHaloB;
        const h2 = isA ? hA2 : hB2;
        const el = isA ? eA : eB;
        const cx = isA ? coreAx : coreBx;
        const cy = isA ? coreAy : coreBy;
        const cz = isA ? coreAz : coreBz;
        const cvx = isA ? coreAvx : coreBvx;
        const cvy = isA ? coreAvy : coreBvy;
        const cvz = isA ? coreAvz : coreBvz;

        const pick = r();
        let rad: number;
        let theta: number;
        let zd: number;

        if (pick < 0.28) {
          // Old Sérsic bulge & warm inner disk stars
          rad = 0.25 + Math.pow(r(), 1.85) * (maxR * 0.72);
          theta = r() * Math.PI * 2.0;
          zd = (r() - 0.5) * (0.85 * Math.exp(-rad / 5.5) + 0.22);
          nbKind[i] = 0;
          tmpC.copy(isA ? cBulgeA : cBulgeB);
          const lum = 0.75 + r() * 0.35;
          nbCol.set([tmpC.r * lum, tmpC.g * lum, tmpC.b * lum], i * 3);
          nbSize[i] = 0.72 + Math.pow(r(), 4.5) * 1.55;
        } else if (pick < 0.76) {
          // Trailing 2-arm logarithmic spiral disk stars
          rad = 1.1 + Math.pow(r(), 0.92) * (maxR * 0.98);
          const arm = (i & 1) * Math.PI;
          const gauss = (r() + r() + r() - 1.5) * (0.26 + 0.016 * rad);
          theta = arm + 2.35 * Math.log(1.0 + rad / 2.2) + gauss;
          zd = (r() - 0.5) * 0.36;
          nbKind[i] = 1;
          tmpC.copy(isA ? cBulgeA : cBulgeB).lerp(isA ? cArmA : cArmB, Math.min(rad / (maxR * 0.58), 1.0));
          const lum = 0.76 + r() * 0.36;
          nbCol.set([tmpC.r * lum, tmpC.g * lum, tmpC.b * lum], i * 3);
          nbSize[i] = 0.65 + Math.pow(r(), 5.0) * 1.75;
        } else {
          // Cold molecular gas & star-forming H-II complexes tightly hugging spiral shock fronts
          rad = 1.6 + Math.pow(r(), 0.88) * (maxR * 0.92);
          const arm = (i & 1) * Math.PI;
          const tightSpread = (r() + r() - 1.0) * 0.17;
          theta = arm + 2.35 * Math.log(1.0 + rad / 2.2) + tightSpread;
          zd = (r() - 0.5) * 0.20;
          nbKind[i] = isA ? 2 : 3;
          tmpC.copy(r() < 0.28 ? cH2Init : cGasBase);
          const lum = 0.78 + r() * 0.32;
          nbCol.set([tmpC.r * lum, tmpC.g * lum, tmpC.b * lum], i * 3);
          nbSize[i] = 1.05 + r() * 1.15;
        }

        const xd = Math.cos(theta) * rad;
        const yd = Math.sin(theta) * rad;

        // Exact centrifugal circular speed v_c(R) in the softened bulge + dark-matter halo potential
        const r2 = rad * rad;
        const gDisk =
          muB / ((r2 + b2) * Math.sqrt(r2 + b2)) +
          muH / ((r2 + h2) * Math.sqrt(r2 + h2));
        const vc = rad * Math.sqrt(gDisk);

        // Prograde clockwise tangent velocity (+sin(theta), -cos(theta), 0) + small Toomre dispersion
        const disp = nbKind[i] >= 2 ? 0.025 * vc : 0.055 * vc;
        const vdx = (yd / rad) * vc + (r() - 0.5) * disp;
        const vdy = (-xd / rad) * vc + (r() - 0.5) * disp;
        const vdz = (r() - 0.5) * disp * 0.5;

        // Transform disk (xd, yd, zd) & (vdx, vdy, vdz) to 3D group space via column-major Matrix3
        nbPos[i * 3]     = cx + el[0] * xd + el[3] * yd + el[6] * zd;
        nbPos[i * 3 + 1] = cy + el[1] * xd + el[4] * yd + el[7] * zd;
        nbPos[i * 3 + 2] = cz + el[2] * xd + el[5] * yd + el[8] * zd;

        nbVel[i * 3]     = cvx + el[0] * vdx + el[3] * vdy + el[6] * vdz;
        nbVel[i * 3 + 1] = cvy + el[1] * vdx + el[4] * vdy + el[7] * vdz;
        nbVel[i * 3 + 2] = cvz + el[2] * vdx + el[5] * vdy + el[8] * vdz;

        nbShock[i] = 0.0;
      }
    }

    function stepGalaxyCollision(dtSim: number) {
      // 1) Advance mutual 2-body galaxy core orbit with Chandrasekhar dark-matter halo dynamical friction
      const r2AB = relX * relX + relY * relY + relZ * relZ;
      const gMut =
        (muBulgeA + muBulgeB) / ((r2AB + 5.8) * Math.sqrt(r2AB + 5.8)) +
        (muHaloA + muHaloB) / ((r2AB + 65.0) * Math.sqrt(r2AB + 65.0));
      const dfTerm = 1.0 + r2AB / 195.0;
      const dfDrag = 0.145 / (dfTerm * dfTerm);

      relVx += (-gMut * relX - dfDrag * relVx) * dtSim;
      relVy += (-gMut * relY - dfDrag * relVy) * dtSim;
      relVz += (-gMut * relZ - dfDrag * relVz) * dtSim;
      relX += relVx * dtSim;
      relY += relVy * dtSim;
      relZ += relVz * dtSim;
      syncCoresFromRelative();
      galSimTime += dtSim;

      // 2) Symplectic Leapfrog step on all stars + collisional gas ram-pressure shock heating
      for (let i = 0; i < nBodyCount; i++) {
        const i3 = i * 3;
        const px = nbPos[i3];
        const py = nbPos[i3 + 1];
        const pz = nbPos[i3 + 2];

        const dxA = px - coreAx, dyA = py - coreAy, dzA = pz - coreAz;
        const r2A = dxA * dxA + dyA * dyA + dzA * dzA;
        const fA =
          muBulgeA / ((r2A + bA2) * Math.sqrt(r2A + bA2)) +
          muHaloA / ((r2A + hA2) * Math.sqrt(r2A + hA2));

        const dxB = px - coreBx, dyB = py - coreBy, dzB = pz - coreBz;
        const r2B = dxB * dxB + dyB * dyB + dzB * dzB;
        const fB =
          muBulgeB / ((r2B + bB2) * Math.sqrt(r2B + bB2)) +
          muHaloB / ((r2B + hB2) * Math.sqrt(r2B + hB2));

        let vx = nbVel[i3] - (dxA * fA + dxB * fB) * dtSim;
        let vy = nbVel[i3 + 1] - (dyA * fA + dyB * fB) * dtSim;
        let vz = nbVel[i3 + 2] - (dzA * fA + dzB * fB) * dtSim;

        // Hydrodynamical ram-pressure shock when gas clouds collide with the companion galaxy's gas disk!
        const kind = nbKind[i];
        if (kind === 2 && r2B < 190.0) {
          const drag = (0.34 * dtSim) / (1.0 + r2B * 0.045);
          vx += (coreBvx - vx) * drag;
          vy += (coreBvy - vy) * drag;
          vz += (coreBvz - vz) * drag;
          const s = nbShock[i] + drag * 3.4;
          nbShock[i] = s > 1.0 ? 1.0 : s;
        } else if (kind === 3 && r2A < 240.0) {
          const drag = (0.34 * dtSim) / (1.0 + r2A * 0.036);
          vx += (coreAvx - vx) * drag;
          vy += (coreAvy - vy) * drag;
          vz += (coreAvz - vz) * drag;
          const s = nbShock[i] + drag * 3.4;
          nbShock[i] = s > 1.0 ? 1.0 : s;
        }

        nbVel[i3] = vx;
        nbVel[i3 + 1] = vy;
        nbVel[i3 + 2] = vz;

        nbPos[i3] = px + vx * dtSim;
        nbPos[i3 + 1] = py + vy * dtSim;
        nbPos[i3 + 2] = pz + vz * dtSim;
      }
    }

    // Initialize & pre-warm 76 steps (~5ms once on mount) so the galaxies are ALREADY actively colliding
    // right at First Pericenter Slash with nascent tidal tails & starburst bridge when the user arrives!
    populateEquilibriumGalaxyCollision();
    for (let s = 0; s < 76; s++) {
      stepGalaxyCollision(0.11);
    }

    // Save zero-cost memcpy snapshot of the active pericenter encounter for seamless loop resets
    const snapNbPos = new Float32Array(nbPos);
    const snapNbVel = new Float32Array(nbVel);
    const snapNbShock = new Float32Array(nbShock);
    const snapState = { relX, relY, relZ, relVx, relVy, relVz, galSimTime };

    function restoreGalaxySnapshot() {
      nbPos.set(snapNbPos);
      nbVel.set(snapNbVel);
      nbShock.set(snapNbShock);
      relX = snapState.relX; relY = snapState.relY; relZ = snapState.relZ;
      relVx = snapState.relVx; relVy = snapState.relVy; relVz = snapState.relVz;
      galSimTime = snapState.galSimTime;
      syncCoresFromRelative();
    }

    const mergeGalGeo = new THREE.BufferGeometry();
    const nbPosAttr = new THREE.BufferAttribute(nbPos, 3);
    nbPosAttr.setUsage(THREE.DynamicDrawUsage);
    const nbShockAttr = new THREE.BufferAttribute(nbShock, 1);
    nbShockAttr.setUsage(THREE.DynamicDrawUsage);
    mergeGalGeo.setAttribute("position", nbPosAttr);
    mergeGalGeo.setAttribute("color", new THREE.BufferAttribute(nbCol, 3));
    mergeGalGeo.setAttribute("aSize", new THREE.BufferAttribute(nbSize, 1));
    mergeGalGeo.setAttribute("aShock", nbShockAttr);

    const mergingGalaxiesMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPR: { value: pr },
        uFade: { value: 1.0 },
      },
      vertexShader: `
        attribute vec3 color;
        attribute float aSize;
        attribute float aShock;
        uniform float uPR;
        uniform float uFade;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          // Shock-compressed colliding gas clouds ignite into Hubble H-alpha pink & OB blue-white starbursts!
          vec3 starburstPink = vec3(1.0, 0.34, 0.62);
          vec3 obClusterBlue = vec3(0.84, 0.93, 1.0);
          vec3 shockTint = mix(starburstPink, obClusterBlue, smoothstep(0.45, 0.95, aShock));
          vColor = mix(color, shockTint, aShock * 0.88) * (1.0 + aShock * 0.65);
          vAlpha = uFade;

          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float sz = aSize * (1.0 + aShock * 0.55);
          gl_PointSize = min(sz * uPR * (102.0 / max(-mv.z, 4.0)), 20.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision mediump float;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d2 = dot(p, p);
          if (d2 > 0.25) discard;
          float f = 1.0 - d2 * 4.0;
          float a = f * f * vAlpha;
          if (a <= 0.002) discard;
          gl_FragColor = vec4(vColor, a * 0.86);
        }
      `,
    });
    disposables.push(mergeGalGeo, mergingGalaxiesMat);
    const mergingGalaxiesPoints = new THREE.Points(mergeGalGeo, mergingGalaxiesMat);
    mergingGalaxiesPoints.frustumCulled = false;
    mergingGalaxiesPoints.renderOrder = 3;
    mergingGalaxiesGroup.add(mergingGalaxiesPoints);

    // Live Galactic Nuclei & Dynamic Collision Interface Starburst Halos
    const coreAHalo = makeGlowSprite("#ffe0b5", 14.5, 0.72);
    const coreANucleus = makeGlowSprite("#ffffff", 3.6, 0.95);
    const coreBHalo = makeGlowSprite("#ffd2ad", 12.0, 0.68);
    const coreBNucleus = makeGlowSprite("#ffffff", 3.1, 0.92);
    const shockBridgeGlow = makeGlowSprite("#ff5992", 16.0, 0.26);
    mergingGalaxiesGroup.add(coreAHalo, coreANucleus, coreBHalo, coreBNucleus, shockBridgeGlow);

    function syncGalaxyVisuals(cycleFade: number) {
      galADisk.mesh.position.set(coreAx, coreAy, coreAz);
      galBDisk.mesh.position.set(coreBx, coreBy, coreBz);
      coreAHalo.position.set(coreAx, coreAy, coreAz);
      coreANucleus.position.set(coreAx, coreAy, coreAz);
      coreBHalo.position.set(coreBx, coreBy, coreBz);
      coreBNucleus.position.set(coreBx, coreBy, coreBz);

      // Midpoint starburst glow intensifies when the two gas disks overlap!
      const sepAB = Math.hypot(relX, relY, relZ);
      shockBridgeGlow.position.set((coreAx + coreBx) * 0.5, (coreAy + coreBy) * 0.5, (coreAz + coreBz) * 0.5);
      const overlapIntensity = smoothstepJS(26.0, 7.0, sepAB);
      shockBridgeGlow.material.opacity = (0.10 + 0.28 * overlapIntensity) * cycleFade;
      shockBridgeGlow.scale.setScalar(13.0 + overlapIntensity * 8.0);

      coreAHalo.material.opacity = 0.72 * cycleFade;
      coreANucleus.material.opacity = 0.95 * cycleFade;
      coreBHalo.material.opacity = 0.68 * cycleFade;
      coreBNucleus.material.opacity = 0.92 * cycleFade;

      // Project companion vector into each disk's local XY plane (transpose of mat3GalA / mat3GalB)
      const compAx = eA[0] * relX + eA[1] * relY + eA[2] * relZ;
      const compAy = eA[3] * relX + eA[4] * relY + eA[5] * relZ;
      const lenA = Math.hypot(compAx, compAy) || 1.0;
      galADisk.mat.uniforms.uCompanionDir.value.set(compAx / lenA, compAy / lenA);

      const compBx = -(eB[0] * relX + eB[1] * relY + eB[2] * relZ);
      const compBy = -(eB[3] * relX + eB[4] * relY + eB[5] * relZ);
      const lenB = Math.hypot(compBx, compBy) || 1.0;
      galBDisk.mat.uniforms.uCompanionDir.value.set(compBx / lenB, compBy / lenB);

      const tidalStrain = smoothstepJS(32.0, 9.0, sepAB);
      // Violent relaxation gradually scrambles thin spiral pattern into post-merger spheroid at late coalescence
      const coherence = 1.0 - smoothstepJS(58.0, 98.0, galCycleElapsed) * 0.65;

      galADisk.mat.uniforms.uPatternPhase.value = galSimTime * 0.34;
      galADisk.mat.uniforms.uTidalStrain.value = tidalStrain;
      galADisk.mat.uniforms.uCoherence.value = coherence;
      galADisk.mat.uniforms.uFade.value = cycleFade;

      galBDisk.mat.uniforms.uPatternPhase.value = galSimTime * 0.40;
      galBDisk.mat.uniforms.uTidalStrain.value = tidalStrain;
      galBDisk.mat.uniforms.uCoherence.value = coherence;
      galBDisk.mat.uniforms.uFade.value = cycleFade;

      mergingGalaxiesMat.uniforms.uFade.value = cycleFade;
    }

    syncGalaxyVisuals(1.0);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    /* ---------- Pointer & Resize ---------- */
    const pointer = { x: 0, y: 0 };
    const onPointerMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    const whFrames = wormholeCurve.computeFrenetFrames(240, false);
    const outerFrames = outerCurve.computeFrenetFrames(180, false);

    /* ---------- 3D Trajectory Evaluation ---------- */
    function evaluatePose(
      p: number,
      ptrX: number,
      ptrY: number,
      outPos: THREE.Vector3,
      outLook: THREE.Vector3
    ): { fov: number; camRoll: number } {
      let fov = 55;
      let camRoll = 0;

      if (p < 0.55) {
        const u = Math.min(p / 0.55, 1.0);
        outerCurve.getPointAt(u, _curvePt);

        outPos.set(
          _curvePt.x + ptrX * 1.8,
          _curvePt.y + ptrY * 1.15,
          _curvePt.z
        );

        const lookU = Math.min(u + 0.08, 1.0);
        outerCurve.getPointAt(lookU, outLook);

        // Sector gaze framing:
        //   - Saturn around u = 0.16
        //   - Red Nebula: we fly STRAIGHT THROUGH its interior around u = 0.30..0.46,
        //     then bank hard starboard out the back toward the opposite side of space (Spiral Galaxy at u = 0.62)
        //   - Binary Neutron-Star Merger around u = 0.82
        const wSaturn = Math.exp(-Math.pow((u - 0.16) / 0.085, 2));
        const wGalaxy = Math.exp(-Math.pow((u - 0.62) / 0.095, 2));
        const wMerger = Math.exp(-Math.pow((u - 0.82) / 0.085, 2));
        const wBhAlign = smoothstepJS(0.90, 1.0, u);

        if (wSaturn > 0.01) {
          _focusTarget.set(POS_SATURN[0] - 3.5, POS_SATURN[1] + 0.5, POS_SATURN[2]);
          outLook.lerp(_focusTarget, wSaturn * 0.52);
        }
        if (wGalaxy > 0.01) {
          _focusTarget.set(POS_GALAXY_1[0] - 8, POS_GALAXY_1[1] - 3, POS_GALAXY_1[2]);
          outLook.lerp(_focusTarget, wGalaxy * 0.55);
        }
        if (wMerger > 0.01) {
          _focusTarget.set(POS_MERGER[0] + 1.8, POS_MERGER[1] + 0.4, POS_MERGER[2]);
          outLook.lerp(_focusTarget, wMerger * 0.76);
        }
        if (wBhAlign > 0.001) {
          outLook.lerp(POS_BLACKHOLE, wBhAlign * 0.85);
        }

        outLook.x += ptrX * 1.4;
        outLook.y += ptrY * 0.9;

        // Slightly wider immersive FOV while threading through the interior of the Red Nebula!
        const insideRedNebula = Math.exp(-Math.pow((u - 0.38) / 0.09, 2));
        fov = 55 + insideRedNebula * 8;

        const fIdx = Math.min(Math.floor(u * 180), 180);
        camRoll = -outerFrames.tangents[fIdx].x * 0.24 * (1 - wBhAlign);
      } else if (p < 0.65) {
        const u = (p - 0.55) / 0.10;
        const ease = u * u * (2.1 - 1.1 * u);

        const startX = 18;
        const startY = -14;
        const startZ = -468;

        const spiralAmp = (1 - u) * 2.4;
        const ang = u * Math.PI * 2.4;

        const x =
          startX +
          (POS_BLACKHOLE.x - startX) * ease +
          Math.sin(ang) * spiralAmp +
          ptrX * (1 - u) * 0.6;
        const y =
          startY +
          (POS_BLACKHOLE.y - startY) * ease +
          Math.cos(ang) * spiralAmp * 0.55 +
          ptrY * (1 - u) * 0.4;
        const z = startZ + (POS_BLACKHOLE.z - startZ) * ease;

        outPos.set(x, y, z);
        outLook.set(POS_BLACKHOLE.x, POS_BLACKHOLE.y, POS_BLACKHOLE.z - u * 12);
        fov = 55 + smoothstepJS(0.2, 1.0, u) * 28;
        camRoll = u * 0.18;
      } else {
        const u = Math.min((p - 0.65) / 0.35, 1.0);
        wormholeCurve.getPointAt(u, _curvePt);
        wormholeCurve.getTangentAt(u, _curveTan);

        const ptrScale = 0.55 + 0.85 * smoothstepJS(0.75, 0.92, u);
        outPos.set(
          _curvePt.x + ptrX * ptrScale,
          _curvePt.y + ptrY * ptrScale * 0.7,
          _curvePt.z
        );

        const lookAheadU = Math.min(u + 0.065, 1.0);
        wormholeCurve.getPointAt(lookAheadU, outLook);
        if (u > 0.84) {
          const wEndGalaxies = smoothstepJS(0.84, 0.97, u);
          _focusTarget.set(
            POS_MERGING_GALAXIES.x - 7.5,
            POS_MERGING_GALAXIES.y - 1.5,
            POS_MERGING_GALAXIES.z
          );
          outLook.lerp(_focusTarget, wEndGalaxies * 0.84);
        }
        outLook.x += ptrX * 0.9;
        outLook.y += ptrY * 0.6;

        const inWormhole = 1 - smoothstepJS(0.74, 0.88, u);
        fov = 55 + 28 * (1 - smoothstepJS(0.0, 0.22, u)) + 12 * inWormhole;

        const fIdx = Math.min(Math.floor(u * 240), 240);
        const latTurn = whFrames.tangents[fIdx].x;
        const vertTurn = whFrames.tangents[fIdx].y;
        camRoll =
          0.18 * (1 - smoothstepJS(0.0, 0.18, u)) +
          (-latTurn * 0.42 + vertTurn * 0.16) * (0.35 + 0.65 * inWormhole);
      }

      return { fov, camRoll };
    }

    /* ---------- Animation Loop with Software-WebGL Pacing ---------- */
    const look = new THREE.Vector3(0, 0, -20);
    let currentFov = 55;
    let currentRoll = 0;
    let smoothedP = scrollProgress();
    let lastTime = performance.now();
    let elapsed = 0;
    let rafId = 0;
    let timeoutId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== "function") {
        timeoutId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          timeoutId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          timeoutId = window.setTimeout(cb, 80);
        }
      };
      timeoutId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      const rawP = scrollProgress();
      const pDamp = 1 - Math.exp(-5.0 * dt);
      smoothedP += (rawP - smoothedP) * pDamp;

      const { fov, camRoll } = evaluatePose(
        smoothedP,
        pointer.x,
        pointer.y,
        _targetPos,
        _tmpLook
      );

      // Sector-level visibility culling so distant heavy shaders use zero GPU budget
      saturnGroup.visible = smoothedP < 0.22;
      const redNebulaVis =
        smoothstepJS(0.01, 0.07, smoothedP) * (1 - smoothstepJS(0.29, 0.34, smoothedP));
      redNebulaGroup.visible = redNebulaVis > 0.003;
      if (redNebulaGroup.visible) {
        redNebulaMat.uniforms.uSectorFade.value = redNebulaVis;
        redNebulaPointMat.uniforms.uSectorFade.value = redNebulaVis;
      }

      galaxyGroup.visible = smoothedP > 0.14 && smoothedP < 0.49;
      mergerGroup.visible = smoothedP > 0.26 && smoothedP < 0.62;
      bendStars.visible = smoothedP > 0.56 && smoothedP < 0.96;
      for (const neb of nebulae) {
        neb.group.visible = smoothedP >= neb.minP && smoothedP <= neb.maxP;
      }

      if (!pausedRef.current) {
        elapsed += dt;

        starMat.uniforms.uTime.value = elapsed;
        if (bendStars.visible) {
          bendMat.uniforms.uTime.value = elapsed;
        }

        if (saturnGroup.visible) {
          saturnBody.rotation.y += dt * 0.08;
        }

        if (redNebulaGroup.visible) {
          redNebulaMat.uniforms.uTime.value = elapsed;
          redNebulaGroup.rotation.z = elapsed * 0.003;
        }

        for (const neb of nebulae) {
          if (neb.group.visible) {
            neb.group.rotation.z = neb.baseRot + elapsed * 0.004;
          }
        }

        if (galaxyGroup.visible) {
          galaxyPoints.rotation.y += dt * 0.03;
        }
        if (smoothedP > 0.87) {
          galCycleElapsed += dt;
          if (galCycleElapsed >= GAL_COLLISION_CYCLE) {
            galCycleElapsed -= GAL_COLLISION_CYCLE;
            galHasLooped = true;
            restoreGalaxySnapshot();
          }

          stepGalaxyCollision(dt * 0.56);
          nbPosAttr.needsUpdate = true;
          nbShockAttr.needsUpdate = true;

          const fadeIn = galHasLooped ? smoothstepJS(0.0, 2.2, galCycleElapsed) : 1.0;
          const fadeOut = 1.0 - smoothstepJS(GAL_COLLISION_CYCLE - 2.5, GAL_COLLISION_CYCLE, galCycleElapsed);
          syncGalaxyVisuals(fadeIn * fadeOut);
        }

        /* ---------- ~2-Min Neutron-Star Spin & GW Waves -> Star-Born Nebula -> Rebirth & Repeat ---------- */
        if (mergerGroup.visible) {
          mergerClock += dt;
          if (mergerClock >= MERGE_CONTACT_T) {
            hasMergedOnce = true;
          }

          const t = mergerClock % MERGE_CYCLE;
          const tContact = MERGE_CONTACT_T; // 118.0s (~2 full minutes of realistic spinning & waves)

          if (t < lastCycleT) {
            orbitalAngle = 0;
          }
          lastCycleT = t;

          const inInspiral = t < tContact;
          // Peters–Mathews GW inspiral decay a(t) = a_min + da * (1 - t/tc)^(1/4)
          const tau = Math.max(1.0 - Math.min(t / tContact, 1.0), 0.0);
          const inspiralSep = 0.96 + 4.65 * Math.pow(tau, 0.25);

          // On subsequent cycles (t = 0..8.5s), newborn neutron stars condense & spiral smoothly out of the nebula core!
          const birthExpand = hasMergedOnce ? smoothstepJS(0.0, 8.5, t) : 1.0;
          const birthScale = hasMergedOnce ? smoothstepJS(0.0, 4.8, t) : 1.0;
          const sep = inInspiral
            ? hasMergedOnce && t < 8.5
              ? 1.18 + (inspiralSep - 1.18) * birthExpand
              : inspiralSep
            : 0.0;

          // Keplerian chirp Omega_orb ~ a^(-3/2)
          const omegaOrb = inInspiral ? 1.15 * Math.pow(5.61 / Math.max(sep, 0.96), 1.5) : 14.5;
          if (inInspiral) {
            orbitalAngle += omegaOrb * dt;
          }

          // Millisecond pulsar axial spin
          const tidalProximity =
            inInspiral && (!hasMergedOnce || t >= 8.5)
              ? Math.pow(0.96 / Math.max(sep, 0.96), 3.0)
              : 0.0;
          const chirpProgress = inInspiral ? Math.pow(1.0 - tau, 2.2) : 1.0;

          spinPhase1 += (14.5 + tidalProximity * 10.5) * dt;
          spinPhase2 -= (12.0 + tidalProximity * 9.5) * dt;

          const ca = Math.cos(orbitalAngle);
          const sa = Math.sin(orbitalAngle);

          star1.orbitalRoot.visible = inInspiral;
          star2.orbitalRoot.visible = inInspiral;
          if (inInspiral) {
            star1.orbitalRoot.position.set(ca * sep * 0.5, 0, sa * sep * 0.5);
            star2.orbitalRoot.position.set(-ca * sep * 0.5, 0, -sa * sep * 0.5);
            star1.orbitalRoot.rotation.y = Math.PI - orbitalAngle;
            star2.orbitalRoot.rotation.y = -orbitalAngle;

            star1.orbitalRoot.scale.setScalar(birthScale);
            star2.orbitalRoot.scale.setScalar(birthScale);

            const tidalFactor = Math.min(tidalProximity * 1.15, 1.0);
            const shockHeat = smoothstepJS(0.16, 0.96, tidalProximity);

            star1.starMatNS.uniforms.uTime.value = elapsed;
            star1.starMatNS.uniforms.uSpinPhase.value = spinPhase1;
            star1.starMatNS.uniforms.uTidal.value = tidalFactor;
            star1.starMatNS.uniforms.uShockHeat.value = shockHeat;
            star1.plumeMat.uniforms.uTime.value = elapsed;
            star1.plumeMat.uniforms.uSpinPhase.value = spinPhase1;
            star1.plumeMat.uniforms.uIntensity.value = birthScale * (0.88 + 0.45 * shockHeat);

            star2.starMatNS.uniforms.uTime.value = elapsed;
            star2.starMatNS.uniforms.uSpinPhase.value = spinPhase2;
            star2.starMatNS.uniforms.uTidal.value = tidalFactor;
            star2.starMatNS.uniforms.uShockHeat.value = shockHeat;
            star2.plumeMat.uniforms.uTime.value = elapsed;
            star2.plumeMat.uniforms.uSpinPhase.value = spinPhase2;
            star2.plumeMat.uniforms.uIntensity.value = birthScale * (0.88 + 0.45 * shockHeat);
          }

          // Propagating spacetime gravitational waves + late tidal plasma streams
          const spiralWaveFade = inInspiral
            ? hasMergedOnce
              ? smoothstepJS(1.0, 6.5, t)
              : 1.0
            : Math.max(0.0, 1.0 - (t - tContact) / 1.2);
          spiralGasMesh.visible = spiralWaveFade > 0.004;
          if (spiralGasMesh.visible) {
            spiralGasMat.uniforms.uTime.value = elapsed;
            spiralGasMat.uniforms.uOrbitalPhase.value = orbitalAngle;
            spiralGasMat.uniforms.uSep.value = Math.max(sep, 0.96);
            spiralGasMat.uniforms.uProximity.value = tidalProximity;
            spiralGasMat.uniforms.uChirp.value = chirpProgress;
            spiralGasMat.uniforms.uWaveFade.value = spiralWaveFade;
          }

          // Star-born Kilonova Nebula (t = 118..150s) + seamless dispersal during stellar rebirth (t = 0..8.5s)
          const postMergerSpan = MERGE_CYCLE - tContact; // 32.0s
          let kiloT = -1.0;
          if (t >= tContact - 0.08) {
            kiloT = t - (tContact - 0.08);
          } else if (hasMergedOnce && t < 9.0) {
            kiloT = postMergerSpan + 0.08 + t;
          }

          const kiloActive = kiloT > 0.0;
          kilonovaCloud.visible = kiloActive;
          kilonovaForeLayer.visible = kiloActive;
          if (kiloActive) {
            const totalKiloLife = postMergerSpan + 9.0; // ~41s from star collision through complete rebirth dispersal
            const kiloFade =
              smoothstepJS(0.0, 0.18, kiloT) *
              (1.0 - smoothstepJS(postMergerSpan - 2.0, totalKiloLife, kiloT));
            // Glow inside the nebula heart as the newborn neutron stars condense out of the gas!
            const rebirthGlow =
              smoothstepJS(postMergerSpan - 5.5, postMergerSpan + 1.0, kiloT) *
              (1.0 - smoothstepJS(postMergerSpan + 3.0, totalKiloLife - 1.0, kiloT));

            kilonovaCloudMat.uniforms.uTime.value = elapsed;
            kilonovaCloudMat.uniforms.uKiloTime.value = kiloT;
            kilonovaCloudMat.uniforms.uRebirthGlow.value = rebirthGlow;
            kilonovaCloudMat.uniforms.uFade.value = kiloFade;

            kilonovaForeMat.uniforms.uTime.value = elapsed + 3.7;
            kilonovaForeMat.uniforms.uKiloTime.value = kiloT * 1.04;
            kilonovaForeMat.uniforms.uRebirthGlow.value = rebirthGlow;
            kilonovaForeMat.uniforms.uFade.value = kiloFade * 0.42;
          }
        }

        if (smoothedP > 0.34 && smoothedP < 0.70) {
          bhMat.uniforms.uTime.value = elapsed;
        }
        if (smoothedP > 0.82 && smoothedP < 0.96) {
          whMat.uniforms.uTime.value = elapsed;
        }
      }

      // Smooth camera kinematics + dynamic banking roll
      const camDamp = 1 - Math.exp(-6.5 * dt);
      camera.position.lerp(_targetPos, camDamp);
      look.lerp(_tmpLook, camDamp);
      currentRoll += (camRoll - currentRoll) * camDamp;
      camera.up.set(Math.sin(currentRoll), Math.cos(currentRoll), 0);
      camera.lookAt(look);

      if (Math.abs(camera.fov - fov) > 0.02) {
        currentFov += (fov - currentFov) * camDamp;
        camera.fov = currentFov;
        camera.updateProjectionMatrix();
      }

      // Subtle warm H-alpha atmospheric scatter when camera flies right inside the Red Nebula core!
      if (redNebulaGroup.visible) {
        const distToRedNebula = camera.position.distanceTo(POS_RED_NEBULA);
        const insideRedFactor = smoothstepJS(46.0, 10.0, distToRedNebula);
        activeBg.copy(baseBg).lerp(redNebulaTint, insideRedFactor * 0.65);
      } else {
        activeBg.copy(baseBg);
      }
      sceneFog.color.copy(activeBg);

      // Orient camera-facing billboards cleanly in world space
      if (mergerGroup.visible) {
        if (star1.orbitalRoot.visible) {
          star1.plumeBillboard.quaternion.copy(mergerGroup.quaternion).invert().multiply(camera.quaternion);
          star2.plumeBillboard.quaternion.copy(star1.plumeBillboard.quaternion);
        }
        if (kilonovaCloud.visible) {
          kilonovaCloud.quaternion.copy(mergerGroup.quaternion).invert().multiply(camera.quaternion);
          kilonovaForeLayer.quaternion.copy(kilonovaCloud.quaternion);
        }
      }

      // Gate 112-step GR Black Hole raymarcher by range so earlier sectors (Saturn / Red Nebula) run at max FPS
      const distToBh = camera.position.distanceTo(POS_BLACKHOLE);
      const bhRangeFade = 1 - smoothstepJS(210.0, 290.0, distToBh);
      const bhHorizonFade = 1 - smoothstepJS(-509.5, -518.0, camera.position.z);
      const bhFade = bhRangeFade * bhHorizonFade;
      bhBillboard.visible = bhFade > 0.004;
      if (bhBillboard.visible) {
        bhBillboard.quaternion.copy(camera.quaternion);
        bhMat.uniforms.uOpacity.value = bhFade;
      }

      const whAppear = smoothstepJS(0.84, 0.89, smoothedP);
      const whPassThrough = 1 - smoothstepJS(0.92, 0.95, smoothedP);
      const whVis = whAppear * whPassThrough;
      whMouth.visible = whVis > 0.004;
      if (whMouth.visible) {
        whMouth.quaternion.copy(camera.quaternion);
        whMat.uniforms.uFade.value = whVis;
      }

      starsPoints.visible = smoothedP < 0.72;
      dustPoints.visible = smoothedP < 0.66;
      otherUniverseGroup.visible = smoothedP > 0.87;

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
      for (const item of disposables) {
        item.dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden />;
}
