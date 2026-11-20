import * as VendorTHREE from "./vendor/three.module.min.js";

function finiteOr(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function clamp(v, lo, hi, fallback = lo) {
  if (!Number.isFinite(v)) return fallback;
  return v < lo ? lo : v > hi ? hi : v;
}

export function computeSpeedLinesState({
  speedKmh = 0,
  maxSpeedKmh = 160,
  boostTier = 0,
  isBoosting = false
} = {}) {
  const spd = Math.abs(finiteOr(speedKmh, 0));
  const maxSpd = Math.max(40, finiteOr(maxSpeedKmh, 160));
  const tier = clamp(Math.round(finiteOr(boostTier, 0)), 0, 3, 0);
  const boosting = !!isBoosting;

  const speedRatio = clamp((spd - maxSpd * 0.58) / (maxSpd * 0.42), 0, 1, 0);
  const boostFactor = boosting ? clamp(0.45 + tier * 0.18, 0, 1, 0.5) : 0;
  const intensity = clamp(Math.max(speedRatio * 0.72, boostFactor), 0, 1, 0);
  const active = intensity > 0.05;
  const opacity = active ? clamp(intensity * 0.75, 0, 0.85, 0) : 0;
  const lineCount = active ? Math.round(12 + intensity * 28) : 0;

  return {
    active,
    intensity,
    opacity,
    lineCount,
    boostTier: boosting ? Math.max(1, tier) : 0
  };
}

function createSoftSmokeTexture(THREE) {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.5, "rgba(230,235,245,0.55)");
  grad.addColorStop(1, "rgba(220,225,235,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createVfx(threeOrScene, sceneOrOpts = null, maybeOpts = {}) {
  let THREE = VendorTHREE;
  let scene = null;
  let options = {};

  if (threeOrScene && typeof threeOrScene.InstancedMesh === "function") {
    THREE = threeOrScene;
    scene = sceneOrOpts;
    options = maybeOpts || {};
  } else {
    scene = threeOrScene;
    options = sceneOrOpts || {};
  }

  const MAX_SKIDS = 280;
  const MAX_SMOKE = 176;
  const MAX_SPARKS = 96;
  const HIDDEN_Y = -9999;
  const SMOKE_INTERVAL = 1 / 55;
  const SKID_INTERVAL = 0.024;

  let disposed = false;
  const disposables = [];

  // Reusable math scratch objects (zero per-frame allocations)
  const _mat4 = new THREE.Matrix4();
  const _pos = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const _quatYaw = new THREE.Quaternion();
  const _scale = new THREE.Vector3(1, 1, 1);
  const _zeroScale = new THREE.Vector3(0, 0, 0);
  const _up = new THREE.Vector3(0, 1, 0);
  const _normal = new THREE.Vector3(0, 1, 0);
  const _fwd = new THREE.Vector3(0, 0, 1);

  // 1. Pooled Skid Marks (InstancedMesh ring buffer)
  // One quad per wheel per tick, stretched between the last and current contact
  // patch so the two ribbons read as continuous parallel lines instead of beads.
  const SKID_LEN = 1.5;
  const skidGeo = new THREE.PlaneGeometry(0.30, SKID_LEN);
  skidGeo.rotateX(-Math.PI / 2);
  disposables.push(skidGeo);

  const skidMat = new THREE.MeshBasicMaterial({
    color: 0x10131a,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide
  });
  disposables.push(skidMat);

  const skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, MAX_SKIDS);
  skidMesh.name = "vfx-skid-marks";
  skidMesh.frustumCulled = false;
  skidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < MAX_SKIDS; i++) {
    _mat4.compose(_pos.set(0, HIDDEN_Y, 0), _quat.identity(), _zeroScale);
    skidMesh.setMatrixAt(i, _mat4);
  }
  skidMesh.instanceMatrix.needsUpdate = true;
  if (scene && typeof scene.add === "function") scene.add(skidMesh);

  let skidCursor = 0;
  let skidTimer = 0;
  // Per-side last ribbon contact point (null = pen lift, start a fresh ribbon)
  const skidLast = [null, null];
  let smokeTimer = 0;
  let sparkTimer = 0;
  let wasBoosting = false;

  // 2. Pooled Tire Smoke (Points ring buffer)
  const smokePositions = new Float32Array(MAX_SMOKE * 3);
  const smokeColors = new Float32Array(MAX_SMOKE * 3);
  const smokeVel = new Float32Array(MAX_SMOKE * 3);
  const smokeLife = new Float32Array(MAX_SMOKE);
  const smokeMaxLife = new Float32Array(MAX_SMOKE);
  const smokeBaseY = new Float32Array(MAX_SMOKE);
  const smokeBaseCol = new Float32Array(MAX_SMOKE * 3);

  for (let i = 0; i < MAX_SMOKE; i++) {
    smokePositions[i * 3 + 1] = HIDDEN_Y;
  }

  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute("position", new THREE.BufferAttribute(smokePositions, 3));
  smokeGeo.setAttribute("color", new THREE.BufferAttribute(smokeColors, 3));
  disposables.push(smokeGeo);

  const smokeTex = createSoftSmokeTexture(THREE);
  if (smokeTex) disposables.push(smokeTex);

  const smokeMat = new THREE.PointsMaterial({
    size: 1.08,
    map: smokeTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    sizeAttenuation: true
  });
  disposables.push(smokeMat);

  const smokePoints = new THREE.Points(smokeGeo, smokeMat);
  smokePoints.name = "vfx-smoke";
  smokePoints.frustumCulled = false;
  if (scene && typeof scene.add === "function") scene.add(smokePoints);

  let smokeCursor = 0;

  // 3. Pooled Collision Sparks (Additive Points ring buffer)
  const sparkPositions = new Float32Array(MAX_SPARKS * 3);
  const sparkColors = new Float32Array(MAX_SPARKS * 3);
  const sparkVel = new Float32Array(MAX_SPARKS * 3);
  const sparkLife = new Float32Array(MAX_SPARKS);
  const sparkMaxLife = new Float32Array(MAX_SPARKS);
  const sparkBaseY = new Float32Array(MAX_SPARKS);

  for (let i = 0; i < MAX_SPARKS; i++) {
    sparkPositions[i * 3 + 1] = HIDDEN_Y;
  }

  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkColors, 3));
  disposables.push(sparkGeo);

  const sparkMat = new THREE.PointsMaterial({
    size: 0.44,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });
  disposables.push(sparkMat);

  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.name = "vfx-sparks";
  sparkPoints.frustumCulled = false;
  if (scene && typeof scene.add === "function") scene.add(sparkPoints);

  let sparkCursor = 0;

  // 4. Pooled Boost Exhaust Flames
  const flameGroup = new THREE.Group();
  flameGroup.name = "vfx-boost-flames";
  flameGroup.visible = false;

  const outerFlameGeo = new THREE.ConeGeometry(0.18, 0.95, 10);
  outerFlameGeo.rotateX(-Math.PI / 2);
  outerFlameGeo.translate(0, 0, -0.48);
  disposables.push(outerFlameGeo);

  const innerFlameGeo = new THREE.ConeGeometry(0.09, 0.56, 8);
  innerFlameGeo.rotateX(-Math.PI / 2);
  innerFlameGeo.translate(0, 0, -0.28);
  disposables.push(innerFlameGeo);

  const outerFlameMat = new THREE.MeshBasicMaterial({
    color: 0xff9a1f,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const innerFlameMat = new THREE.MeshBasicMaterial({
    color: 0xfff5d6,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  disposables.push(outerFlameMat, innerFlameMat);

  const flamePairs = [];
  for (const xOff of [-0.46, 0.46]) {
    const pipe = new THREE.Group();
    pipe.position.set(xOff, 0.34, -2.12);
    const outer = new THREE.Mesh(outerFlameGeo, outerFlameMat);
    const inner = new THREE.Mesh(innerFlameGeo, innerFlameMat);
    pipe.add(outer);
    pipe.add(inner);
    flameGroup.add(pipe);
    flamePairs.push(pipe);
  }
  if (scene && typeof scene.add === "function") scene.add(flameGroup);

  // Optional self-cleaning 2D speed-lines canvas overlay
  let overlayCanvas = null;
  let overlayCtx = null;
  let resizeHandler = null;
  if (
    options &&
    options.overlayContainer &&
    typeof document !== "undefined" &&
    typeof document.createElement === "function"
  ) {
    overlayCanvas = document.createElement("canvas");
    overlayCanvas.style.position = "absolute";
    overlayCanvas.style.inset = "0";
    overlayCanvas.style.width = "100%";
    overlayCanvas.style.height = "100%";
    overlayCanvas.style.pointerEvents = "none";
    const syncSize = () => {
      if (!overlayCanvas) return;
      overlayCanvas.width = Math.max(1, options.overlayContainer.clientWidth || 1280);
      overlayCanvas.height = Math.max(1, options.overlayContainer.clientHeight || 720);
    };
    syncSize();
    options.overlayContainer.appendChild(overlayCanvas);
    overlayCtx = overlayCanvas.getContext("2d");
    if (typeof globalThis !== "undefined" && typeof globalThis.addEventListener === "function") {
      resizeHandler = syncSize;
      globalThis.addEventListener("resize", resizeHandler);
    }
  }

  let lastCollisionPulse = 0;
  let elapsed = 0;
  let speedLinesState = computeSpeedLinesState();

  function emit(x, y, z, r = 0.85, g = 0.87, b = 0.92, life = 0.55) {
    if (disposed) return;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const i = smokeCursor;
    smokeCursor = (smokeCursor + 1) % MAX_SMOKE;
    const idx3 = i * 3;
    smokePositions[idx3] = x;
    smokePositions[idx3 + 1] = y;
    smokePositions[idx3 + 2] = z;

    smokeVel[idx3] = (Math.random() - 0.5) * 1.4;
    smokeVel[idx3 + 1] = 0.85 + Math.random() * 0.9;
    smokeVel[idx3 + 2] = (Math.random() - 0.5) * 1.4;

    smokeBaseCol[idx3] = clamp(r, 0, 1, 0.85);
    smokeBaseCol[idx3 + 1] = clamp(g, 0, 1, 0.87);
    smokeBaseCol[idx3 + 2] = clamp(b, 0, 1, 0.92);

    smokeColors[idx3] = smokeBaseCol[idx3];
    smokeColors[idx3 + 1] = smokeBaseCol[idx3 + 1];
    smokeColors[idx3 + 2] = smokeBaseCol[idx3 + 2];

    const l = clamp(life, 0.08, 2.0, 0.55);
    smokeLife[i] = l;
    smokeMaxLife[i] = l;
    smokeBaseY[i] = y - 0.08;
  }

  function emitSkidSegment(pos, normal = null, forwardDir = null, intensity = 1, stretch = 1) {
    if (disposed) return;
    const px = finiteOr(pos?.x, NaN);
    const py = finiteOr(pos?.y, NaN);
    const pz = finiteOr(pos?.z, NaN);
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) return;

    const nx = finiteOr(normal?.x, 0);
    const ny = finiteOr(normal?.y, 1);
    const nz = finiteOr(normal?.z, 0);
    _normal.set(nx, ny, nz);
    if (_normal.lengthSq() < 1e-6) _normal.set(0, 1, 0);
    _normal.normalize();

    let yaw = 0;
    if (typeof forwardDir === "number") {
      yaw = finiteOr(forwardDir, 0);
    } else if (forwardDir && Number.isFinite(forwardDir.x) && Number.isFinite(forwardDir.z)) {
      yaw = Math.atan2(forwardDir.x, forwardDir.z);
    }

    _quat.setFromUnitVectors(_up, _normal);
    _quatYaw.setFromAxisAngle(_up, yaw);
    _quat.multiply(_quatYaw);

    _pos.set(
      px + _normal.x * 0.035,
      py + _normal.y * 0.035,
      pz + _normal.z * 0.035
    );
    const widthScale = clamp(intensity, 0.4, 1.35, 1.0);
    const lenScale = clamp(stretch, 0.5, 3.0, 1.0);
    _scale.set(widthScale, 1, lenScale);

    _mat4.compose(_pos, _quat, _scale);
    skidMesh.setMatrixAt(skidCursor, _mat4);
    skidCursor = (skidCursor + 1) % MAX_SKIDS;
    skidMesh.instanceMatrix.needsUpdate = true;
  }

  // Stitch a ribbon segment between the last and current wheel contact patch.
  // Returns the new contact point so the caller can keep per-side continuity.
  function layRibbon(sideIdx, x, y, z, normal, fallbackYaw, intensity) {
    const prev = skidLast[sideIdx];
    skidLast[sideIdx] = { x, y, z };
    if (!prev) return;

    const dx = x - prev.x;
    const dz = z - prev.z;
    const dist = Math.hypot(dx, dz);
    if (!Number.isFinite(dist) || dist < 0.02) return;
    // Jumped (respawn / teleport): start a new ribbon instead of smearing a line
    if (dist > 4.5) return;

    const yaw = Math.abs(dx) + Math.abs(dz) > 1e-4 ? Math.atan2(dx, dz) : fallbackYaw;
    emitSkidSegment(
      { x: (prev.x + x) * 0.5, y: y, z: (prev.z + z) * 0.5 },
      normal,
      yaw,
      intensity,
      (dist / SKID_LEN) * 1.04
    );
  }

  function emitCollisionSparks(x, y, z, intensity = 1, normal = null) {
    if (disposed) return;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const count = Math.round(clamp(intensity * 18, 8, 28, 16));
    const nX = finiteOr(normal?.x, 0);
    const nY = finiteOr(normal?.y, 0.5);
    const nZ = finiteOr(normal?.z, 0);

    for (let c = 0; c < count; c++) {
      const i = sparkCursor;
      sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
      const idx3 = i * 3;
      sparkPositions[idx3] = x + (Math.random() - 0.5) * 0.6;
      sparkPositions[idx3 + 1] = y + 0.3 + Math.random() * 0.35;
      sparkPositions[idx3 + 2] = z + (Math.random() - 0.5) * 0.6;

      sparkVel[idx3] = nX * 5 + (Math.random() - 0.5) * 14;
      sparkVel[idx3 + 1] = 3.5 + nY * 4 + Math.random() * 6.5;
      sparkVel[idx3 + 2] = nZ * 5 + (Math.random() - 0.5) * 14;

      sparkColors[idx3] = 1.0;
      sparkColors[idx3 + 1] = 0.62 + Math.random() * 0.35;
      sparkColors[idx3 + 2] = 0.15;

      const l = 0.28 + Math.random() * 0.32;
      sparkLife[i] = l;
      sparkMaxLife[i] = l;
      sparkBaseY[i] = y + 0.06;
    }
  }

  // Ground-hugging kerb sparks thrown off a rear tire mid-drift.
  function emitKerbSparks(x, y, z, sideSign = 1, intensity = 1) {
    if (disposed) return;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const count = Math.round(clamp(intensity * 7, 3, 10, 5));
    for (let c = 0; c < count; c++) {
      const i = sparkCursor;
      sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
      const idx3 = i * 3;
      sparkPositions[idx3] = x + (Math.random() - 0.5) * 0.16;
      sparkPositions[idx3 + 1] = y + 0.05 + Math.random() * 0.08;
      sparkPositions[idx3 + 2] = z + (Math.random() - 0.5) * 0.16;

      sparkVel[idx3] = sideSign * (1.4 + Math.random() * 2.6) + (Math.random() - 0.5) * 2.0;
      sparkVel[idx3 + 1] = 1.1 + Math.random() * 2.4;
      sparkVel[idx3 + 2] = -1.2 + Math.random() * 2.4;

      sparkColors[idx3] = 1.0;
      sparkColors[idx3 + 1] = 0.66 + Math.random() * 0.3;
      sparkColors[idx3 + 2] = 0.16;

      const l = 0.16 + Math.random() * 0.22;
      sparkLife[i] = l;
      sparkMaxLife[i] = l;
      sparkBaseY[i] = y + 0.02;
    }
  }

  function renderSpeedLinesOverlay() {
    if (!overlayCtx || !overlayCanvas) return;
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;
    overlayCtx.clearRect(0, 0, w, h);
    if (!speedLinesState.active) return;

    const cx = w * 0.5;
    const cy = h * 0.5;
    const maxR = Math.hypot(cx, cy);
    const innerR = maxR * (0.58 - speedLinesState.intensity * 0.14);

    overlayCtx.save();
    overlayCtx.strokeStyle =
      speedLinesState.boostTier >= 2
        ? `rgba(0, 229, 255, ${speedLinesState.opacity})`
        : `rgba(255, 255, 255, ${speedLinesState.opacity})`;
    overlayCtx.lineWidth = 2;
    for (let i = 0; i < speedLinesState.lineCount; i++) {
      const angle = ((i / speedLinesState.lineCount) * Math.PI * 2) + (elapsed * 3.1 + i * 0.7);
      const r0 = innerR + ((i * 37) % 45);
      overlayCtx.beginPath();
      overlayCtx.moveTo(cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0);
      overlayCtx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
      overlayCtx.stroke();
    }
    overlayCtx.restore();
  }

  function update(dt, player, isDrifting = false, isBoosting = false, extra = {}) {
    if (disposed) return;
    const dtSafe = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    elapsed += dtSafe;

    const px = finiteOr(player?.pos?.x, NaN);
    const py = finiteOr(player?.pos?.y, 0);
    const pz = finiteOr(player?.pos?.z, NaN);
    const yaw = finiteOr(player?.yaw, 0);
    const hasValidPlayer = Number.isFinite(px) && Number.isFinite(pz);

    const driftActive = !!(isDrifting || player?.drifting);
    const boostActive = !!(isBoosting || (player && player.boostTime > 0));
    const boostTier = clamp(
      finiteOr(
        extra?.boostTier ?? player?.activeBoostTier ?? player?.boostTier,
        boostActive ? 1 : 0
      ),
      0,
      3,
      0
    );

    const surfNorm = extra?.surfaceNormal || player?.surfaceNormal || _up;
    const speedKmhVal = finiteOr(
      extra?.speedKmh ?? (Number.isFinite(player?.speed) ? player.speed * 3.6 : 0),
      0
    );
    const maxSpeedKmhVal = finiteOr(
      extra?.maxSpeedKmh ?? (player?.def?.maxSpeed ? player.def.maxSpeed * 3.6 : 160),
      160
    );

    speedLinesState = computeSpeedLinesState({
      speedKmh: speedKmhVal,
      maxSpeedKmh: maxSpeedKmhVal,
      boostTier,
      isBoosting: boostActive
    });

    if (hasValidPlayer && dtSafe > 0) {
      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      // Car-left is (+cosY, -sinY)
      const leftX = Math.cos(yaw);
      const leftZ = -Math.sin(yaw);
      const rearDist = 1.42;
      const trackHalf = 0.78;

      const rearCenterX = px - sinY * rearDist;
      const rearCenterZ = pz - cosY * rearDist;

      const rlX = rearCenterX + leftX * trackHalf;
      const rlZ = rearCenterZ + leftZ * trackHalf;
      const rrX = rearCenterX - leftX * trackHalf;
      const rrZ = rearCenterZ - leftZ * trackHalf;

      // Skid marks & tire smoke during drift
      const slipMag = Math.abs(finiteOr(player?.slip, 0));
      if (driftActive) {
        const driftIntensity = clamp(0.75 + slipMag * 0.9, 0.7, 1.3, 1.0);

        // Continuous twin skid ribbons: stitch each side between successive
        // contact patches so the marks read as solid lines, not dashes.
        skidTimer += dtSafe;
        if (skidTimer >= SKID_INTERVAL) {
          skidTimer = 0;
          layRibbon(0, rlX, py, rlZ, surfNorm, yaw, driftIntensity);
          layRibbon(1, rrX, py, rrZ, surfNorm, yaw, driftIntensity);
        }

        // Layered smoke: two puffs per rear tire with jitter for volume
        smokeTimer += dtSafe;
        if (smokeTimer >= SMOKE_INTERVAL) {
          smokeTimer = 0;
          for (const side of [1, -1]) {
            const wx = rearCenterX + leftX * trackHalf * side;
            const wz = rearCenterZ + leftZ * trackHalf * side;
            for (let p = 0; p < 2; p++) {
              emit(
                wx + (Math.random() - 0.5) * 0.34,
                py + 0.12 + Math.random() * 0.16,
                wz + (Math.random() - 0.5) * 0.34,
                0.86,
                0.88,
                0.93,
                0.55 + Math.random() * 0.2
              );
            }
          }
        }

        // Kerb sparks: the outside tire grinds the shoulder above ~60 km/h
        if (speedKmhVal > 60) {
          sparkTimer += dtSafe;
          const sparkRate = 1 / clamp(speedKmhVal / 42, 0.6, 2.4, 1.0);
          if (sparkTimer >= sparkRate) {
            sparkTimer = 0;
            const side = Math.random() < 0.5 ? 1 : -1;
            const wx = rearCenterX + leftX * trackHalf * side;
            const wz = rearCenterZ + leftZ * trackHalf * side;
            emitKerbSparks(wx, py + 0.02, wz, side, clamp(speedKmhVal / 90, 0.5, 1.4, 1.0));
          }
        }
      } else {
        // Lift the pen so the next drift starts a clean pair of ribbons
        skidLast[0] = null;
        skidLast[1] = null;
        skidTimer = 0;
        smokeTimer = 0;
        sparkTimer = 0;
      }

      // Collision spark burst on rising collisionPulse
      const colPulse = finiteOr(player?.collisionPulse, 0);
      if (colPulse > 0.18 && colPulse > lastCollisionPulse + 0.08) {
        emitCollisionSparks(px, py + 0.35, pz, clamp(colPulse, 0.4, 1.5, 0.8), surfNorm);
      }
      lastCollisionPulse = colPulse;

      // Boost exhaust flames + embers
      if (boostActive) {
        flameGroup.visible = true;
        flameGroup.position.set(px, py + finiteOr(player?.spring?.bounceY, 0), pz);
        flameGroup.rotation.set(
          (finiteOr(player?.surfacePitchDeg, 0) * Math.PI) / 180,
          yaw,
          0
        );

        const outerHex =
          boostTier >= 3 ? 0xd946ef : boostTier === 2 ? 0x00e5ff : 0xff9a1f;
        const innerHex = boostTier >= 2 ? 0xffffff : 0xfff5c0;
        outerFlameMat.color.setHex(outerHex);
        innerFlameMat.color.setHex(innerHex);

        const flicker = 0.85 + 0.35 * Math.sin(elapsed * 55) + Math.random() * 0.2;
        const tierLen = 0.85 + boostTier * 0.35;
        for (let f = 0; f < flamePairs.length; f++) {
          flamePairs[f].scale.set(0.85 + boostTier * 0.12, 0.85 + boostTier * 0.12, tierLen * flicker);
        }
        emit(rearCenterX, py + 0.34, rearCenterZ, 1.0, boostTier >= 2 ? 0.85 : 0.55, 0.25, 0.28);
      } else {
        flameGroup.visible = false;
      }

      // After-fire: a short pop of unburnt fuel when the boost cuts out
      if (wasBoosting && !boostActive) {
        const exDist = 2.12;
        const exX = px - sinY * exDist;
        const exZ = pz - cosY * exDist;
        const exY = py + finiteOr(player?.spring?.bounceY, 0) + 0.32;
        for (const side of [1, -1]) {
          const px2 = exX + leftX * 0.46 * side;
          const pz2 = exZ + leftZ * 0.46 * side;
          for (let p = 0; p < 5; p++) {
            emit(
              px2 + (Math.random() - 0.5) * 0.22,
              exY + (Math.random() - 0.5) * 0.14,
              pz2 + (Math.random() - 0.5) * 0.22,
              1.0,
              0.5 + Math.random() * 0.2,
              0.14,
              0.24 + Math.random() * 0.18
            );
          }
          emitKerbSparks(px2, exY - 0.1, pz2, side * 0.4, 0.55);
        }
      }
      wasBoosting = boostActive;
    } else if (!boostActive) {
      flameGroup.visible = false;
    }

    // Advance smoke particle ring buffer
    let smokeDirty = false;
    for (let i = 0; i < MAX_SMOKE; i++) {
      if (smokeLife[i] <= 0) continue;
      smokeDirty = true;
      smokeLife[i] -= dtSafe;
      const idx3 = i * 3;
      if (smokeLife[i] <= 0) {
        smokePositions[idx3 + 1] = HIDDEN_Y;
        smokeColors[idx3] = 0;
        smokeColors[idx3 + 1] = 0;
        smokeColors[idx3 + 2] = 0;
      } else {
        smokePositions[idx3] += smokeVel[idx3] * dtSafe;
        smokePositions[idx3 + 1] = Math.max(
          smokeBaseY[i],
          smokePositions[idx3 + 1] + smokeVel[idx3 + 1] * dtSafe
        );
        smokePositions[idx3 + 2] += smokeVel[idx3 + 2] * dtSafe;

        const fade = clamp(smokeLife[i] / Math.max(0.01, smokeMaxLife[i]), 0, 1, 0);
        smokeColors[idx3] = smokeBaseCol[idx3] * fade;
        smokeColors[idx3 + 1] = smokeBaseCol[idx3 + 1] * fade;
        smokeColors[idx3 + 2] = smokeBaseCol[idx3 + 2] * fade;
      }
    }
    if (smokeDirty || driftActive || boostActive) {
      smokeGeo.attributes.position.needsUpdate = true;
      smokeGeo.attributes.color.needsUpdate = true;
    }

    // Advance spark particle ring buffer
    let sparkDirty = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (sparkLife[i] <= 0) continue;
      sparkDirty = true;
      sparkLife[i] -= dtSafe;
      const idx3 = i * 3;
      if (sparkLife[i] <= 0) {
        sparkPositions[idx3 + 1] = HIDDEN_Y;
        sparkColors[idx3] = 0;
        sparkColors[idx3 + 1] = 0;
        sparkColors[idx3 + 2] = 0;
      } else {
        sparkVel[idx3 + 1] -= 16 * dtSafe;
        sparkPositions[idx3] += sparkVel[idx3] * dtSafe;
        sparkPositions[idx3 + 1] += sparkVel[idx3 + 1] * dtSafe;
        sparkPositions[idx3 + 2] += sparkVel[idx3 + 2] * dtSafe;
        if (sparkPositions[idx3 + 1] < sparkBaseY[i]) {
          sparkPositions[idx3 + 1] = sparkBaseY[i];
          sparkVel[idx3 + 1] = Math.abs(sparkVel[idx3 + 1]) * 0.45;
        }
        const fade = clamp(sparkLife[i] / Math.max(0.01, sparkMaxLife[i]), 0, 1, 0);
        sparkColors[idx3] = 1.0 * fade;
        sparkColors[idx3 + 1] = 0.72 * fade;
        sparkColors[idx3 + 2] = 0.18 * fade;
      }
    }
    if (sparkDirty) {
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;
    }

    renderSpeedLinesOverlay();
  }

  function getSpeedLinesState() {
    return speedLinesState;
  }

  function reset() {
    if (disposed) return;
    skidCursor = 0;
    skidTimer = 0;
    skidLast[0] = null;
    skidLast[1] = null;
    smokeTimer = 0;
    sparkTimer = 0;
    wasBoosting = false;
    smokeCursor = 0;
    sparkCursor = 0;
    lastCollisionPulse = 0;
    flameGroup.visible = false;
    speedLinesState = computeSpeedLinesState();

    for (let i = 0; i < MAX_SKIDS; i++) {
      _mat4.compose(_pos.set(0, HIDDEN_Y, 0), _quat.identity(), _zeroScale);
      skidMesh.setMatrixAt(i, _mat4);
    }
    skidMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < MAX_SMOKE; i++) {
      smokeLife[i] = 0;
      smokePositions[i * 3 + 1] = HIDDEN_Y;
    }
    smokeGeo.attributes.position.needsUpdate = true;
    smokeGeo.attributes.color.needsUpdate = true;

    for (let i = 0; i < MAX_SPARKS; i++) {
      sparkLife[i] = 0;
      sparkPositions[i * 3 + 1] = HIDDEN_Y;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;

    if (overlayCtx && overlayCanvas) {
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (scene && typeof scene.remove === "function") {
      scene.remove(skidMesh);
      scene.remove(smokePoints);
      scene.remove(sparkPoints);
      scene.remove(flameGroup);
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
    if (resizeHandler && typeof globalThis !== "undefined" && typeof globalThis.removeEventListener === "function") {
      globalThis.removeEventListener("resize", resizeHandler);
      resizeHandler = null;
    }
    if (overlayCanvas && overlayCanvas.parentNode) {
      overlayCanvas.parentNode.removeChild(overlayCanvas);
    }
    overlayCanvas = null;
    overlayCtx = null;
  }

  return {
    points: smokePoints,
    smokePoints,
    sparkPoints,
    skidMesh,
    flameGroup,
    emit,
    emitSkidSegment,
    emitCollisionSparks,
    update,
    getSpeedLinesState,
    reset,
    dispose
  };
}
