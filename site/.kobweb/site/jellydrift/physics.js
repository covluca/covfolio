import { getCar, MAX_TOP_SPEED_MS } from "./cars.js";

export const FIXED_DT = 1 / 60;
export const MAX_SLIP_RAD = 1.01; // ~57.8 deg (< 75 deg E2E cap)
export const MAX_SLIP = MAX_SLIP_RAD;

const GRAVITY = 26.0;
const CAR_RADIUS = 0.95;

export function clamp(v, lo, hi, fallback = lo) {
  if (!Number.isFinite(v)) return fallback;
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngleRad(a) {
  if (!Number.isFinite(a)) return 0;
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

export function boostTierFor(charge) {
  const c = clamp(charge, 0, 1, 0);
  if (c >= 0.85) return 3;
  if (c >= 0.55) return 2;
  if (c >= 0.25) return 1;
  return 0;
}

function stepSpringChannel(val, vel, target, omega, zeta, dt) {
  const v = Number.isFinite(val) ? val : 0;
  const vl = Number.isFinite(vel) ? vel : 0;
  const t = Number.isFinite(target) ? target : 0;
  const acc = omega * omega * (t - v) - 2 * zeta * omega * vl;
  const nextVel = vl + acc * dt;
  const nextVal = v + nextVel * dt;
  return [
    Number.isFinite(nextVal) ? nextVal : 0,
    Number.isFinite(nextVel) ? nextVel : 0
  ];
}

function sanitizeState(s, track) {
  if (!s || typeof s !== "object") return;
  const start = track && track.start ? track.start : { x: 0, y: 0, z: 0, angle: 0 };

  if (!s.pos || typeof s.pos !== "object") s.pos = { x: start.x, y: start.y || 0, z: start.z };
  if (!Number.isFinite(s.pos.x)) s.pos.x = start.x || 0;
  if (!Number.isFinite(s.pos.y)) s.pos.y = start.y || 0;
  if (!Number.isFinite(s.pos.z)) s.pos.z = start.z || 0;

  if (!s.vel || typeof s.vel !== "object") s.vel = { x: 0, z: 0 };
  if (!Number.isFinite(s.vel.x)) s.vel.x = 0;
  if (!Number.isFinite(s.vel.z)) s.vel.z = 0;

  if (!Number.isFinite(s.yaw)) s.yaw = start.angle || 0;
  s.yaw = wrapAngleRad(s.yaw);

  if (!Number.isFinite(s.speed)) s.speed = 0;
  if (!Number.isFinite(s.vLateral)) s.vLateral = 0;
  if (!Number.isFinite(s.slip)) s.slip = 0;
  if (!Number.isFinite(s.steerAngle)) s.steerAngle = 0;
  if (!Number.isFinite(s.boostCharge)) s.boostCharge = 0;
  s.boostCharge = clamp(s.boostCharge, 0, 1, 0);
  if (!Number.isFinite(s.boostTime)) s.boostTime = 0;
  if (!Number.isFinite(s.driftScore)) s.driftScore = 0;
  if (!Number.isFinite(s.time)) s.time = 0;
  if (!Number.isFinite(s.verticalVel)) s.verticalVel = 0;
  if (!Number.isFinite(s.prevGroundY)) s.prevGroundY = s.pos.y;
  if (!Number.isFinite(s.prevSlopeVelY)) s.prevSlopeVelY = 0;
  if (!Number.isFinite(s.wallCooldown)) s.wallCooldown = 0;
  if (!Number.isFinite(s.collisionPulse)) s.collisionPulse = 0;
  if (!Number.isFinite(s.driftGraceTimer)) s.driftGraceTimer = 0;
  if (!Number.isFinite(s.surfacePitchDeg)) s.surfacePitchDeg = 0;
  if (!Number.isFinite(s.surfaceRollDeg)) s.surfaceRollDeg = 0;
  if (!s.surfaceNormal || typeof s.surfaceNormal !== "object") {
    s.surfaceNormal = { x: 0, y: 1, z: 0 };
  }

  if (!s.spring || typeof s.spring !== "object") {
    s.spring = { pitchDeg: 0, rollDeg: 0, squash: 0, bounceY: 0 };
  }
  if (!s.springVel || typeof s.springVel !== "object") {
    s.springVel = { pitchDeg: 0, rollDeg: 0, squash: 0, bounceY: 0 };
  }
  for (const key of ["pitchDeg", "rollDeg", "squash", "bounceY"]) {
    if (!Number.isFinite(s.spring[key])) s.spring[key] = 0;
    if (!Number.isFinite(s.springVel[key])) s.springVel[key] = 0;
  }
  s.spring.pitchDeg = clamp(s.spring.pitchDeg, -24, 24, 0);
  s.spring.rollDeg = clamp(s.spring.rollDeg, -28, 28, 0);
  s.spring.squash = clamp(s.spring.squash, -0.35, 0.45, 0);
  s.spring.bounceY = clamp(s.spring.bounceY, -0.6, 0.6, 0);
}

export function createCarPhysicsState(defOrId, track = null, spawnOpts = {}) {
  const def = typeof defOrId === "string" ? getCar(defOrId) : defOrId || getCar("jelly_gt");
  const state = {
    def,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, z: 0 },
    yaw: 0,
    speed: 0,
    vLateral: 0,
    slip: 0,
    steerAngle: 0,
    drifting: false,
    wasHoldingDrift: false,
    driftGraceTimer: 0,
    boostCharge: 0,
    boostTier: 0,
    boostTime: 0,
    activeBoostTier: 0,
    driftScore: 0,
    time: 0,
    trackSampleIdx: 0,
    trackS: 0,
    lateralOffset: 0,
    surfacePitchDeg: 0,
    surfaceRollDeg: 0,
    surfaceNormal: { x: 0, y: 1, z: 0 },
    airborne: false,
    verticalVel: 0,
    prevGroundY: 0,
    prevSlopeVelY: 0,
    wallCooldown: 0,
    collisionPulse: 0,
    spring: { pitchDeg: 0, rollDeg: 0, squash: 0, bounceY: 0 },
    springVel: { pitchDeg: 0, rollDeg: 0, squash: 0, bounceY: 0 }
  };
  resetCarPhysicsState(state, track, def, spawnOpts);
  return state;
}

export function resetCarPhysicsState(state, track = null, defOrId = null, spawnOpts = {}) {
  if (defOrId) {
    state.def = typeof defOrId === "string" ? getCar(defOrId) : defOrId;
  }
  const sOffset = Number.isFinite(spawnOpts.s) ? spawnOpts.s : 0;
  const laneOffset = Number.isFinite(spawnOpts.lane) ? spawnOpts.lane : 0;

  let sx = 0;
  let sy = 0;
  let sz = 0;
  let angle = 0;
  let sampleIdx = 0;
  let sVal = 0;
  let nx = 0;
  let ny = 1;
  let nz = 0;
  let bank = 0;
  let pitchDeg = 0;

  if (track && typeof track.at === "function") {
    const pt = track.at(sOffset);
    // laneOffset > 0 is car-right (-binormal)
    sx = pt.x - pt.bx * laneOffset;
    sy = pt.y - pt.by * laneOffset;
    sz = pt.z - pt.bz * laneOffset;
    angle = pt.angle;
    sampleIdx = pt.index || 0;
    sVal = pt.s || 0;
    nx = pt.nx;
    ny = pt.ny;
    nz = pt.nz;
    bank = pt.bank || 0;
    pitchDeg = (-Math.asin(clamp(pt.ty, -0.7, 0.7, 0)) * 180) / Math.PI;
  }

  state.pos = { x: sx, y: sy, z: sz };
  state.vel = { x: 0, z: 0 };
  state.yaw = angle;
  state.speed = 0;
  state.vLateral = 0;
  state.slip = 0;
  state.steerAngle = 0;
  state.drifting = false;
  state.wasHoldingDrift = false;
  state.driftGraceTimer = 0;
  state.boostCharge = 0;
  state.boostTier = 0;
  state.boostTime = 0;
  state.activeBoostTier = 0;
  state.driftScore = 0;
  state.time = 0;
  state.trackSampleIdx = sampleIdx;
  state.trackS = sVal;
  state.lateralOffset = laneOffset;
  state.surfacePitchDeg = pitchDeg;
  state.surfaceRollDeg = (bank * 180) / Math.PI;
  state.surfaceNormal = { x: nx, y: ny, z: nz };
  state.airborne = false;
  state.verticalVel = 0;
  state.prevGroundY = sy;
  state.prevSlopeVelY = 0;
  state.wallCooldown = 0;
  state.collisionPulse = 0;
  state.spring = { pitchDeg: 0, rollDeg: 0, squash: 0, bounceY: 0 };
  state.springVel = { pitchDeg: 0, rollDeg: 0, squash: 0, bounceY: 0 };
  return state;
}

/**
 * Triggers jelly-body impact response & damped speed nudge without NaN propagation.
 */
export function applyCollision(state, strength = 0.5, normalX = 0, normalZ = 0) {
  if (!state) return;
  const s = clamp(strength, 0.05, 1.5, 0.4);
  state.collisionPulse = Math.max(state.collisionPulse || 0, s);
  state.springVel.squash += 1.6 * s;
  state.springVel.pitchDeg += 14 * s;
  state.springVel.rollDeg += (normalX * Math.cos(state.yaw) - normalZ * Math.sin(state.yaw)) * 26 * s;
  state.springVel.bounceY += 1.1 * s;
}

/**
 * Projects car onto track spline, updates elevation/airtime/surface pitch & bank,
 * and resolves barrier collisions with a natural impulse: the normal component is
 * reflected with restitution and the incoming tangential speed is preserved, so the
 * car keeps its heading/rotation instead of snapping the tangent into place.
 */
export function applyTrackBoundary(state, track, dt = FIXED_DT) {
  if (!state || !track || typeof track.projectToTrack !== "function") return null;
  const dtSafe = clamp(dt, 1e-4, 0.05, FIXED_DT);
  sanitizeState(state, track);

  const proj = track.projectToTrack(state.pos.x, state.pos.z, state.trackSampleIdx, state.pos.y);
  state.trackSampleIdx = proj.sampleIdx;
  state.trackS = proj.s;
  state.lateralOffset = proj.lateralOffset;

  // Vertical elevation & crest airtime physics
  const groundY = proj.point.y;
  const slopeVelY = clamp((groundY - state.prevGroundY) / dtSafe, -22, 22, 0);
  const slopeAccelY = (slopeVelY - state.prevSlopeVelY) / dtSafe;
  state.prevGroundY = groundY;
  state.prevSlopeVelY = slopeVelY;

  const expectedY = state.pos.y + state.verticalVel * dtSafe - 0.5 * GRAVITY * dtSafe * dtSafe;
  state.verticalVel -= GRAVITY * dtSafe;

  if (expectedY <= groundY + 0.04) {
    const impact = Math.max(0, slopeVelY - state.verticalVel);
    if (state.airborne && impact > 2.0) {
      const jelly = clamp(state.def?.jellyBounce ?? 1.0, 0.65, 1.5, 1.0);
      state.springVel.bounceY -= clamp(impact * 0.16 * jelly, 0, 1.8, 0);
      state.springVel.squash += clamp(impact * 0.12 * jelly, 0, 1.6, 0);
      state.springVel.pitchDeg += clamp(impact * 2.2 * jelly, 0, 22, 0);
    }
    state.pos.y = groundY;
    state.verticalVel = slopeVelY;
    state.airborne = false;
  } else {
    state.pos.y = expectedY;
    state.airborne = true;
  }

  // Subtle terrain compression bounce on dips/crests
  if (!state.airborne && Number.isFinite(slopeAccelY)) {
    state.springVel.bounceY += clamp(-slopeAccelY * 0.012, -1.2, 1.2, 0);
  }

  state.surfacePitchDeg = (-Math.asin(clamp(proj.tangent.y, -0.7, 0.7, 0)) * 180) / Math.PI;
  state.surfaceRollDeg = ((proj.bank || 0) * 180) / Math.PI;
  state.surfaceNormal = { x: proj.normal.x, y: proj.normal.y, z: proj.normal.z };

  // Barrier containment & elastic wall bounce
  const limit = Math.max(2.0, proj.halfWidth - CAR_RADIUS);
  if (Math.abs(proj.lateralOffset) > limit) {
    const sign = proj.lateralOffset > 0 ? 1 : -1;
    state.pos.x = proj.point.x + proj.right.x * (sign * limit);
    state.pos.z = proj.point.z + proj.right.z * (sign * limit);
    state.lateralOffset = sign * limit;

    // Outward normal (toward barrier)
    const nx = sign * proj.right.x;
    const nz = sign * proj.right.z;
    const tHorizLen = Math.hypot(proj.tangent.x, proj.tangent.z) || 1;
    const tx = proj.tangent.x / tHorizLen;
    const tz = proj.tangent.z / tHorizLen;

    const vN = state.vel.x * nx + state.vel.z * nz;
    const vT = state.vel.x * tx + state.vel.z * tz;

    if (vN > 0) {
      const isHeavyImpact = vN > 1.8 && state.wallCooldown <= 0;
      // Natural wall impulse: reflect the normal component with restitution and
      // keep the incoming tangential speed (light damping). The car preserves its
      // incoming heading and rotation: no tangent snapping, no yaw snapping.
      const restitution = isHeavyImpact ? 0.45 : 0.22;
      const vNNew = -Math.min(vN * restitution, 9.0) + (isHeavyImpact ? 0.08 : 0);
      const vTNew = vT * (isHeavyImpact ? 0.97 : 0.99);
      state.vel.x = vTNew * tx + vNNew * nx;
      state.vel.z = vTNew * tz + vNNew * nz;

      const fx = Math.sin(state.yaw);
      const fz = Math.cos(state.yaw);
      const rx = -Math.cos(state.yaw);
      const rz = Math.sin(state.yaw);
      state.speed = state.vel.x * fx + state.vel.z * fz;
      state.vLateral = state.vel.x * rx + state.vel.z * rz;

      if (isHeavyImpact) {
        applyCollision(state, clamp(vN / 20, 0.22, 1.0, 0.35), nx, nz);
        state.wallCooldown = 0.22;
      }
    }
  }

  sanitizeState(state, track);
  return proj;
}

/**
 * Advances one car physics state by `dt` seconds.
 * Coordinate convention: +Z forward, +X car-left, +yaw turning left.
 *
 * Jelly Spring sign contract for M3 chassis rendering:
 * - chassis.rotation.x = +deg2rad(spring.pitchDeg)  -> braking gives pitchDeg > 0 (nose dive), accel gives < 0 (rear squat)
 * - chassis.rotation.z = -deg2rad(spring.rollDeg)   -> left turn gives rollDeg < 0 (tilts outward right)
 * - chassis.scale: y = 1 - spring.squash, x = z = 1 + 0.5 * spring.squash (squash >= 0 compresses vertically)
 * - chassis.position.y += spring.bounceY
 */
export function stepCarPhysics(state, input = {}, dt = FIXED_DT, trackOrOpts = null) {
  if (!state) return state;
  const track =
    trackOrOpts && typeof trackOrOpts.projectToTrack === "function"
      ? trackOrOpts
      : trackOrOpts && trackOrOpts.track
      ? trackOrOpts.track
      : null;

  const dtClamped = clamp(dt, 0, 0.05, FIXED_DT);
  sanitizeState(state, track);

  const def = state.def || getCar("jelly_gt");
  const prevSpeed = state.speed;
  const prevYaw = state.yaw;

  state.time += dtClamped;
  state.wallCooldown = Math.max(0, state.wallCooldown - dtClamped);
  state.collisionPulse = Math.max(0, state.collisionPulse - dtClamped * 3.5);

  // Sub-step if dt exceeds 1/60s to guarantee spring & drift stability
  const subSteps = dtClamped > FIXED_DT * 1.15 ? 2 : 1;
  const h = dtClamped / subSteps;

  for (let step = 0; step < subSteps; step++) {
    if (h <= 0) break;

    const fx = Math.sin(state.yaw);
    const fz = Math.cos(state.yaw);
    const rx = -Math.cos(state.yaw);
    const rz = Math.sin(state.yaw);

    let vForward = state.vel.x * fx + state.vel.z * fz;
    let vRight = state.vel.x * rx + state.vel.z * rz;

    const throttle = input && input.throttle ? 1 : 0;
    const brake = input && input.brake ? 1 : 0;
    const steer =
      input && typeof input.steer === "number"
        ? clamp(input.steer, -1, 1, 0)
        : (input && input.left ? 1 : 0) - (input && input.right ? 1 : 0);

    // Smooth front-wheel visual steering angle
    const targetVisualSteer = steer * 0.45;
    state.steerAngle += (targetVisualSteer - state.steerAngle) * (1 - Math.exp(-h * 14));

    const wantDrift = !!(input && input.drift);
    const wantsManualBoost = !!(input && input.boost);

    // Check 3-tier boost trigger on drift release or manual boost button
    const releasedDrift = state.wasHoldingDrift && !wantDrift;
    if ((releasedDrift || wantsManualBoost) && boostTierFor(state.boostCharge) >= 1) {
      const tier = boostTierFor(state.boostCharge);
      state.activeBoostTier = tier;
      state.boostTime = tier === 3 ? 2.2 : tier === 2 ? 1.6 : 1.1;
      state.boostCharge = 0;
      state.boostTier = 0;

      // Immediate boost launch kick + jelly squat reaction
      const jelly = clamp(def.jellyBounce || 1, 0.65, 1.5, 1);
      vForward += 2.2 * tier;
      state.springVel.pitchDeg -= 22 * tier * jelly;
      state.springVel.squash += 0.48 * tier * jelly;
      state.springVel.bounceY += 0.35 * tier * jelly;
    }
    state.wasHoldingDrift = wantDrift;

    if (state.boostTime > 0) {
      state.boostTime = Math.max(0, state.boostTime - h);
      if (state.boostTime <= 0) state.activeBoostTier = 0;
    }

    const activeTier = state.boostTime > 0 ? Math.max(1, state.activeBoostTier || 1) : 0;
    const boostSpeedMult =
      activeTier === 3 ? 1.38 : activeTier === 2 ? 1.28 : activeTier === 1 ? 1.18 : 1.0;
    const boostAccelAdd = activeTier * 15.0;

    // Hard 120 km/h ceiling applies to the world speed too (see below).
    const maxFwd = Math.min((def.maxSpeed || def.topSpeed || 44) * boostSpeedMult, MAX_TOP_SPEED_MS);
    const maxRev = -(def.reverseSpeed || 13);

    // Longitudinal forces
    if (throttle) {
      const accelForce = (def.accel || 34) + boostAccelAdd;
      vForward += accelForce * h;
    } else if (state.boostTime > 0) {
      vForward += boostAccelAdd * 0.85 * h;
    }

    if (brake) {
      if (vForward > 0.6) {
        vForward -= (def.brake || 44) * h;
        if (vForward < 0) vForward = 0;
      } else {
        vForward -= (def.accel || 34) * 0.68 * h;
      }
    }

    if (!throttle && !brake && state.boostTime <= 0) {
      const coastDrag = Math.exp(-1.15 * h);
      vForward *= coastDrag;
      if (Math.abs(vForward) < 0.08) vForward = 0;
    }

    vForward = clamp(vForward, maxRev, maxFwd, 0);

    // Slip & drift state
    const speedAbs = Math.abs(vForward);

    // Jelly Drift style: low-speed elastic drift. Drift engages as early as the
    // speed allows — holding the drift input while steering into a turn (~6 m/s),
    // or auto-discovering it once the car is already sliding (~8 m/s).
    const driftActive =
      (wantDrift && vForward > 6.0 && Math.abs(steer) > 0.12) ||
      (!brake && Math.abs(steer) > 0.78 && vForward > 8.0 && Math.abs(vRight) > 1.5);

    // Elastic slide: keep the elastic drive running while lateral speed has been
    // built up (drifting, or a slide that is still easing out after drift ends).
    const elasticDrift = driftActive || Math.abs(vRight) > 1.2;

    const rawSlip = vForward > 1.2 ? Math.atan2(vRight, vForward) : 0;
    const driftGrip = clamp(def.driftGrip || 1.0, 0.75, 1.4, 1.0);

    // Steering yaw authority + counter-steer stabilizer
    const speedFactor = clamp(speedAbs / 20.0, 0, 1, 0);
    const dirSign = vForward >= -0.2 ? 1 : -1;
    let yawRate = steer * (def.steerRate || 2.75) * (0.22 + 0.78 * speedFactor) * dirSign;

    if (driftActive) {
      yawRate *= speedAbs > 14.0 ? 1.04 : 0.85;
      // Mild forward scrub during deep slide
      vForward *= 1 - 0.05 * h;
    }

    // Elastic lateral drive: instead of hard-damping the lateral speed, drive it
    // toward a steering-proportional target so the slide builds gently and eases
    // back out as steering is released — the Jelly Drift feel at low speed.
    if (elasticDrift) {
      const elasticTarget = vForward * clamp(steer, -1, 1, 0) * 0.85;
      const elasticDamp = Math.min(5.0, Math.max(2.0, 3.0 * driftGrip));
      vRight += h * elasticDamp * (elasticTarget - vRight);
    }

    // Counter-steer stabilizer: prevents spin-outs and caps |slip| <= MAX_SLIP_RAD (~58 deg)
    let latDamping = elasticDrift ? 0.35 : 13.5;
    if (Math.abs(rawSlip) > 0.78) {
      const excess = clamp((Math.abs(rawSlip) - 0.78) / (MAX_SLIP_RAD - 0.78), 0, 1.5, 0);
      if (steer * rawSlip > 0) {
        // Steering deeper into oversteer: attenuate inward yaw rate toward 0
        yawRate *= Math.max(0, 1 - excess * 0.95);
      }
      latDamping += 9.0 * excess;
      // Restoring alignment torque toward velocity direction
      yawRate -= Math.sign(rawSlip) * excess * 1.65;
    }

    // Apply tire grip to lateral velocity BEFORE rotating chassis yaw (preserves true 2D momentum!)
    vRight *= Math.exp(-latDamping * h);
    if (Math.abs(vRight) < 0.02 && !driftActive) vRight = 0;

    state.vel.x = vForward * fx + vRight * rx;
    state.vel.z = vForward * fz + vRight * rz;

    // Hard ceiling on the world speed: lateral slide speed must not push the
    // car past the tuning cap once the chassis is at max forward speed.
    const worldSpeed = Math.hypot(state.vel.x, state.vel.z);
    if (worldSpeed > MAX_TOP_SPEED_MS && worldSpeed > 0.01) {
      const scale = MAX_TOP_SPEED_MS / worldSpeed;
      state.vel.x *= scale;
      state.vel.z *= scale;
    }

    // Rotate chassis heading and re-project world momentum into new car frame
    state.yaw = wrapAngleRad(state.yaw + yawRate * h);

    const fx2 = Math.sin(state.yaw);
    const fz2 = Math.cos(state.yaw);
    const rx2 = -Math.cos(state.yaw);
    const rz2 = Math.sin(state.yaw);

    const newVForward = state.vel.x * fx2 + state.vel.z * fz2;
    const newVRight = state.vel.x * rx2 + state.vel.z * rz2;

    state.pos.x += state.vel.x * h;
    state.pos.z += state.vel.z * h;

    state.speed = newVForward;
    state.vLateral = newVRight;

    const slipRad = newVForward > 1.2 ? Math.atan2(newVRight, newVForward) : 0;
    state.slip = clamp(slipRad, -MAX_SLIP_RAD, MAX_SLIP_RAD, 0);
    state.drifting = !!(driftActive && Math.abs(state.slip) > 0.14 && newVForward > 5.0);

    // Drift score & 3-tier boost charging
    if (state.drifting) {
      state.driftGraceTimer = 0.42;
      const chargeRate = 0.62 * clamp(def.driftGrip || 1.0, 0.8, 1.35, 1.0);
      state.boostCharge = clamp(state.boostCharge + chargeRate * h, 0, 1, state.boostCharge);
      state.driftScore += (Math.abs(state.slip) * 90 + vForward * 2.5) * h;
    } else {
      if (state.driftGraceTimer > 0) {
        state.driftGraceTimer = Math.max(0, state.driftGraceTimer - h);
      } else {
        state.boostCharge = clamp(state.boostCharge - 0.04 * h, 0, 1, 0);
      }
    }
    state.boostTier = boostTierFor(state.boostCharge);

    if (track) {
      applyTrackBoundary(state, track, h);
    }
  }

  // 2nd-order damped harmonic 3-axis jelly spring
  if (dtClamped > 0) {
    const jelly = clamp(def.jellyBounce ?? 1.0, 0.65, 1.5, 1.0);
    const longAccel = clamp((state.speed - prevSpeed) / dtClamped, -60, 60, 0);
    const yawDelta = wrapAngleRad(state.yaw - prevYaw);
    const yawRate = clamp(yawDelta / dtClamped, -8, 8, 0);
    const latAccel = clamp(state.speed * yawRate, -65, 65, 0);

    // Signs: braking (longAccel < 0) -> pitchDeg > 0 (nose dive); accel -> pitchDeg < 0 (squat)
    const pitchTarget = clamp(-longAccel * 0.24 * jelly, -12, 12, 0);
    // Signs: left turn (latAccel > 0) -> rollDeg < 0 (outward right lean via chassis.rotation.z = -deg2rad(rollDeg))
    const rollTarget = clamp(-latAccel * 0.36 * jelly, -16, 16, 0);
    // Symmetric >= 0 squash under cornering & impacts
    const squashTarget = clamp(
      (Math.abs(latAccel) * 0.0022 + Math.max(0, state.collisionPulse) * 0.14) * jelly,
      0,
      0.22,
      0
    );
    const bounceTarget = 0;

    const omegaPitch = 13.5;
    const zetaPitch = clamp(0.38 / Math.sqrt(jelly), 0.24, 0.65, 0.38);
    const omegaRoll = 12.8;
    const zetaRoll = clamp(0.35 / Math.sqrt(jelly), 0.22, 0.62, 0.35);
    const omegaSquash = 15.5;
    const zetaSquash = clamp(0.34 / Math.sqrt(jelly), 0.22, 0.6, 0.34);
    const omegaBounce = 14.5;
    const zetaBounce = clamp(0.36 / Math.sqrt(jelly), 0.22, 0.6, 0.36);

    [state.spring.pitchDeg, state.springVel.pitchDeg] = stepSpringChannel(
      state.spring.pitchDeg,
      state.springVel.pitchDeg,
      pitchTarget,
      omegaPitch,
      zetaPitch,
      dtClamped
    );
    [state.spring.rollDeg, state.springVel.rollDeg] = stepSpringChannel(
      state.spring.rollDeg,
      state.springVel.rollDeg,
      rollTarget,
      omegaRoll,
      zetaRoll,
      dtClamped
    );
    [state.spring.squash, state.springVel.squash] = stepSpringChannel(
      state.spring.squash,
      state.springVel.squash,
      squashTarget,
      omegaSquash,
      zetaSquash,
      dtClamped
    );
    [state.spring.bounceY, state.springVel.bounceY] = stepSpringChannel(
      state.spring.bounceY,
      state.springVel.bounceY,
      bounceTarget,
      omegaBounce,
      zetaBounce,
      dtClamped
    );
  }

  sanitizeState(state, track);
  return state;
}

/**
 * Elastic pairwise car-to-car collision separation and impulse transfer.
 * Handles dist === 0 safely without NaN.
 */
export function resolveCarCollisions(cars, opts = {}) {
  if (!Array.isArray(cars) || cars.length < 2) return 0;
  const minDist = Number.isFinite(opts.minDist) ? opts.minDist : 2.45;
  const restitution = Number.isFinite(opts.restitution) ? opts.restitution : 0.55;
  let hits = 0;

  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (!a || !a.pos || !a.vel) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (!b || !b.pos || !b.vel) continue;

      // Ignore collisions if vertically separated across an overpass
      if (Math.abs((a.pos.y || 0) - (b.pos.y || 0)) > 3.0) continue;

      let dx = b.pos.x - a.pos.x;
      let dz = b.pos.z - a.pos.z;
      let distSq = dx * dx + dz * dz;
      if (distSq >= minDist * minDist) continue;

      let nx;
      let nz;
      let dist;
      if (distSq < 1e-8) {
        const yawA = Number.isFinite(a.yaw) ? a.yaw : 0;
        nx = Math.cos(yawA);
        nz = -Math.sin(yawA);
        dist = 0;
      } else {
        dist = Math.sqrt(distSq);
        nx = dx / dist;
        nz = dz / dist;
      }

      const invMa = 1 / clamp(a.def?.mass ?? 1.0, 0.5, 3.0, 1.0);
      const invMb = 1 / clamp(b.def?.mass ?? 1.0, 0.5, 3.0, 1.0);
      const invSum = invMa + invMb;

      const overlap = minDist - dist;
      a.pos.x -= nx * overlap * (invMa / invSum);
      a.pos.z -= nz * overlap * (invMa / invSum);
      b.pos.x += nx * overlap * (invMb / invSum);
      b.pos.z += nz * overlap * (invMb / invSum);

      const relVx = b.vel.x - a.vel.x;
      const relVz = b.vel.z - a.vel.z;
      const relVn = relVx * nx + relVz * nz;

      if (relVn < 0) {
        const impulse = (-(1 + restitution) * relVn) / invSum;
        a.vel.x -= impulse * invMa * nx;
        a.vel.z -= impulse * invMa * nz;
        b.vel.x += impulse * invMb * nx;
        b.vel.z += impulse * invMb * nz;

        // Refresh scalar forward/lateral readouts
        for (const car of [a, b]) {
          const fx = Math.sin(car.yaw);
          const fz = Math.cos(car.yaw);
          const rx = -Math.cos(car.yaw);
          const rz = Math.sin(car.yaw);
          car.speed = car.vel.x * fx + car.vel.z * fz;
          car.vLateral = car.vel.x * rx + car.vel.z * rz;
        }

        const impactStrength = clamp(-relVn / 18, 0.2, 1.0, 0.35);
        applyCollision(a, impactStrength, nx, nz);
        applyCollision(b, impactStrength, -nx, -nz);
        hits++;
      }
    }
  }
  return hits;
}

export function speedKmh(state) {
  if (!state || !Number.isFinite(state.speed)) return 0;
  return state.speed * 3.6;
}

export function driftAngleDeg(state) {
  if (!state || !Number.isFinite(state.slip)) return 0;
  return (state.slip * 180) / Math.PI;
}

// Backward-compatible aliases
export const createPlayerState = createCarPhysicsState;
export const resetPlayerState = resetCarPhysicsState;
export const stepPlayer = stepCarPhysics;
