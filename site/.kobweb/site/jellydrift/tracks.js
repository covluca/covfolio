import * as THREE from "./vendor/three.module.min.js";

export function clamp(value, min, max, fallback = min) {
  if (!Number.isFinite(value)) return fallback;
  return value < min ? min : value > max ? max : value;
}

const SAMPLE_COUNT = 640;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function wrapAngleRad(a) {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

function makeCanvasTexture(width, height, drawFn, repeatX = 1, repeatY = 1) {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    drawFn(ctx, width, height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

function createRoadTexture(theme) {
  const tex = makeCanvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = theme.roadHex;
      ctx.fillRect(0, 0, w, h);

      // Subtle tire-wear tracks along left & right 2-lane touge driving lines
      for (const laneX of [w * 0.26, w * 0.74]) {
        const grad = ctx.createLinearGradient(laneX - 46, 0, laneX + 46, 0);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.5, "rgba(0,0,0,0.16)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(laneX - 46, 0, 92, h);
      }

      // Fine deterministic asphalt aggregate grain
      for (let i = 0; i < 2400; i++) {
        const gx = (i * 137 + (i % 7) * 19) % w;
        const gy = (i * 263 + (i % 11) * 23) % h;
        ctx.fillStyle = i % 3 === 0 ? "rgba(255,255,255,0.038)" : "rgba(0,0,0,0.085)";
        ctx.fillRect(gx, gy, 2, 2);
      }

      // Crisp edge shoulder stripes
      ctx.fillStyle = theme.edgeStripeHex;
      ctx.fillRect(10, 0, 12, h);
      ctx.fillRect(w - 22, 0, 12, h);

      // Japanese touge dashed center line
      ctx.fillStyle = theme.centerLineHex;
      ctx.fillRect(w * 0.5 - 6, 28, 12, 184);
      ctx.fillRect(w * 0.5 - 6, 284, 12, 184);
    },
    1,
    1
  );
  if (tex) tex.anisotropy = 8;
  return tex;
}

function createCurbTexture(c1, c2) {
  return makeCanvasTexture(
    64,
    256,
    (ctx, w, h) => {
      const stripes = 4;
      const sh = h / stripes;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? c1 : c2;
        ctx.fillRect(0, i * sh, w, sh);
      }
    },
    1,
    1
  );
}

function createGridTexture() {
  return makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#060911";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(60, 131, 239, 0.28)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.strokeStyle = "rgba(60, 131, 239, 0.12)";
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        const p = (w / 4) * k;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, h);
        ctx.moveTo(0, p);
        ctx.lineTo(w, p);
        ctx.stroke();
      }
    },
    60,
    60
  );
}

function createSponsorTexture(title, subtitle, bg1, bg2, accent) {
  return makeCanvasTexture(
    512,
    256,
    (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, bg1);
      grad.addColorStop(1, bg2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = accent;
      ctx.lineWidth = 10;
      ctx.strokeRect(10, 10, w - 20, h - 20);

      ctx.fillStyle = accent;
      ctx.fillRect(28, 30, 14, h - 60);

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 54px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(title, 62, h * 0.42);

      ctx.fillStyle = accent;
      ctx.font = "700 26px sans-serif";
      ctx.fillText(subtitle, 62, h * 0.72);
    },
    1,
    1
  );
}

function createStartCheckerTexture() {
  return makeCanvasTexture(
    256,
    128,
    (ctx, w, h) => {
      const cols = 12;
      const rows = 4;
      const cw = w / cols;
      const ch = h / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? "#f8fafc" : "#111622";
          ctx.fillRect(c * cw, r * ch, cw + 0.5, ch + 0.5);
        }
      }
    },
    1,
    1
  );
}

function createChevronTexture(bgHex, arrowHex) {
  return makeCanvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = bgHex;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = arrowHex;
      ctx.lineWidth = 18;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(34, 24);
      ctx.lineTo(90, h * 0.5);
      ctx.lineTo(34, h - 24);
      ctx.stroke();
    },
    1,
    1
  );
}

function createCityBuildingTexture(accentHex) {
  return makeCanvasTexture(
    128,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#0b1120";
      ctx.fillRect(0, 0, w, h);
      const cols = 6;
      const rows = 14;
      const cw = w / cols;
      const ch = h / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const seed = (r * 31 + c * 17) % 11;
          if (seed < 4) continue;
          ctx.fillStyle = seed === 9 ? accentHex : seed % 2 === 0 ? "#ffe58f" : "#7dd3fc";
          ctx.fillRect(c * cw + 4, r * ch + 4, cw - 8, ch - 8);
        }
      }
    },
    1,
    1
  );
}

function createHighwaySignTexture(topText, subText, accentHex) {
  return makeCanvasTexture(
    512,
    160,
    (ctx, w, h) => {
      ctx.fillStyle = "#0c4a2e";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 8;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = accentHex;
      ctx.fillRect(22, 22, 16, h - 44);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "800 40px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(topText, 54, h * 0.38);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "700 24px sans-serif";
      ctx.fillText(subText, 54, h * 0.72);
    },
    1,
    1
  );
}

const SPONSOR_PRESETS = [
  { title: "COVFOLIO", subtitle: "WEBGL ENGINEERING STUDIO", bg1: "#121826", bg2: "#1d2b44", accent: "#3C83EF" },
  { title: "JELLY TURBO", subtitle: "NITRO CHARGED BOUNCE TECH", bg1: "#2a121b", bg2: "#5e1726", accent: "#F3DB5B" },
  { title: "TOFU MOTORS", subtitle: "LIGHTWEIGHT DRIFT MACHINES", bg1: "#151922", bg2: "#262d3d", accent: "#E63946" },
  { title: "COBALT AERO", subtitle: "AERODYNAMICS & DOWNFORCE LABS", bg1: "#091b33", bg2: "#0f3763", accent: "#00E5FF" },
  { title: "BUMBLE RALLY", subtitle: "OFF-ROAD SUSPENSION SYSTEMS", bg1: "#241d08", bg2: "#4d3c0e", accent: "#F3DB5B" },
  { title: "APEX DRIFT CLUB", subtitle: "PREMIER CIRCUIT SERIES", bg1: "#18102b", bg2: "#301957", accent: "#FF2E93" }
];

const TRACK_SPECS = [
  {
    id: "sunny_coast",
    name: "Sunny Coast",
    subtitle: "Cliffside Switchback Touge",
    halfWidth: 4.0,
    gateCount: 12,
    maxBankRad: (4.5 * Math.PI) / 180,
    skyHex: "#79CBE8",
    fogColor: 0x8ad4ec,
    fogNear: 240,
    fogFar: 1200,
    groundY: -0.6,
    waterY: -0.9,
    theme: {
      roadHex: "#2a313e",
      edgeStripeHex: "rgba(255, 255, 255, 0.76)",
      centerLineHex: "#F3DB5B",
      curbA: "#E63946",
      curbB: "#F8FAFC",
      railColor: 0xdbe4ee,
      pillarColor: 0xc2b29b,
      groundColor: 0xe6cf9e,
      waterColor: 0x1fb6d4,
      accentColor: 0x3c83ef
    },
    // Technical cliffside mountain-coastal touge (~873m perimeter, linked switchbacks & hairpins)
    controlPoints: [
      [0, 0.5, 0],
      [0, 0.5, 28],
      [-28, 1.2, 72],
      [-94, 3.2, 86],
      [-148, 6.4, 48],
      [-150, 9.0, -14],
      [-98, 10.8, -36],
      [-74, 11.4, -82],
      [-130, 10.2, -134],
      [-168, 7.2, -172],
      [-130, 4.4, -214],
      [-64, 2.4, -184],
      [4, 1.0, -112],
      [0, 0.5, -34]
    ]
  },
  {
    id: "canyon_loop",
    name: "Canyon Loop",
    subtitle: "Red-Rock Mountain Pass",
    halfWidth: 3.7,
    gateCount: 14,
    maxBankRad: (5.5 * Math.PI) / 180,
    skyHex: "#E8925C",
    fogColor: 0xe8925c,
    fogNear: 220,
    fogFar: 1150,
    groundY: -0.6,
    waterY: null,
    theme: {
      roadHex: "#342d32",
      edgeStripeHex: "rgba(243, 219, 91, 0.76)",
      centerLineHex: "#f4f1ea",
      curbA: "#d96b27",
      curbB: "#f5e9d6",
      railColor: 0xb8764b,
      pillarColor: 0x9c5534,
      groundColor: 0xc97447,
      waterColor: null,
      accentColor: 0xf3db5b
    },
    // Steep switchback canyon pass climb & corkscrew descent (~972m perimeter)
    controlPoints: [
      [0, 0.8, 0],
      [0, 1.0, 28],
      [36, 3.4, 74],
      [108, 7.2, 84],
      [154, 11.2, 34],
      [112, 14.4, -12],
      [48, 16.8, -42],
      [46, 19.2, -98],
      [104, 20.0, -146],
      [168, 16.4, -152],
      [172, 12.4, -206],
      [108, 8.8, -220],
      [46, 5.2, -166],
      [-12, 2.4, -112],
      [0, 0.8, -36]
    ]
  },
  {
    id: "neon_circuit",
    name: "Neon Circuit",
    subtitle: "Midnight Expressway Touge",
    halfWidth: 4.1,
    gateCount: 14,
    maxBankRad: (5.0 * Math.PI) / 180,
    skyHex: "#06080B",
    fogColor: 0x080b14,
    fogNear: 220,
    fogFar: 1150,
    groundY: -0.5,
    waterY: null,
    theme: {
      roadHex: "#121726",
      edgeStripeHex: "#3C83EF",
      centerLineHex: "#FF2E93",
      curbA: "#3C83EF",
      curbB: "#FF2E93",
      railColor: 0x3c83ef,
      pillarColor: 0x1d2944,
      groundColor: 0x060911,
      waterColor: null,
      accentColor: 0xf3db5b
    },
    // Split-level midnight expressway touge with 9.4m overpass viaduct (~985m perimeter)
    controlPoints: [
      [0, 0.4, 0],
      [0, 0.4, 34],
      [30, 0.6, 98],
      [108, 2.6, 124],
      [174, 6.4, 88],
      [144, 9.8, 36],
      [54, 9.8, 36],
      [-54, 9.8, 36],
      [-142, 9.2, 24],
      [-178, 5.2, -38],
      [-138, 1.4, -104],
      [-58, 0.6, -102],
      [-10, 0.4, -68],
      [0, 0.4, -34]
    ]
  }
];

function buildBakedTrack(spec) {
  const ctrlVectors = spec.controlPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(ctrlVectors, true, "centripetal");
  curve.arcLengthDivisions = 1600;
  const length = curve.getLength();

  const rawPoints = [];
  const rawTangents = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const u = i / SAMPLE_COUNT;
    rawPoints.push(curve.getPointAt(u));
    rawTangents.push(curve.getTangentAt(u).normalize());
  }

  // Compute curvature from tangent yaw delta and smooth it for comfortable banking
  const rawCurvatures = new Float64Array(SAMPLE_COUNT);
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const tPrev = rawTangents[(i - 2 + SAMPLE_COUNT) % SAMPLE_COUNT];
    const tNext = rawTangents[(i + 2) % SAMPLE_COUNT];
    const a1 = Math.atan2(tPrev.x, tPrev.z);
    const a2 = Math.atan2(tNext.x, tNext.z);
    const dAngle = wrapAngleRad(a2 - a1);
    const ds = (4 / SAMPLE_COUNT) * length;
    rawCurvatures[i] = dAngle / Math.max(ds, 1e-3);
  }

  const smoothCurvatures = new Float64Array(SAMPLE_COUNT);
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    let sum = 0;
    const radius = 6;
    for (let k = -radius; k <= radius; k++) {
      sum += rawCurvatures[(i + k + SAMPLE_COUNT) % SAMPLE_COUNT];
    }
    smoothCurvatures[i] = sum / (radius * 2 + 1);
  }

  const samples = [];
  const qBank = new THREE.Quaternion();
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const pos = rawPoints[i];
    const tangent = rawTangents[i];
    const leftFlat = new THREE.Vector3().crossVectors(WORLD_UP, tangent);
    if (leftFlat.lengthSq() < 1e-6) {
      leftFlat.set(1, 0, 0);
    } else {
      leftFlat.normalize();
    }
    const upBase = new THREE.Vector3().crossVectors(tangent, leftFlat).normalize();

    const curv = smoothCurvatures[i];
    // Negative curvature sign gives proper inward racing banking (outer edge higher)
    const bank = clamp(-curv * 3.2, -spec.maxBankRad, spec.maxBankRad, 0);
    qBank.setFromAxisAngle(tangent, bank);

    const binormal = leftFlat.clone().applyQuaternion(qBank).normalize();
    const normal = upBase.clone().applyQuaternion(qBank).normalize();
    const angle = Math.atan2(tangent.x, tangent.z);
    const s = (i / SAMPLE_COUNT) * length;

    samples.push({
      index: i,
      s,
      pos,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      tangent,
      tx: tangent.x,
      ty: tangent.y,
      tz: tangent.z,
      normal,
      nx: normal.x,
      ny: normal.y,
      nz: normal.z,
      binormal,
      bx: binormal.x,
      by: binormal.y,
      bz: binormal.z,
      angle,
      bank,
      halfWidth: spec.halfWidth,
      curvature: curv,
      checkpointId: -1
    });
  }

  function at(sInput) {
    const sClean = Number.isFinite(sInput) ? sInput : 0;
    const wrapped = ((sClean % length) + length) % length;
    const f = (wrapped / length) * SAMPLE_COUNT;
    const i0 = Math.floor(f) % SAMPLE_COUNT;
    const i1 = (i0 + 1) % SAMPLE_COUNT;
    const t = f - Math.floor(f);

    const a = samples[i0];
    const b = samples[i1];

    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;

    const tx = a.tx + (b.tx - a.tx) * t;
    const ty = a.ty + (b.ty - a.ty) * t;
    const tz = a.tz + (b.tz - a.tz) * t;
    const tLen = Math.hypot(tx, ty, tz) || 1;
    const ntx = tx / tLen;
    const nty = ty / tLen;
    const ntz = tz / tLen;

    const nx = a.nx + (b.nx - a.nx) * t;
    const ny = a.ny + (b.ny - a.ny) * t;
    const nz = a.nz + (b.nz - a.nz) * t;
    const nLen = Math.hypot(nx, ny, nz) || 1;
    const nnx = nx / nLen;
    const nny = ny / nLen;
    const nnz = nz / nLen;

    const bx = a.bx + (b.bx - a.bx) * t;
    const by = a.by + (b.by - a.by) * t;
    const bz = a.bz + (b.bz - a.bz) * t;
    const bLen = Math.hypot(bx, by, bz) || 1;
    const nbx = bx / bLen;
    const nby = by / bLen;
    const nbz = bz / bLen;

    const bank = a.bank + (b.bank - a.bank) * t;
    const halfWidth = a.halfWidth + (b.halfWidth - a.halfWidth) * t;
    const curvature = a.curvature + (b.curvature - a.curvature) * t;
    const angle = Math.atan2(ntx, ntz);

    return {
      index: i0,
      s: wrapped,
      pos: new THREE.Vector3(x, y, z),
      x,
      y,
      z,
      tangent: new THREE.Vector3(ntx, nty, ntz),
      tx: ntx,
      ty: nty,
      tz: ntz,
      normal: new THREE.Vector3(nnx, nny, nnz),
      nx: nnx,
      ny: nny,
      nz: nnz,
      binormal: new THREE.Vector3(nbx, nby, nbz),
      bx: nbx,
      by: nby,
      bz: nbz,
      angle,
      bank,
      halfWidth,
      curvature
    };
  }

  // Place gates[0] ahead at s = length / gateCount, and gates[gateCount - 1] at s = 0 (Start/Finish)
  const gates = [];
  for (let k = 0; k < spec.gateCount; k++) {
    const sGate = k === spec.gateCount - 1 ? 0 : ((k + 1) / spec.gateCount) * length;
    const g = at(sGate);
    const nearestIdx = Math.round((sGate / length) * SAMPLE_COUNT) % SAMPLE_COUNT;
    samples[nearestIdx].checkpointId = k;
    gates.push({
      id: k,
      index: k,
      s: g.s,
      x: g.x,
      y: g.y,
      z: g.z,
      pos: { x: g.x, y: g.y, z: g.z },
      tx: g.tx,
      ty: g.ty,
      tz: g.tz,
      nx: g.nx,
      ny: g.ny,
      nz: g.nz,
      bx: g.bx,
      by: g.by,
      bz: g.bz,
      angle: g.angle,
      halfWidth: g.halfWidth,
      radius: Math.max(g.halfWidth + 5.0, 10.0),
      isStartFinish: k === spec.gateCount - 1
    });
  }

  const start = at(0);

  // Pre-compute trackside billboard descriptor positions avoiding crossings & tunnels
  function isNearCrossing(sampleIdx, minClearance = 24) {
    const p = samples[sampleIdx];
    const adjSkip = Math.round(SAMPLE_COUNT * 0.085);
    for (let j = 0; j < SAMPLE_COUNT; j++) {
      const dIdx = Math.min(
        Math.abs(j - sampleIdx),
        SAMPLE_COUNT - Math.abs(j - sampleIdx)
      );
      if (dIdx < adjSkip) continue;
      const q = samples[j];
      const dXZ = Math.hypot(p.x - q.x, p.z - q.z);
      if (dXZ < minClearance) return true;
    }
    return false;
  }

  function isInLandmarkZone(sampleIdx) {
    const u = sampleIdx / SAMPLE_COUNT;
    return u >= 0.70 && u <= 0.81;
  }

  const billboards = [];
  const bbFractions = [0.09, 0.27, 0.43, 0.62, 0.86];
  for (let i = 0; i < bbFractions.length; i++) {
    let idx = Math.floor(bbFractions[i] * SAMPLE_COUNT) % SAMPLE_COUNT;
    let guard = 0;
    while ((isNearCrossing(idx, 24) || isInLandmarkZone(idx)) && guard < 40) {
      idx = (idx + 3) % SAMPLE_COUNT;
      guard++;
    }
    const sObj = samples[idx];
    const side = i % 2 === 0 ? 1 : -1;
    const offsetDist = sObj.halfWidth + 4.8;
    // binormal points left (+1); right is -binormal
    const bx = sObj.x + sObj.bx * side * offsetDist;
    const bz = sObj.z + sObj.bz * side * offsetDist;
    const by = sObj.y + 3.4;
    const preset = SPONSOR_PRESETS[i % SPONSOR_PRESETS.length];
    billboards.push({
      index: i,
      sampleIdx: idx,
      s: sObj.s,
      x: bx,
      y: by,
      z: bz,
      roadX: sObj.x,
      roadY: sObj.y,
      roadZ: sObj.z,
      angle: sObj.angle + (side > 0 ? -0.35 : 0.35) + Math.PI,
      width: 6.4,
      height: 2.8,
      text: `${preset.title} — ${preset.subtitle}`,
      preset
    });
  }

  const trackObj = {
    id: spec.id,
    name: spec.name,
    subtitle: spec.subtitle,
    halfWidth: spec.halfWidth,
    width: spec.halfWidth * 2,
    length,
    skyHex: spec.skyHex,
    fogColor: spec.fogColor,
    fogNear: spec.fogNear,
    fogFar: spec.fogFar,
    groundY: spec.groundY,
    waterY: spec.waterY,
    theme: spec.theme,
    curve,
    samples,
    gates,
    start,
    billboards,
    isNearCrossing,
    at,
    projectToTrack(x, z, hintIdx = -1, yHint = null) {
      return projectToTrack(trackObj, x, z, hintIdx, yHint);
    }
  };
  trackObj.buildMeshes = () => buildTrackMeshes(trackObj);
  return trackObj;
}

export function projectToTrack(track, x, z, hintIdx = -1, yHint = null) {
  const samples = track.samples;
  const n = samples.length;
  const px = Number.isFinite(x) ? x : 0;
  const pz = Number.isFinite(z) ? z : 0;
  const hasYHint = Number.isFinite(yHint);

  let bestIdx = 0;
  let bestScore = Infinity;
  let bestDistSq = Infinity;

  const useLocal = Number.isInteger(hintIdx) && hintIdx >= 0 && hintIdx < n;
  if (useLocal) {
    const windowRadius = Math.max(38, Math.round(n * 0.06));
    for (let k = -windowRadius; k <= windowRadius; k++) {
      const idx = (hintIdx + k + n) % n;
      const s = samples[idx];
      const dx = px - s.x;
      const dz = pz - s.z;
      const dSq = dx * dx + dz * dz;
      const score = hasYHint ? dSq + Math.pow((s.y - yHint) * 1.8, 2) : dSq;
      if (score < bestScore) {
        bestScore = score;
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }
  }

  if (!useLocal || bestDistSq > 55 * 55) {
    bestScore = Infinity;
    bestDistSq = Infinity;
    for (let idx = 0; idx < n; idx++) {
      const s = samples[idx];
      const dx = px - s.x;
      const dz = pz - s.z;
      const dSq = dx * dx + dz * dz;
      const score = hasYHint ? dSq + Math.pow((s.y - yHint) * 2.6, 2) : dSq;
      if (score < bestScore) {
        bestScore = score;
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }
  }

  // Refine continuous projection across adjacent segments [bestIdx-1, bestIdx] and [bestIdx, bestIdx+1]
  let chosenSegA = bestIdx;
  let chosenSegB = (bestIdx + 1) % n;
  let chosenU = 0;
  let chosenDistSq = Infinity;

  const segCandidates = [
    [(bestIdx - 1 + n) % n, bestIdx],
    [bestIdx, (bestIdx + 1) % n]
  ];
  for (let c = 0; c < segCandidates.length; c++) {
    const iA = segCandidates[c][0];
    const iB = segCandidates[c][1];
    const a = samples[iA];
    const b = samples[iB];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const abLenSq = abx * abx + abz * abz;
    const u = abLenSq > 1e-6 ? clamp(((px - a.x) * abx + (pz - a.z) * abz) / abLenSq, 0, 1, 0) : 0;
    const cx = a.x + abx * u;
    const cz = a.z + abz * u;
    const dSq = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
    if (dSq < chosenDistSq) {
      chosenDistSq = dSq;
      chosenSegA = iA;
      chosenSegB = iB;
      chosenU = u;
    }
  }

  const a = samples[chosenSegA];
  const b = samples[chosenSegB];
  const ptX = a.x + (b.x - a.x) * chosenU;
  const ptY = a.y + (b.y - a.y) * chosenU;
  const ptZ = a.z + (b.z - a.z) * chosenU;

  const tx = a.tx + (b.tx - a.tx) * chosenU;
  const ty = a.ty + (b.ty - a.ty) * chosenU;
  const tz = a.tz + (b.tz - a.tz) * chosenU;
  const tLen = Math.hypot(tx, ty, tz) || 1;
  const tangent = { x: tx / tLen, y: ty / tLen, z: tz / tLen };

  const nx = a.nx + (b.nx - a.nx) * chosenU;
  const ny = a.ny + (b.ny - a.ny) * chosenU;
  const nz = a.nz + (b.nz - a.nz) * chosenU;
  const nLen = Math.hypot(nx, ny, nz) || 1;
  const normal = { x: nx / nLen, y: ny / nLen, z: nz / nLen };

  const bx = a.bx + (b.bx - a.bx) * chosenU;
  const by = a.by + (b.by - a.by) * chosenU;
  const bz = a.bz + (b.bz - a.bz) * chosenU;
  const bLen = Math.hypot(bx, by, bz) || 1;
  const binormal = { x: bx / bLen, y: by / bLen, z: bz / bLen };
  const right = { x: -binormal.x, y: -binormal.y, z: -binormal.z };

  const segStep = track.length / n;
  let sInterp = a.s + segStep * chosenU;
  if (sInterp >= track.length) sInterp -= track.length;

  const bank = a.bank + (b.bank - a.bank) * chosenU;
  const halfWidth = a.halfWidth + (b.halfWidth - a.halfWidth) * chosenU;

  const dx = px - ptX;
  const dz = pz - ptZ;
  // lateralOffset > 0 when car is to the RIGHT of centerline (-binormal)
  const lateralOffset = dx * right.x + dz * right.z;

  return {
    index: bestIdx,
    sampleIdx: bestIdx,
    s: sInterp,
    point: { x: ptX, y: ptY, z: ptZ },
    y: ptY,
    tangent,
    normal,
    binormal,
    right,
    halfWidth,
    bank,
    lateralOffset,
    lateral: lateralOffset,
    distSq: chosenDistSq
  };
}

function smoothEdgeChain(pts, samples) {
  const n = pts.length;
  if (n < 6) return pts;
  for (let pass = 0; pass < 3; pass++) {
    const snapshot = pts.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    for (let i = 0; i < n; i++) {
      const prev = snapshot[(i - 1 + n) % n];
      const cur = snapshot[i];
      const next = snapshot[(i + 1) % n];
      const s = samples[i];
      const chordLen = Math.hypot(next.x - prev.x, next.z - prev.z);
      const advNext = (next.x - cur.x) * s.tx + (next.z - cur.z) * s.tz;
      const advPrev = (cur.x - prev.x) * s.tx + (cur.z - prev.z) * s.tz;
      // Blend toward local midpoint only where sharp inner offset compresses or pinches
      if (advNext < chordLen * 0.22 || advPrev < chordLen * 0.22) {
        pts[i].x = cur.x * 0.4 + (prev.x + next.x) * 0.3;
        pts[i].y = cur.y * 0.5 + (prev.y + next.y) * 0.25;
        pts[i].z = cur.z * 0.4 + (prev.z + next.z) * 0.3;
      }
    }
  }
  return pts;
}

function buildRibbonGeometry(samples, leftFn, rightFn, uvScaleV = 0.125, flipWinding = false) {
  const n = samples.length;
  const leftPts = new Array(n);
  const rightPts = new Array(n);
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    leftPts[i] = leftFn(s);
    rightPts[i] = rightFn(s);
  }
  smoothEdgeChain(leftPts, samples);
  smoothEdgeChain(rightPts, samples);

  const positions = new Float32Array((n + 1) * 2 * 3);
  const normals = new Float32Array((n + 1) * 2 * 3);
  const uvs = new Float32Array((n + 1) * 2 * 2);
  const indices = [];

  for (let i = 0; i <= n; i++) {
    const idx = i % n;
    const s = samples[idx];
    const l = leftPts[idx];
    const r = rightPts[idx];
    const vIdx = i * 2;

    positions[vIdx * 3] = l.x;
    positions[vIdx * 3 + 1] = l.y;
    positions[vIdx * 3 + 2] = l.z;

    positions[(vIdx + 1) * 3] = r.x;
    positions[(vIdx + 1) * 3 + 1] = r.y;
    positions[(vIdx + 1) * 3 + 2] = r.z;

    normals[vIdx * 3] = s.nx;
    normals[vIdx * 3 + 1] = s.ny;
    normals[vIdx * 3 + 2] = s.nz;

    normals[(vIdx + 1) * 3] = s.nx;
    normals[(vIdx + 1) * 3 + 1] = s.ny;
    normals[(vIdx + 1) * 3 + 2] = s.nz;

    const vCoord = i * uvScaleV;
    uvs[vIdx * 2] = 0;
    uvs[vIdx * 2 + 1] = vCoord;
    uvs[(vIdx + 1) * 2] = 1;
    uvs[(vIdx + 1) * 2 + 1] = vCoord;

    if (i < n) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      if (!flipWinding) {
        indices.push(a, b, c, b, d, c);
      } else {
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

export function buildTrackMeshes(track) {
  const group = new THREE.Group();
  group.name = `track-${track.id}`;

  const disposables = [];
  const trackGeom = (g) => { disposables.push(g); return g; };
  const trackMat = (m) => { disposables.push(m); return m; };
  const trackTex = (t) => { if (t) disposables.push(t); return t; };

  const samples = track.samples;
  const theme = track.theme;

  // 1. Ground & Ocean Planes (strictly below all road samples -> zero Z-fighting)
  if (track.waterY != null) {
    const waterGeo = trackGeom(new THREE.PlaneGeometry(3600, 3600));
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: theme.waterColor,
        roughness: 0.25,
        metalness: 0.1
      })
    );
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = track.waterY;
    water.name = "ocean-plane";
    group.add(water);
  }

  const roadSize = track.id === "sunny_coast" ? 480 : 2800;
  const groundGeo = trackGeom(new THREE.PlaneGeometry(roadSize, roadSize));
  groundGeo.rotateX(-Math.PI / 2);
  let groundTex = null;
  if (track.id === "neon_circuit") {
    groundTex = trackTex(createGridTexture());
  }
  const groundMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: groundTex ? 0xffffff : theme.groundColor,
      map: groundTex,
      roughness: 0.92,
      metalness: 0.05
    })
  );
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = track.groundY;
  ground.position.x = track.id === "sunny_coast" ? -70 : 0;
  ground.position.z = track.id === "sunny_coast" ? -65 : -55;
  ground.receiveShadow = true;
  ground.name = "ground-plane";
  group.add(ground);

  // 2. Road Surface Ribbon
  const roadTex = trackTex(createRoadTexture(theme));
  if (roadTex) {
    roadTex.repeat.set(1, Math.round(track.length / 18));
  }
  const roadGeo = trackGeom(
    buildRibbonGeometry(
      samples,
      (s) => ({
        x: s.x + s.bx * s.halfWidth + s.nx * 0.02,
        y: s.y + s.by * s.halfWidth + s.ny * 0.02,
        z: s.z + s.bz * s.halfWidth + s.nz * 0.02
      }),
      (s) => ({
        x: s.x - s.bx * s.halfWidth + s.nx * 0.02,
        y: s.y - s.by * s.halfWidth + s.ny * 0.02,
        z: s.z - s.bz * s.halfWidth + s.nz * 0.02
      }),
      1 / SAMPLE_COUNT
    )
  );
  const roadMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: roadTex ? 0xffffff : 0x2b3240,
      map: roadTex,
      roughness: 0.8,
      metalness: 0.08
    })
  );
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  roadMesh.name = "road-surface";
  group.add(roadMesh);

  // 3. Curbs (offset outward [halfWidth, halfWidth + 0.55] & stepped +0.04m along normal)
  const curbTex = trackTex(createCurbTexture(theme.curbA, theme.curbB));
  if (curbTex) {
    curbTex.repeat.set(1, Math.round(track.length / 12));
  }
  const curbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: curbTex ? 0xffffff : 0xe63946,
      map: curbTex,
      roughness: 0.72,
      metalness: 0.05
    })
  );

  // Left curb (+binormal)
  const leftCurbGeo = trackGeom(
    buildRibbonGeometry(
      samples,
      (s) => ({
        x: s.x + s.bx * (s.halfWidth + 0.55) + s.nx * 0.04,
        y: s.y + s.by * (s.halfWidth + 0.55) + s.ny * 0.04,
        z: s.z + s.bz * (s.halfWidth + 0.55) + s.nz * 0.04
      }),
      (s) => ({
        x: s.x + s.bx * s.halfWidth + s.nx * 0.04,
        y: s.y + s.by * s.halfWidth + s.ny * 0.04,
        z: s.z + s.bz * s.halfWidth + s.nz * 0.04
      }),
      1 / SAMPLE_COUNT
    )
  );
  const leftCurbMesh = new THREE.Mesh(leftCurbGeo, curbMat);
  leftCurbMesh.receiveShadow = true;
  group.add(leftCurbMesh);

  // Right curb (-binormal)
  const rightCurbGeo = trackGeom(
    buildRibbonGeometry(
      samples,
      (s) => ({
        x: s.x - s.bx * s.halfWidth + s.nx * 0.04,
        y: s.y - s.by * s.halfWidth + s.ny * 0.04,
        z: s.z - s.bz * s.halfWidth + s.nz * 0.04
      }),
      (s) => ({
        x: s.x - s.bx * (s.halfWidth + 0.55) + s.nx * 0.04,
        y: s.y - s.by * (s.halfWidth + 0.55) + s.ny * 0.04,
        z: s.z - s.bz * (s.halfWidth + 0.55) + s.nz * 0.04
      }),
      1 / SAMPLE_COUNT
    )
  );
  const rightCurbMesh = new THREE.Mesh(rightCurbGeo, curbMat);
  rightCurbMesh.receiveShadow = true;
  group.add(rightCurbMesh);

  // 4. Guardrails / Barriers (at ±(halfWidth + 0.62), height +0.78m)
  const railMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: theme.railColor,
      emissive: track.id === "neon_circuit" ? 0x1e40af : 0x000000,
      emissiveIntensity: track.id === "neon_circuit" ? 0.85 : 0,
      roughness: 0.45,
      metalness: 0.35,
      side: THREE.DoubleSide
    })
  );

  for (const side of [1, -1]) {
    const railOffset = side * (track.halfWidth + 0.62);
    const railGeo = trackGeom(
      buildRibbonGeometry(
        samples,
        (s) => ({
          x: s.x + s.bx * railOffset + s.nx * 0.78,
          y: s.y + s.by * railOffset + s.ny * 0.78,
          z: s.z + s.bz * railOffset + s.nz * 0.78
        }),
        (s) => ({
          x: s.x + s.bx * railOffset - s.nx * 0.15,
          y: s.y + s.by * railOffset - s.ny * 0.15,
          z: s.z + s.bz * railOffset - s.nz * 0.15
        }),
        1 / SAMPLE_COUNT,
        side < 0
      )
    );
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.name = side > 0 ? "guardrail-left" : "guardrail-right";
    group.add(rail);
  }

  // Guardrail structural posts for clear corner depth perception
  const postStep = Math.max(8, Math.round(SAMPLE_COUNT / 48));
  const railPostGeo = trackGeom(new THREE.BoxGeometry(0.16, 0.85, 0.16));
  const railPostMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: track.id === "canyon_loop" ? 0x5c3a21 : track.id === "neon_circuit" ? 0x1e293b : 0x64748b,
      roughness: 0.7,
      metalness: 0.3
    })
  );
  for (let i = 0; i < SAMPLE_COUNT; i += postStep) {
    const s = samples[i];
    for (const side of [1, -1]) {
      const postDist = side * (s.halfWidth + 0.72);
      const post = new THREE.Mesh(railPostGeo, railPostMat);
      post.position.set(
        s.x + s.bx * postDist,
        s.y + s.by * postDist + 0.35,
        s.z + s.bz * postDist
      );
      post.rotation.y = s.angle;
      group.add(post);
    }
  }

  // Reflective guardrail cat's-eye studs (zero-overhead single InstancedMesh)
  const studIndices = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 6) {
    studIndices.push(i);
  }
  const studCount = studIndices.length * 2;
  const studGeo = trackGeom(new THREE.BoxGeometry(0.06, 0.08, 0.18));
  const studMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const studMesh = new THREE.InstancedMesh(studGeo, studMat, studCount);
  studMesh.name = "guardrail-reflectors";
  const studDummy = new THREE.Object3D();
  const outerCol = new THREE.Color(0xff9f1c);
  const innerCol = new THREE.Color(track.id === "neon_circuit" ? 0x38bdf8 : 0xf1f5f9);
  let studPtr = 0;
  for (const idx of studIndices) {
    const s = samples[idx];
    const curveOutSide = Math.abs(s.curvature) > 0.012 ? (s.curvature > 0 ? -1 : 1) : 0;
    for (const side of [1, -1]) {
      const dist = side * (s.halfWidth + 0.58);
      studDummy.position.set(
        s.x + s.bx * dist + s.nx * 0.58,
        s.y + s.by * dist + s.ny * 0.58,
        s.z + s.bz * dist + s.nz * 0.58
      );
      studDummy.rotation.set(0, s.angle, 0);
      studDummy.updateMatrix();
      studMesh.setMatrixAt(studPtr, studDummy.matrix);
      studMesh.setColorAt(studPtr, side === curveOutSide ? outerCol : innerCol);
      studPtr++;
    }
  }
  studMesh.instanceMatrix.needsUpdate = true;
  if (studMesh.instanceColor) studMesh.instanceColor.needsUpdate = true;
  group.add(studMesh);

  // 5. Bridge Deck Underside & Support Pillars (for elevated sections & overpass)
  const undersideMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: theme.pillarColor,
      roughness: 0.85,
      metalness: 0.15,
      side: THREE.DoubleSide
    })
  );
  const deckGeo = trackGeom(
    buildRibbonGeometry(
      samples,
      (s) => ({
        x: s.x - s.bx * (s.halfWidth + 0.65) - s.nx * 0.72,
        y: s.y - s.by * (s.halfWidth + 0.65) - s.ny * 0.72,
        z: s.z - s.bz * (s.halfWidth + 0.65) - s.nz * 0.72
      }),
      (s) => ({
        x: s.x + s.bx * (s.halfWidth + 0.65) - s.nx * 0.72,
        y: s.y + s.by * (s.halfWidth + 0.65) - s.ny * 0.72,
        z: s.z + s.bz * (s.halfWidth + 0.65) - s.nz * 0.72
      }),
      1 / SAMPLE_COUNT
    )
  );
  const deckMesh = new THREE.Mesh(deckGeo, undersideMat);
  deckMesh.name = "bridge-underside";
  group.add(deckMesh);

  // Outer deck side skirts (connects outer curb down to bridge underside)
  for (const side of [1, -1]) {
    const edgeOff = side * (track.halfWidth + 0.62);
    const skirtGeo = trackGeom(
      buildRibbonGeometry(
        samples,
        (s) => ({
          x: s.x + s.bx * edgeOff + s.nx * 0.04,
          y: s.y + s.by * edgeOff + s.ny * 0.04,
          z: s.z + s.bz * edgeOff + s.nz * 0.04
        }),
        (s) => ({
          x: s.x + s.bx * edgeOff - s.nx * 0.72,
          y: s.y + s.by * edgeOff - s.ny * 0.72,
          z: s.z + s.bz * edgeOff - s.nz * 0.72
        }),
        1 / SAMPLE_COUNT,
        side < 0
      )
    );
    group.add(new THREE.Mesh(skirtGeo, undersideMat));
  }

  // Support pillars under elevated bridge stretches (flush beneath deck underside, never poking through asphalt)
  const pillarGeo = trackGeom(new THREE.BoxGeometry(1.3, 1, 1.3));
  const capBeamGeo = trackGeom(new THREE.BoxGeometry(1, 0.45, 1.35));
  const pillarAdjSkip = Math.round(SAMPLE_COUNT * 0.085);
  for (let i = 0; i < SAMPLE_COUNT; i += 18) {
    const s = samples[i];
    if (s.y < 2.6) continue;
    let placedBothSides = true;
    for (const side of [-1, 1]) {
      const px = s.x + s.bx * side * (s.halfWidth * 0.78);
      const pz = s.z + s.bz * side * (s.halfWidth * 0.78);
      // Skip if pillar would sit inside a lower roadway
      let overlapsLowerRoad = false;
      for (let j = 0; j < SAMPLE_COUNT; j += 2) {
        const dIdx = Math.min(Math.abs(j - i), SAMPLE_COUNT - Math.abs(j - i));
        if (dIdx < pillarAdjSkip) continue;
        const q = samples[j];
        if (q.y < s.y - 2.0 && Math.hypot(px - q.x, pz - q.z) < q.halfWidth + 2.4) {
          overlapsLowerRoad = true;
          break;
        }
      }
      if (overlapsLowerRoad) {
        placedBothSides = false;
        continue;
      }
      const pillarTopY = s.y + s.by * side * (s.halfWidth * 0.78) - s.ny * 0.74;
      const h = Math.max(0.5, pillarTopY - track.groundY + 0.5);
      const pillar = new THREE.Mesh(pillarGeo, undersideMat);
      pillar.scale.set(1, h, 1);
      pillar.position.set(px, track.groundY - 0.5 + h * 0.5, pz);
      pillar.name = "bridge-pillar";
      group.add(pillar);
    }
    if (placedBothSides) {
      const cap = new THREE.Mesh(capBeamGeo, undersideMat);
      cap.scale.set(s.halfWidth * 1.65, 1, 1);
      cap.position.set(s.x, s.y - 0.92, s.z);
      cap.rotation.y = s.angle;
      cap.name = "bridge-cap-beam";
      group.add(cap);
    }
  }

  // 6. Start/Finish Line Stripe & Checkpoint Markers
  const startTex = trackTex(createStartCheckerTexture());
  const startLineGeo = trackGeom(new THREE.PlaneGeometry(track.halfWidth * 1.95, 2.4));
  startLineGeo.rotateX(-Math.PI / 2);
  const startLineMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: startTex,
      polygonOffset: true,
      polygonOffsetFactor: -2
    })
  );
  const startLine = new THREE.Mesh(startLineGeo, startLineMat);
  startLine.position.set(
    track.start.x + track.start.nx * 0.045,
    track.start.y + track.start.ny * 0.045,
    track.start.z + track.start.nz * 0.045
  );
  startLine.rotation.y = track.start.angle;
  startLine.name = "start-finish-stripe";
  group.add(startLine);

  // Subtle roadside checkpoint pylons seated outside the guardrail edge
  const cpPoleGeo = trackGeom(new THREE.CylinderGeometry(0.11, 0.14, 2.8, 8));
  const cpBeaconGeo = trackGeom(new THREE.SphereGeometry(0.24, 10, 8));
  const cpPoleMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.4, roughness: 0.4 }));
  const cpBeaconMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: theme.accentColor
    })
  );
  for (let k = 0; k < track.gates.length; k++) {
    const g = track.gates[k];
    if (g.isStartFinish) continue;
    for (const side of [-1, 1]) {
      const ox = g.x + g.bx * side * (g.halfWidth + 0.85);
      const oy = g.y + g.by * side * (g.halfWidth + 0.85);
      const oz = g.z + g.bz * side * (g.halfWidth + 0.85);
      const pole = new THREE.Mesh(cpPoleGeo, cpPoleMat);
      pole.position.set(ox, oy + 1.15, oz);
      group.add(pole);

      const beacon = new THREE.Mesh(cpBeaconGeo, cpBeaconMat);
      beacon.position.set(ox, oy + 2.62, oz);
      group.add(beacon);
    }
  }

  // 7. Gantries (Start/Finish + mid-lap corner gantry) -> gantryAnchors for M3
  const gantryAnchors = [];
  const gantrySamples = [
    { sampleIdx: 0, label: "START / FINISH", preset: SPONSOR_PRESETS[0] },
    { sampleIdx: Math.floor(SAMPLE_COUNT * 0.46), label: "MID-SECTOR", preset: SPONSOR_PRESETS[3] }
  ];
  // Ensure mid-sector gantry isn't on an overpass crossing
  let midIdx = gantrySamples[1].sampleIdx;
  for (let attempt = 0; attempt < 30 && track.isNearCrossing(midIdx, 26); attempt++) {
    midIdx = (midIdx + 4) % SAMPLE_COUNT;
  }
  gantrySamples[1].sampleIdx = midIdx;

  const trussMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e2534, metalness: 0.65, roughness: 0.35 }));
  const postGeo = trackGeom(new THREE.BoxGeometry(0.55, 6.2, 0.55));

  for (let gIdx = 0; gIdx < gantrySamples.length; gIdx++) {
    const spec = gantrySamples[gIdx];
    const s = samples[spec.sampleIdx];
    const gantryGroup = new THREE.Group();
    gantryGroup.name = `gantry-${gIdx}`;
    gantryGroup.position.set(s.x, s.y, s.z);
    gantryGroup.rotation.y = s.angle;

    const span = s.halfWidth * 2 + 2.2;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, trussMat);
      post.position.set(side * (s.halfWidth + 1.05), 3.0, 0);
      gantryGroup.add(post);
    }

    const beamGeo = trackGeom(new THREE.BoxGeometry(span + 0.6, 0.55, 0.7));
    const beam = new THREE.Mesh(beamGeo, trussMat);
    beam.position.set(0, 5.9, 0);
    gantryGroup.add(beam);

    const bannerW = s.halfWidth * 1.65;
    const bannerH = 1.65;
    const tex = trackTex(
      createSponsorTexture(
        gIdx === 0 ? "JELLY DRIFT" : spec.preset.title,
        gIdx === 0 ? "COVFOLIO GRAND PRIX" : spec.preset.subtitle,
        spec.preset.bg1,
        spec.preset.bg2,
        spec.preset.accent
      )
    );
    const bannerMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: tex,
        side: THREE.DoubleSide
      })
    );
    const bannerGeo = trackGeom(new THREE.PlaneGeometry(bannerW, bannerH));
    const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
    bannerMesh.position.set(0, 4.95, 0);
    bannerMesh.rotation.y = Math.PI;
    bannerMesh.name = `gantry-banner-${gIdx}`;
    gantryGroup.add(bannerMesh);

    group.add(gantryGroup);

    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    bannerMesh.updateWorldMatrix(true, false);
    bannerMesh.getWorldPosition(worldPos);
    bannerMesh.getWorldQuaternion(worldQuat);

    gantryAnchors.push({
      index: gIdx,
      s: s.s,
      position: worldPos.clone(),
      quaternion: worldQuat.clone(),
      width: bannerW,
      height: bannerH,
      bannerMesh,
      label: spec.label
    });
  }

  // 8. Trackside Highway Billboards -> billboardMeshes for M3 ads3d.js
  const billboardMeshes = [];
  const bbPoleGeo = trackGeom(new THREE.CylinderGeometry(0.20, 0.26, 1, 8));
  const bbBackingMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x161b26, metalness: 0.55, roughness: 0.45 }));

  for (let i = 0; i < track.billboards.length; i++) {
    const bb = track.billboards[i];
    const frameGroup = new THREE.Group();
    frameGroup.name = `billboard-${i}`;
    const groupBaseY = bb.y - 4.0;
    frameGroup.position.set(bb.x, groupBaseY, bb.z);
    frameGroup.rotation.y = bb.angle;

    const poleBotLocal = Math.min(0, track.groundY - 0.6 - groupBaseY);
    const poleTopLocal = 4.8;
    const poleH = Math.max(3.5, poleTopLocal - poleBotLocal);
    for (const px of [-bb.width * 0.34, bb.width * 0.34]) {
      const pole = new THREE.Mesh(bbPoleGeo, bbBackingMat);
      pole.scale.set(1, poleH, 1);
      pole.position.set(px, poleBotLocal + poleH * 0.5, -0.25);
      frameGroup.add(pole);
    }

    const frameBoxGeo = trackGeom(new THREE.BoxGeometry(bb.width + 0.5, bb.height + 0.5, 0.38));
    const frameBox = new THREE.Mesh(frameBoxGeo, bbBackingMat);
    frameBox.position.set(0, 5.2, -0.15);
    frameGroup.add(frameBox);

    const bbTex = trackTex(
      createSponsorTexture(
        bb.preset.title,
        bb.preset.subtitle,
        bb.preset.bg1,
        bb.preset.bg2,
        bb.preset.accent
      )
    );
    const panelMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: bbTex,
        side: THREE.DoubleSide
      })
    );
    const panelGeo = trackGeom(new THREE.PlaneGeometry(bb.width, bb.height));
    const panelMesh = new THREE.Mesh(panelGeo, panelMat);
    panelMesh.position.set(0, 5.2, 0.08);
    panelMesh.name = `billboard-face-${i}`;
    frameGroup.add(panelMesh);

    group.add(frameGroup);

    billboardMeshes.push({
      index: i,
      mesh: panelMesh,
      frameGroup,
      width: bb.width,
      height: bb.height,
      x: bb.x,
      y: bb.y,
      z: bb.z,
      roadX: bb.roadX,
      roadY: bb.roadY,
      roadZ: bb.roadZ,
      angle: bb.angle,
      text: bb.text
    });
  }

  // 9. Distinct Touge Landmarks, Corner Chevrons & Bespoke World Geometry
  function isClearOfTrack(px, pz, margin = 14) {
    for (let j = 0; j < SAMPLE_COUNT; j += 3) {
      const s = samples[j];
      if (Math.hypot(px - s.x, pz - s.z) < s.halfWidth + margin) {
        return false;
      }
    }
    return true;
  }

  // Touge outer-corner reflective hairpin chevron boards (mounted flush on outer guardrail edge)
  const chevronColors =
    track.id === "sunny_coast"
      ? ["#111827", "#f3db5b"]
      : track.id === "canyon_loop"
      ? ["#f8fafc", "#e63946"]
      : ["#0f172a", "#00e5ff"];
  const chevronTex = trackTex(createChevronTexture(chevronColors[0], chevronColors[1]));
  const chevronGeo = trackGeom(new THREE.PlaneGeometry(1.75, 1.75));
  const chevronMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xffffff, map: chevronTex, side: THREE.DoubleSide })
  );
  const chevronPostGeo = trackGeom(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6));
  const chevronPostMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 }));
  for (let i = 16; i < SAMPLE_COUNT - 16; i += 9) {
    const s = samples[i];
    if (Math.abs(s.curvature) < 0.025) continue;
    const outSide = s.curvature > 0 ? -1 : 1;
    const dist = s.halfWidth + 0.72;
    const cx = s.x + s.bx * outSide * dist;
    const cy = s.y + s.by * outSide * dist;
    const cz = s.z + s.bz * outSide * dist;
    const post = new THREE.Mesh(chevronPostGeo, chevronPostMat);
    post.position.set(cx, cy + 0.85, cz);
    group.add(post);

    const sign = new THREE.Mesh(chevronGeo, chevronMat);
    sign.position.set(cx, cy + 1.95, cz);
    // Face oncoming traffic along -tangent; flip arrow so left turns point LEFT (<) and right turns point RIGHT (>)
    sign.rotation.y = s.angle + (outSide > 0 ? 0.22 : -0.22) + Math.PI;
    if (s.curvature > 0) sign.scale.x = -1;
    group.add(sign);
  }

  if (track.id === "sunny_coast") {
    const trunkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 }));
    const leafMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x2ec46d, roughness: 0.75 }));
    const rockMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x7c7165, roughness: 0.92 }));
    const cliffConcreteMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.8 }));
    const woodMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x9b6b43, roughness: 0.88 }));

    // A) Coastal Rock-Cut Cliff Gallery / Arch Tunnel (samples 462..498)
    const galStart = Math.floor(SAMPLE_COUNT * 0.72);
    const galEnd = Math.floor(SAMPLE_COUNT * 0.78);
    const cliffWallGeo = trackGeom(new THREE.BoxGeometry(2.0, 6.4, 4.2));
    const galleryRoofGeo = trackGeom(new THREE.BoxGeometry(track.halfWidth * 2 + 4.0, 1.1, 4.4));
    const seaColGeo = trackGeom(new THREE.BoxGeometry(0.95, 5.8, 0.95));
    for (let i = galStart; i <= galEnd; i += 2) {
      const s = samples[i % SAMPLE_COUNT];
      const bayCenter = new THREE.Group();
      bayCenter.position.set(s.x, s.y, s.z);
      bayCenter.rotation.y = s.angle;

      // Solid carved rock cliff face on outer side (+binormal left / cliff side)
      const rockWall = new THREE.Mesh(cliffWallGeo, rockMat);
      rockWall.position.set(s.halfWidth + 1.5, 3.0, 0);
      bayCenter.add(rockWall);

      // Open seaside gallery concrete arch columns on ocean side
      if ((i - galStart) % 4 === 0) {
        const col = new THREE.Mesh(seaColGeo, cliffConcreteMat);
        col.position.set(-(s.halfWidth + 1.25), 2.8, 0);
        bayCenter.add(col);
      }

      const roof = new THREE.Mesh(galleryRoofGeo, rockMat);
      roof.position.set(0.15, 5.9, 0);
      bayCenter.add(roof);
      group.add(bayCenter);
    }

    // B) Layered Coastal Palms & Retaining Cliff Rocks
    const trunkGeo = trackGeom(new THREE.CylinderGeometry(0.28, 0.45, 7.2, 7));
    const crownGeo = trackGeom(new THREE.ConeGeometry(3.2, 2.2, 7));
    for (let i = 0; i < SAMPLE_COUNT; i += 14) {
      if (i >= galStart - 4 && i <= galEnd + 4) continue;
      const s = samples[i];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.halfWidth + 8.5 + (i % 5) * 2.2;
      const px = s.x + s.bx * side * dist;
      const pz = s.z + s.bz * side * dist;
      if (!isClearOfTrack(px, pz, 5.5)) continue;

      const palm = new THREE.Group();
      palm.position.set(px, track.groundY, pz);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 3.6;
      trunk.rotation.z = side * 0.08;
      palm.add(trunk);

      const crown1 = new THREE.Mesh(crownGeo, leafMat);
      crown1.position.set(side * -0.25, 7.4, 0);
      palm.add(crown1);

      const crown2 = new THREE.Mesh(crownGeo, leafMat);
      crown2.scale.set(0.75, 0.75, 0.75);
      crown2.position.set(side * -0.25, 8.5, 0);
      crown2.rotation.y = 0.6;
      palm.add(crown2);
      group.add(palm);
    }

    // C) Coastal Lighthouse + Harbor Pier & Sailboats out in the bay
    const lhPos = { x: 46, z: -26 };
    if (isClearOfTrack(lhPos.x, lhPos.z, 12)) {
      const lh = new THREE.Group();
      lh.position.set(lhPos.x, track.groundY, lhPos.z);
      const tower = new THREE.Mesh(trackGeom(new THREE.CylinderGeometry(2.3, 4.0, 24, 10)), trackMat(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 })));
      tower.position.y = 12;
      lh.add(tower);
      const band = new THREE.Mesh(trackGeom(new THREE.CylinderGeometry(2.8, 3.3, 5.5, 10)), trackMat(new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.7 })));
      band.position.y = 13;
      lh.add(band);
      const beacon = new THREE.Mesh(trackGeom(new THREE.SphereGeometry(2.2, 10, 8)), trackMat(new THREE.MeshBasicMaterial({ color: 0xf3db5b })));
      beacon.position.y = 24.8;
      lh.add(beacon);
      group.add(lh);
    }

    const pierBase = { x: 44, z: -225 };
    if (isClearOfTrack(pierBase.x, pierBase.z, 18)) {
      const pier = new THREE.Group();
      pier.position.set(pierBase.x, track.waterY + 0.75, pierBase.z);
      pier.rotation.y = 0.4;
      const deck = new THREE.Mesh(trackGeom(new THREE.BoxGeometry(6.5, 0.45, 34)), woodMat);
      pier.add(deck);
      const pilingGeo = trackGeom(new THREE.CylinderGeometry(0.28, 0.3, 3.2, 6));
      for (const pz of [-13, -4, 5, 14]) {
        for (const px of [-2.8, 2.8]) {
          const piling = new THREE.Mesh(pilingGeo, woodMat);
          piling.position.set(px, -0.6, pz);
          pier.add(piling);
        }
      }
      group.add(pier);
    }

    const boatCoords = [
      [58, -145, 0.5, 0xe63946],
      [-215, -135, -0.8, 0x3c83ef],
      [-215, -15, 1.1, 0xf3db5b]
    ];
    const hullGeo = trackGeom(new THREE.BoxGeometry(3.2, 1.1, 7.6));
    const mastGeo = trackGeom(new THREE.CylinderGeometry(0.12, 0.14, 7.5, 6));
    const sailGeo = trackGeom(new THREE.ConeGeometry(2.4, 6.4, 3));
    const hullWhiteMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 }));
    for (const [bx, bz, rot, accentHex] of boatCoords) {
      if (!isClearOfTrack(bx, bz, 16)) continue;
      const boat = new THREE.Group();
      boat.position.set(bx, track.waterY + 0.35, bz);
      boat.rotation.y = rot;
      boat.add(new THREE.Mesh(hullGeo, hullWhiteMat));
      const mast = new THREE.Mesh(mastGeo, woodMat);
      mast.position.y = 3.8;
      boat.add(mast);
      const sail = new THREE.Mesh(sailGeo, trackMat(new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.6 })));
      sail.position.set(0, 4.4, 0.3);
      sail.scale.set(0.18, 1.0, 1.0);
      boat.add(sail);
      group.add(boat);
    }
  } else if (track.id === "canyon_loop") {
    const mesaDarkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x9b4528, roughness: 0.92 }));
    const mesaMidMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xc46037, roughness: 0.9 }));
    const mesaTopMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe38b52, roughness: 0.88 }));
    const cactusMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b8c52, roughness: 0.8 }));
    const timberMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x7c4d2b, roughness: 0.88 }));

    // A) Sculpted Red-Rock Natural Sandstone Arch spanning completely over the canyon road (grounded to canyon floor)
    const archIdx = Math.floor(SAMPLE_COUNT * 0.74);
    const as = samples[archIdx];
    const archGroup = new THREE.Group();
    archGroup.position.set(as.x, as.y, as.z);
    archGroup.rotation.y = as.angle;
    const span = as.halfWidth + 3.4;
    const archBaseLocalY = track.groundY - 1.5 - as.y;
    const pierH = Math.max(11.5, 10.2 - archBaseLocalY);
    const pierGeo = trackGeom(new THREE.BoxGeometry(5.2, 1, 6.2));
    for (const side of [-1, 1]) {
      const pier = new THREE.Mesh(pierGeo, mesaDarkMat);
      pier.scale.set(1, pierH, 1);
      pier.position.set(side * (span + 2.0), archBaseLocalY + pierH * 0.5, 0);
      pier.rotation.z = -side * 0.12;
      archGroup.add(pier);
    }
    const lintel1 = new THREE.Mesh(trackGeom(new THREE.BoxGeometry(span * 2 + 6.8, 3.2, 5.4)), mesaMidMat);
    lintel1.position.set(0, 9.8, 0);
    archGroup.add(lintel1);
    const lintel2 = new THREE.Mesh(trackGeom(new THREE.BoxGeometry(span * 2 + 2.4, 2.6, 4.6)), mesaTopMat);
    lintel2.position.set(0, 12.2, 0);
    archGroup.add(lintel2);
    group.add(archGroup);

    // B) Stepped Multi-Tier Red-Rock Canyon Mesas & Gorge Cliff Ridges
    const tierGeo = trackGeom(new THREE.CylinderGeometry(11, 15, 9, 7));
    const mesaCoords = [
      [225, 45, 1.4],
      [-52, 20, 1.3],
      [215, -170, 1.5],
      [98, -104, 0.85],
      [-54, -185, 1.6],
      [-76, 86, 1.8],
      [-92, -62, 1.65],
      [88, 148, 1.9],
      [240, 130, 2.1],
      [252, -55, 1.85],
      [246, -245, 2.0],
      [115, -285, 1.95],
      [-35, -270, 1.75],
      [-72, -125, 1.4],
      [104, -52, 0.9]
    ];
    for (let m = 0; m < mesaCoords.length; m++) {
      const [mx, mz, sc] = mesaCoords[m];
      if (!isClearOfTrack(mx, mz, 15 * sc)) continue;
      const mesa = new THREE.Group();
      mesa.position.set(mx, track.groundY, mz);
      const t1 = new THREE.Mesh(tierGeo, mesaDarkMat);
      t1.scale.set(sc * 1.15, 1.1, sc * 1.15);
      t1.position.y = 4.5;
      mesa.add(t1);
      const t2 = new THREE.Mesh(tierGeo, mesaMidMat);
      t2.scale.set(sc * 0.86, 1.0, sc * 0.86);
      t2.position.y = 12.5;
      mesa.add(t2);
      const t3 = new THREE.Mesh(tierGeo, mesaTopMat);
      t3.scale.set(sc * 0.62, 0.85, sc * 0.62);
      t3.position.y = 19.2;
      mesa.add(t3);
      group.add(mesa);
    }

    // C) Wooden Canyon Lookout Watchtower near high pass overlook (legs grounded to canyon floor)
    const towerSample = samples[Math.floor(SAMPLE_COUNT * 0.45)];
    const wtX = towerSample.x - towerSample.bx * (towerSample.halfWidth + 9.5);
    const wtZ = towerSample.z - towerSample.bz * (towerSample.halfWidth + 9.5);
    if (isClearOfTrack(wtX, wtZ, 4.5)) {
      const wt = new THREE.Group();
      const wtBaseY = towerSample.y - 1.0;
      wt.position.set(wtX, wtBaseY, wtZ);
      const wtBaseLocalY = track.groundY - 1.2 - wtBaseY;
      const legH = Math.max(9.5, 10.0 - wtBaseLocalY);
      const legGeo = trackGeom(new THREE.BoxGeometry(0.45, 1, 0.45));
      for (const lx of [-1.8, 1.8]) {
        for (const lz of [-1.8, 1.8]) {
          const leg = new THREE.Mesh(legGeo, timberMat);
          leg.scale.set(1, legH, 1);
          leg.position.set(lx, wtBaseLocalY + legH * 0.5, lz);
          wt.add(leg);
        }
      }
      const cabin = new THREE.Mesh(trackGeom(new THREE.BoxGeometry(4.4, 2.8, 4.4)), mesaTopMat);
      cabin.position.y = 10.6;
      wt.add(cabin);
      const roof = new THREE.Mesh(trackGeom(new THREE.ConeGeometry(3.8, 2.2, 4)), timberMat);
      roof.position.y = 13.0;
      roof.rotation.y = Math.PI * 0.25;
      wt.add(roof);
      group.add(wt);
    }

    // D) Branched Saguaro Cacti & Canyon Sandstone Boulders
    const cactusStemGeo = trackGeom(new THREE.CylinderGeometry(0.38, 0.44, 5.2, 7));
    const cactusArmGeo = trackGeom(new THREE.CylinderGeometry(0.24, 0.28, 2.0, 6));
    const boulderGeo = trackGeom(new THREE.DodecahedronGeometry(2.2, 0));
    for (let i = 0; i < SAMPLE_COUNT; i += 18) {
      const s = samples[i];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.halfWidth + 8.5 + (i % 4) * 2.5;
      const px = s.x + s.bx * side * dist;
      const pz = s.z + s.bz * side * dist;
      if (!isClearOfTrack(px, pz, 5.0)) continue;

      if (i % 36 === 0) {
        const rock = new THREE.Mesh(boulderGeo, mesaMidMat);
        rock.scale.set(1.2, 0.75, 1.0);
        rock.position.set(px, track.groundY + 1.0, pz);
        rock.rotation.set(0.3 * i, 0.5 * i, 0.2);
        group.add(rock);
      } else {
        const cactus = new THREE.Group();
        cactus.position.set(px, track.groundY, pz);
        cactus.rotation.y = i * 0.7;
        const stem = new THREE.Mesh(cactusStemGeo, cactusMat);
        stem.position.y = 2.6;
        cactus.add(stem);
        const armL = new THREE.Mesh(cactusArmGeo, cactusMat);
        armL.position.set(0.65, 3.0, 0);
        armL.rotation.z = -0.5;
        cactus.add(armL);
        const armR = new THREE.Mesh(cactusArmGeo, cactusMat);
        armR.position.set(-0.62, 2.5, 0);
        armR.rotation.z = 0.55;
        cactus.add(armR);
        group.add(cactus);
      }
    }
  } else {
    // neon_circuit: Illuminated Expressway Tunnel, City Skyline & Highway Destination Gantries
    const concreteMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x162033, metalness: 0.55, roughness: 0.45 }));
    const stripCyanMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
    const stripPinkMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xff2e93 }));
    const stripAmberMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xf3db5b }));

    // A) Illuminated Expressway Tunnel (samples 464..502)
    const tunStart = Math.floor(SAMPLE_COUNT * 0.725);
    const tunEnd = Math.floor(SAMPLE_COUNT * 0.785);
    const tunWallGeo = trackGeom(new THREE.BoxGeometry(0.85, 5.6, 3.8));
    const tunRoofGeo = trackGeom(new THREE.BoxGeometry(track.halfWidth * 2 + 3.6, 0.75, 3.9));
    const tunStripGeo = trackGeom(new THREE.BoxGeometry(0.95, 0.18, 3.5));
    for (let i = tunStart; i <= tunEnd; i += 2) {
      const s = samples[i % SAMPLE_COUNT];
      const seg = new THREE.Group();
      seg.position.set(s.x, s.y, s.z);
      seg.rotation.y = s.angle;
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(tunWallGeo, concreteMat);
        wall.position.set(side * (s.halfWidth + 1.3), 2.8, 0);
        seg.add(wall);
      }
      const roof = new THREE.Mesh(tunRoofGeo, concreteMat);
      roof.position.set(0, 5.5, 0);
      seg.add(roof);
      const light = new THREE.Mesh(tunStripGeo, i % 4 === 0 ? stripCyanMat : stripAmberMat);
      light.position.set(0, 5.05, 0);
      seg.add(light);
      group.add(seg);
    }

    // B) Green Expressway Overhead Destination Route Signs (independent of sponsor gantryAnchors)
    const hwyPostGeo = trackGeom(new THREE.CylinderGeometry(0.22, 0.28, 6.2, 8));
    const hwyBeamGeo = trackGeom(new THREE.BoxGeometry(track.halfWidth * 2 + 2.6, 0.38, 0.38));
    const hwySignSpec = [
      { idx: Math.floor(SAMPLE_COUNT * 0.21), top: "BAYSHORE VIADUCT ->", sub: "C1 EXPRESSWAY TOUGE", accent: "#00e5ff" },
      { idx: Math.floor(SAMPLE_COUNT * 0.62), top: "SHIBUYA TUNNEL 200m", sub: "NIGHT DRIFT SECTOR", accent: "#f3db5b" }
    ];
    for (const hs of hwySignSpec) {
      const s = samples[hs.idx % SAMPLE_COUNT];
      const g = new THREE.Group();
      g.position.set(s.x, s.y, s.z);
      g.rotation.y = s.angle;
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(hwyPostGeo, concreteMat);
        post.position.set(side * (s.halfWidth + 1.1), 3.1, 0);
        g.add(post);
      }
      const beam = new THREE.Mesh(hwyBeamGeo, concreteMat);
      beam.position.set(0, 5.9, 0);
      g.add(beam);
      const signTex = trackTex(createHighwaySignTexture(hs.top, hs.sub, hs.accent));
      const signFace = new THREE.Mesh(
        trackGeom(new THREE.PlaneGeometry(s.halfWidth * 1.45, 1.6)),
        trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff, map: signTex, side: THREE.DoubleSide }))
      );
      signFace.position.set(0, 5.05, 0);
      signFace.rotation.y = Math.PI;
      g.add(signFace);
      group.add(g);
    }

    // C) Procedural Lit-Window City Skyline Towers
    const bldTexBlue = trackTex(createCityBuildingTexture("#38bdf8"));
    const bldTexPink = trackTex(createCityBuildingTexture("#f472b6"));
    const bldMatBlue = trackMat(new THREE.MeshStandardMaterial({ map: bldTexBlue, emissive: 0x0f172a, roughness: 0.5 }));
    const bldMatPink = trackMat(new THREE.MeshStandardMaterial({ map: bldTexPink, emissive: 0x1a0b24, roughness: 0.5 }));
    const neonTrimMats = [stripCyanMat, stripPinkMat, stripAmberMat];
    const skylinePositions = [
      [-65, -42, 16, 46, 16],
      [-92, -32, 14, 62, 14],
      [62, -48, 18, 52, 16],
      [96, -24, 15, 68, 15],
      [78, 165, 20, 58, 18],
      [-88, 95, 18, 54, 18],
      [-218, 55, 22, 74, 22],
      [-215, -108, 20, 64, 20],
      [216, 118, 22, 70, 22],
      [208, -28, 18, 50, 18],
      [-45, -162, 22, 60, 18],
      [48, -168, 20, 55, 18]
    ];
    for (let b = 0; b < skylinePositions.length; b++) {
      const [bx, bz, bw, bh, bd] = skylinePositions[b];
      if (!isClearOfTrack(bx, bz, Math.max(bw, bd) * 0.72 + 4)) continue;
      const tower = new THREE.Group();
      tower.position.set(bx, track.groundY, bz);
      const body = new THREE.Mesh(
        trackGeom(new THREE.BoxGeometry(bw, bh, bd)),
        b % 2 === 0 ? bldMatBlue : bldMatPink
      );
      body.position.y = bh * 0.5;
      tower.add(body);
      const cap = new THREE.Mesh(
        trackGeom(new THREE.BoxGeometry(bw + 0.5, 0.85, bd + 0.5)),
        neonTrimMats[b % neonTrimMats.length]
      );
      cap.position.y = bh + 0.3;
      tower.add(cap);
      group.add(tower);
    }

    // D) Curved Expressway Streetlamps along curbs
    const lampMastGeo = trackGeom(new THREE.CylinderGeometry(0.11, 0.14, 6.2, 6));
    const lampArmGeo = trackGeom(new THREE.BoxGeometry(2.2, 0.14, 0.14));
    const lampBulbGeo = trackGeom(new THREE.BoxGeometry(0.95, 0.16, 0.45));
    for (let i = 6; i < SAMPLE_COUNT; i += 24) {
      if (i >= tunStart - 3 && i <= tunEnd + 3) continue;
      const s = samples[i];
      const side = i % 48 === 6 ? 1 : -1;
      const lamp = new THREE.Group();
      lamp.position.set(
        s.x + s.bx * side * (s.halfWidth + 0.90),
        s.y,
        s.z + s.bz * side * (s.halfWidth + 0.90)
      );
      lamp.rotation.y = s.angle;
      const mast = new THREE.Mesh(lampMastGeo, concreteMat);
      mast.position.y = 3.1;
      lamp.add(mast);
      const arm = new THREE.Mesh(lampArmGeo, concreteMat);
      arm.position.set(-side * 1.0, 6.1, 0);
      lamp.add(arm);
      const bulb = new THREE.Mesh(lampBulbGeo, i % 48 === 6 ? stripCyanMat : stripAmberMat);
      bulb.position.set(-side * 1.85, 5.95, 0);
      lamp.add(bulb);
      group.add(lamp);
    }
  }

  function dispose() {
    if (group.parent) {
      group.parent.remove(group);
    }
    for (let i = 0; i < disposables.length; i++) {
      const d = disposables[i];
      if (d && typeof d.dispose === "function") {
        try {
          d.dispose();
        } catch (_) {
          // ignore
        }
      }
    }
  }

  group.userData.dispose = dispose;

  return {
    group,
    gantryAnchors,
    billboardMeshes,
    dispose
  };
}

export const TRACKS = {};
export const TRACK_IDS = TRACK_SPECS.map((s) => s.id);

for (let i = 0; i < TRACK_SPECS.length; i++) {
  const baked = buildBakedTrack(TRACK_SPECS[i]);
  TRACKS[baked.id] = baked;
}

export function getTrack(id) {
  return TRACKS[id] || TRACKS[TRACK_IDS[0]];
}
