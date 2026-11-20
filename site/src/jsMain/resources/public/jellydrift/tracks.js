import * as THREE from "./vendor/three.module.min.js";

export function clamp(value, min, max, fallback = min) {
  if (!Number.isFinite(value)) return fallback;
  return value < min ? min : value > max ? max : value;
}

const SAMPLE_COUNT = 480;
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
  return makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = theme.roadHex;
      ctx.fillRect(0, 0, w, h);

      // Subtle deterministic asphalt grain
      for (let i = 0; i < 650; i++) {
        const gx = ((i * 73) % w);
        const gy = ((i * 139) % h);
        ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.08)";
        ctx.fillRect(gx, gy, 2, 2);
      }

      // Edge shoulder stripes
      ctx.fillStyle = theme.edgeStripeHex;
      ctx.fillRect(6, 0, 7, h);
      ctx.fillRect(w - 13, 0, 7, h);

      // Dashed center line
      ctx.fillStyle = theme.centerLineHex;
      ctx.fillRect(w * 0.5 - 4, 16, 8, 92);
      ctx.fillRect(w * 0.5 - 4, 144, 8, 92);
    },
    1,
    1
  );
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
    subtitle: "Coastal Highway & Palms",
    halfWidth: 16.5,
    gateCount: 12,
    maxBankRad: (5 * Math.PI) / 180,
    skyHex: "#79CBE8",
    fogColor: 0x8ad4ec,
    fogNear: 280,
    fogFar: 1400,
    groundY: -0.6,
    waterY: -0.9,
    theme: {
      roadHex: "#2d3442",
      edgeStripeHex: "rgba(255, 255, 255, 0.72)",
      centerLineHex: "#F3DB5B",
      curbA: "#E63946",
      curbB: "#F8FAFC",
      railColor: 0xdbe4ee,
      pillarColor: 0xc2b29b,
      groundColor: 0xe6cf9e,
      waterColor: 0x1fb6d4,
      accentColor: 0x3c83ef
    },
    // Wide open coastal drift circuit with long connected corners (~1150m perimeter)
    controlPoints: [
      [0, 0.5, -140],
      [0, 0.55, -20],
      [50, 1.4, 90],
      [145, 3.6, 120],
      [190, 6.2, 50],
      [170, 4.8, -65],
      [100, 2.5, -110],
      [75, 3.1, -240],
      [-35, 1.4, -230]
    ]
  },
  {
    id: "canyon_loop",
    name: "Canyon Loop",
    subtitle: "Plateau Climb & Jump Crest",
    halfWidth: 15.0,
    gateCount: 14,
    maxBankRad: (8 * Math.PI) / 180,
    skyHex: "#E8925C",
    fogColor: 0xe8925c,
    fogNear: 260,
    fogFar: 1350,
    groundY: -0.6,
    waterY: null,
    theme: {
      roadHex: "#352e33",
      edgeStripeHex: "rgba(243, 219, 91, 0.72)",
      centerLineHex: "#f4f1ea",
      curbA: "#d96b27",
      curbB: "#f5e9d6",
      railColor: 0xb8764b,
      pillarColor: 0x9c5534,
      groundColor: 0xc97447,
      waterColor: null,
      accentColor: 0xf3db5b
    },
    // Open canyon drift loop with long connected switchbacks (~1300m perimeter)
    controlPoints: [
      [0, 0.6, -140],
      [0, 0.8, -25],
      [45, 3.6, 75],
      [140, 8.8, 120],
      [195, 13.8, 55],
      [175, 11.4, -55],
      [105, 7.0, -85],
      [145, 10.4, -165],
      [100, 12.6, -240],
      [-30, 8.2, -250],
      [-130, 3.4, -205]
    ]
  },
  {
    id: "neon_circuit",
    name: "Neon Circuit",
    subtitle: "Midnight Overpass & Chicanes",
    halfWidth: 14.5,
    gateCount: 16,
    maxBankRad: (7 * Math.PI) / 180,
    skyHex: "#06080B",
    fogColor: 0x080b14,
    fogNear: 240,
    fogFar: 1250,
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
    // Wide figure-8 overpass with broad drift areas and long connected corners (~1450m perimeter)
    controlPoints: [
      [0, 0.3, -130],
      [0, 0.3, -45],
      [0, 0.3, 45],
      [35, 0.4, 140],
      [150, 3.2, 175],
      [230, 7.6, 100],
      [175, 9.6, 15],
      [65, 9.6, 0],
      [-65, 9.6, 0],
      [-175, 8.4, -20],
      [-215, 4.2, -125],
      [-145, 0.8, -195]
    ]
  }
];

function buildBakedTrack(spec) {
  const ctrlVectors = spec.controlPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(ctrlVectors, true, "catmullrom", 0.5);
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
    const bank = clamp(curv * 4.5, -spec.maxBankRad, spec.maxBankRad, 0);
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
      radius: Math.max(g.halfWidth + 7.5, 16.5),
      isStartFinish: k === spec.gateCount - 1
    });
  }

  const start = at(0);

  // Pre-compute trackside billboard descriptor positions avoiding crossings
  function isNearCrossing(sampleIdx, minClearance = 24) {
    const p = samples[sampleIdx];
    for (let j = 0; j < SAMPLE_COUNT; j++) {
      const dIdx = Math.min(
        Math.abs(j - sampleIdx),
        SAMPLE_COUNT - Math.abs(j - sampleIdx)
      );
      if (dIdx < 40) continue;
      const q = samples[j];
      const dXZ = Math.hypot(p.x - q.x, p.z - q.z);
      if (dXZ < minClearance) return true;
    }
    return false;
  }

  const billboards = [];
  const bbFractions = [0.09, 0.27, 0.44, 0.63, 0.82];
  for (let i = 0; i < bbFractions.length; i++) {
    let idx = Math.floor(bbFractions[i] * SAMPLE_COUNT) % SAMPLE_COUNT;
    let guard = 0;
    while (isNearCrossing(idx, 26) && guard < 36) {
      idx = (idx + 3) % SAMPLE_COUNT;
      guard++;
    }
    const sObj = samples[idx];
    const side = i % 2 === 0 ? 1 : -1;
    const offsetDist = sObj.halfWidth + 4.8;
    // binormal points left (+1); right is -binormal
    const bx = sObj.x + sObj.bx * side * offsetDist;
    const bz = sObj.z + sObj.bz * side * offsetDist;
    const by = sObj.y + 4.0;
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
      width: 10.6,
      height: 4.5,
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
    const windowRadius = 28;
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

function buildRibbonGeometry(samples, leftFn, rightFn, uvScaleV = 0.125, flipWinding = false) {
  const n = samples.length;
  const positions = new Float32Array((n + 1) * 2 * 3);
  const normals = new Float32Array((n + 1) * 2 * 3);
  const uvs = new Float32Array((n + 1) * 2 * 2);
  const indices = [];

  for (let i = 0; i <= n; i++) {
    const s = samples[i % n];
    const l = leftFn(s);
    const r = rightFn(s);
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
        indices.push(a, c, b, b, c, d);
      } else {
        indices.push(a, b, c, b, d, c);
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

  const groundSize = track.id === "sunny_coast" ? 640 : 3200;
  const groundGeo = trackGeom(new THREE.PlaneGeometry(groundSize, groundSize));
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
  ground.position.z = -55;
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
        x: s.x + s.bx * s.halfWidth,
        y: s.y + s.ny * 0.02,
        z: s.z + s.bz * s.halfWidth
      }),
      (s) => ({
        x: s.x - s.bx * s.halfWidth,
        y: s.y + s.ny * 0.02,
        z: s.z - s.bz * s.halfWidth
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
  roadMesh.name = "road-surface";
  group.add(roadMesh);

  // 3. Curbs (offset outward [halfWidth, halfWidth + 1.15] & stepped +0.04m along normal)
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
        x: s.x + s.bx * (s.halfWidth + 1.15) + s.nx * 0.04,
        y: s.y + s.by * (s.halfWidth + 1.15) + s.ny * 0.04,
        z: s.z + s.bz * (s.halfWidth + 1.15) + s.nz * 0.04
      }),
      (s) => ({
        x: s.x + s.bx * s.halfWidth + s.nx * 0.04,
        y: s.y + s.by * s.halfWidth + s.ny * 0.04,
        z: s.z + s.bz * s.halfWidth + s.nz * 0.04
      }),
      1 / SAMPLE_COUNT
    )
  );
  group.add(new THREE.Mesh(leftCurbGeo, curbMat));

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
        x: s.x - s.bx * (s.halfWidth + 1.15) + s.nx * 0.04,
        y: s.y - s.by * (s.halfWidth + 1.15) + s.ny * 0.04,
        z: s.z - s.bz * (s.halfWidth + 1.15) + s.nz * 0.04
      }),
      1 / SAMPLE_COUNT
    )
  );
  group.add(new THREE.Mesh(rightCurbGeo, curbMat));

  // 4. Guardrails / Barriers (at ±(halfWidth + 1.30), height +0.85m)
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
    const railOffset = side * (track.halfWidth + 1.32);
    const railGeo = trackGeom(
      buildRibbonGeometry(
        samples,
        (s) => ({
          x: s.x + s.bx * railOffset + s.nx * 0.85,
          y: s.y + s.by * railOffset + s.ny * 0.85,
          z: s.z + s.bz * railOffset + s.nz * 0.85
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
        x: s.x - s.bx * (s.halfWidth + 1.25) - s.nx * 0.72,
        y: s.y - s.by * (s.halfWidth + 1.25) - s.ny * 0.72,
        z: s.z - s.bz * (s.halfWidth + 1.25) - s.nz * 0.72
      }),
      (s) => ({
        x: s.x + s.bx * (s.halfWidth + 1.25) - s.nx * 0.72,
        y: s.y + s.by * (s.halfWidth + 1.25) - s.ny * 0.72,
        z: s.z + s.bz * (s.halfWidth + 1.25) - s.nz * 0.72
      }),
      1 / SAMPLE_COUNT
    )
  );
  const deckMesh = new THREE.Mesh(deckGeo, undersideMat);
  deckMesh.name = "bridge-underside";
  group.add(deckMesh);

  // Outer deck side skirts (connects outer curb down to bridge underside)
  for (const side of [1, -1]) {
    const edgeOff = side * (track.halfWidth + 1.22);
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

  // Support pillars under elevated bridge stretches (avoiding lower deck roadway)
  const pillarGeo = trackGeom(new THREE.BoxGeometry(1.4, 1, 1.4));
  for (let i = 0; i < SAMPLE_COUNT; i += 14) {
    const s = samples[i];
    if (s.y < 2.6) continue;
    for (const side of [-1, 1]) {
      const px = s.x + s.bx * side * (s.halfWidth * 0.78);
      const pz = s.z + s.bz * side * (s.halfWidth * 0.78);
      // Skip if pillar would sit inside a lower roadway
      let overlapsLowerRoad = false;
      for (let j = 0; j < SAMPLE_COUNT; j += 2) {
        const dIdx = Math.min(Math.abs(j - i), SAMPLE_COUNT - Math.abs(j - i));
        if (dIdx < 40) continue;
        const q = samples[j];
        if (q.y < s.y - 2.0 && Math.hypot(px - q.x, pz - q.z) < q.halfWidth + 2.4) {
          overlapsLowerRoad = true;
          break;
        }
      }
      if (overlapsLowerRoad) continue;
      const h = Math.max(1.0, s.y - track.groundY + 0.5);
      const pillar = new THREE.Mesh(pillarGeo, undersideMat);
      pillar.scale.set(1, h, 1);
      pillar.position.set(px, track.groundY + h * 0.5 - 0.5, pz);
      pillar.name = "bridge-pillar";
      group.add(pillar);
    }
  }

  // 6. Start/Finish Line Stripe & Checkpoint Markers
  const startTex = trackTex(createStartCheckerTexture());
  const startLineGeo = trackGeom(new THREE.PlaneGeometry(track.halfWidth * 1.95, 3.4));
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

  // Subtle roadside checkpoint pylons
  const cpPoleGeo = trackGeom(new THREE.CylinderGeometry(0.18, 0.24, 3.6, 8));
  const cpBeaconGeo = trackGeom(new THREE.SphereGeometry(0.36, 10, 8));
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
      const ox = g.x + g.bx * side * (g.halfWidth + 1.55);
      const oy = g.y + g.by * side * (g.halfWidth + 1.55);
      const oz = g.z + g.bz * side * (g.halfWidth + 1.55);
      const pole = new THREE.Mesh(cpPoleGeo, cpPoleMat);
      pole.position.set(ox, oy + 1.8, oz);
      group.add(pole);

      const beacon = new THREE.Mesh(cpBeaconGeo, cpBeaconMat);
      beacon.position.set(ox, oy + 3.7, oz);
      group.add(beacon);
    }
  }

  // 7. Gantries (Start/Finish + mid-lap corner gantry) -> gantryAnchors for M3
  const gantryAnchors = [];
  const gantrySamples = [
    { sampleIdx: 0, label: "START / FINISH", preset: SPONSOR_PRESETS[0] },
    { sampleIdx: Math.floor(SAMPLE_COUNT * 0.52), label: "MID-SECTOR", preset: SPONSOR_PRESETS[3] }
  ];
  // Ensure mid-sector gantry isn't on an overpass crossing
  let midIdx = gantrySamples[1].sampleIdx;
  for (let attempt = 0; attempt < 30 && track.isNearCrossing(midIdx, 26); attempt++) {
    midIdx = (midIdx + 4) % SAMPLE_COUNT;
  }
  gantrySamples[1].sampleIdx = midIdx;

  const trussMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e2534, metalness: 0.65, roughness: 0.35 }));
  const postGeo = trackGeom(new THREE.BoxGeometry(0.85, 8.4, 0.85));

  for (let gIdx = 0; gIdx < gantrySamples.length; gIdx++) {
    const spec = gantrySamples[gIdx];
    const s = samples[spec.sampleIdx];
    const gantryGroup = new THREE.Group();
    gantryGroup.name = `gantry-${gIdx}`;
    gantryGroup.position.set(s.x, s.y, s.z);
    gantryGroup.rotation.y = s.angle;

    const span = s.halfWidth * 2 + 3.8;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, trussMat);
      post.position.set(side * (s.halfWidth + 1.75), 4.0, 0);
      gantryGroup.add(post);
    }

    const beamGeo = trackGeom(new THREE.BoxGeometry(span + 0.6, 0.75, 0.9));
    const beam = new THREE.Mesh(beamGeo, trussMat);
    beam.position.set(0, 7.9, 0);
    gantryGroup.add(beam);

    const bannerW = s.halfWidth * 1.65;
    const bannerH = 2.55;
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
    bannerMesh.position.set(0, 6.45, 0);
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
  const bbPoleGeo = trackGeom(new THREE.CylinderGeometry(0.22, 0.28, 6.2, 8));
  const bbBackingMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x161b26, metalness: 0.55, roughness: 0.45 }));

  for (let i = 0; i < track.billboards.length; i++) {
    const bb = track.billboards[i];
    const frameGroup = new THREE.Group();
    frameGroup.name = `billboard-${i}`;
    frameGroup.position.set(bb.x, bb.y - 4.0, bb.z);
    frameGroup.rotation.y = bb.angle;

    for (const px of [-bb.width * 0.34, bb.width * 0.34]) {
      const pole = new THREE.Mesh(bbPoleGeo, bbBackingMat);
      pole.position.set(px, 3.1, -0.25);
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

  // 9. Rich Low-Poly Scenery Props per Theme (kept safely outside road clearance)
  function isClearOfTrack(px, pz, margin = 15) {
    for (let j = 0; j < SAMPLE_COUNT; j += 3) {
      const s = samples[j];
      if (Math.hypot(px - s.x, pz - s.z) < s.halfWidth + margin) {
        return false;
      }
    }
    return true;
  }

  if (track.id === "sunny_coast") {
    const trunkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 }));
    const leafMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x2ec46d, roughness: 0.75 }));
    const trunkGeo = trackGeom(new THREE.CylinderGeometry(0.28, 0.45, 7.2, 7));
    const crownGeo = trackGeom(new THREE.ConeGeometry(3.2, 2.2, 7));

    for (let i = 0; i < SAMPLE_COUNT; i += 13) {
      const s = samples[i];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.halfWidth + 9 + (i % 5) * 2.5;
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

    // Coastal Lighthouse
    const lhPos = { x: 245, z: -15 };
    if (isClearOfTrack(lhPos.x, lhPos.z, 10)) {
      const lh = new THREE.Group();
      lh.position.set(lhPos.x, track.groundY, lhPos.z);
      const towerGeo = trackGeom(new THREE.CylinderGeometry(2.4, 4.2, 26, 10));
      const towerMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 }));
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.y = 13;
      lh.add(tower);

      const bandGeo = trackGeom(new THREE.CylinderGeometry(2.9, 3.4, 6, 10));
      const bandMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.7 }));
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.y = 14;
      lh.add(band);

      const capGeo = trackGeom(new THREE.SphereGeometry(2.3, 10, 8));
      const capMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xf3db5b }));
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 26.5;
      lh.add(cap);
      group.add(lh);
    }
  } else if (track.id === "canyon_loop") {
    const mesaMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xa64d2e, roughness: 0.92 }));
    const mesaTopMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xd9804c, roughness: 0.9 }));
    const cactusMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b8c52, roughness: 0.8 }));
    const mesaGeo = trackGeom(new THREE.CylinderGeometry(12, 18, 22, 7));
    const cactusGeo = trackGeom(new THREE.CylinderGeometry(0.42, 0.48, 5.2, 7));

    const mesaCoords = [
      [270, 90, 1.4],
      [-210, 40, 1.8],
      [-185, -270, 1.5],
      [230, -230, 1.3],
      [45, -130, 0.85]
    ];
    for (let m = 0; m < mesaCoords.length; m++) {
      const [mx, mz, sc] = mesaCoords[m];
      if (!isClearOfTrack(mx, mz, 16 * sc)) continue;
      const mesa = new THREE.Mesh(mesaGeo, m % 2 === 0 ? mesaMat : mesaTopMat);
      mesa.scale.set(sc, 0.9 + (m % 3) * 0.35, sc);
      mesa.position.set(mx, track.groundY + 10 * sc, mz);
      group.add(mesa);
    }

    for (let i = 0; i < SAMPLE_COUNT; i += 17) {
      const s = samples[i];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.halfWidth + 11 + (i % 4) * 3;
      const px = s.x + s.bx * side * dist;
      const pz = s.z + s.bz * side * dist;
      if (!isClearOfTrack(px, pz, 5.5)) continue;

      const cactus = new THREE.Mesh(cactusGeo, cactusMat);
      cactus.position.set(px, track.groundY + 2.6, pz);
      group.add(cactus);
    }
  } else {
    // neon_circuit cyber pylons & towers
    const pylonBodyGeo = trackGeom(new THREE.BoxGeometry(1.4, 9.5, 1.4));
    const pylonStripGeo = trackGeom(new THREE.BoxGeometry(1.5, 8.8, 0.35));
    const pylonMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x101829, metalness: 0.6, roughness: 0.35 }));
    const neonColors = [0x3c83ef, 0xff2e93, 0xf3db5b, 0x00e5ff];
    const neonMats = neonColors.map((col) =>
      trackMat(new THREE.MeshBasicMaterial({ color: col }))
    );

    for (let i = 0; i < SAMPLE_COUNT; i += 15) {
      const s = samples[i];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.halfWidth + 6.5 + (i % 3) * 3.0;
      const px = s.x + s.bx * side * dist;
      const pz = s.z + s.bz * side * dist;
      if (!isClearOfTrack(px, pz, 4.5)) continue;

      const hScale = 1.0 + (i % 4) * 0.45;
      const pylon = new THREE.Group();
      pylon.position.set(px, track.groundY + (9.5 * hScale) * 0.5, pz);
      pylon.rotation.y = s.angle;

      const body = new THREE.Mesh(pylonBodyGeo, pylonMat);
      body.scale.y = hScale;
      pylon.add(body);

      const strip = new THREE.Mesh(pylonStripGeo, neonMats[i % neonMats.length]);
      strip.scale.y = hScale;
      pylon.add(strip);
      group.add(pylon);
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
