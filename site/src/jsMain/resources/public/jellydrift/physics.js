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
  if (typeof s.brakedFromForward !== "boolean") s.brakedFromForward = false;
  if (!Number.isFinite(s.brakeStopHoldSec)) s.brakeStopHoldSec = 0;
  if (!Number.isFinite(s.steerSmoothed)) s.steerSmoothed = 0;
  if (!Number.isFinite(s.driftState)) s.driftState = 0;
  s.driftState = clamp(s.driftState, 0, 1, 0);
  if (!Number.isFinite(s.driftExitBlend)) s.driftExitBlend = 0;
  if (!Number.isFinite(s.yawRateSmoothed)) s.yawRateSmoothed = 0;
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
    steerSmoothed: 0,
    drifting: false,
    wasHoldingDrift: false,
    driftGraceTimer: 0,
    driftState: 0,
    driftExitBlend: 0,
    yawRateSmoothed: 0,
    brakedFromForward: false,
    brakeStopHoldSec: 0,
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
  state.steerSmoothed = 0;
  state.drifting = false;
  state.wasHoldingDrift = false;
  state.driftGraceTimer = 0;
  state.driftState = 0;
  state.driftExitBlend = 0;
  state.yawRateSmoothed = 0;
  state.brakedFromForward = false;
  state.brakeStopHoldSec = 0;
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
  state.springVel.squash += 0.45 * s;
  state.springVel.pitchDeg += 4.5 * s;
  state.springVel.rollDeg += (normalX * Math.cos(state.yaw) - normalZ * Math.sin(state.yaw)) * 5 * s;
  state.springVel.bounceY += 0.24 * s;
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

  // Vertical elevation across banked road cross-section & crest airtime physics
  const bankHeight = (proj.binormal && Number.isFinite(proj.binormal.y) ? proj.binormal.y : 0) * proj.lateralOffset;
  const groundY = proj.point.y - bankHeight;
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
      state.springVel.bounceY -= clamp(impact * 0.06 * jelly, 0, 0.6, 0);
      state.springVel.squash += clamp(impact * 0.05 * jelly, 0, 0.5, 0);
      state.springVel.pitchDeg += clamp(impact * 0.9 * jelly, 0, 8, 0);
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
    state.springVel.bounceY += clamp(-slopeAccelY * 0.0022, -0.22, 0.22, 0);
  }

  // Project road normal into car's actual heading/right vectors so all 4 tires match slope & bank at any yaw
  const cFx = Math.sin(state.yaw);
  const cFz = Math.cos(state.yaw);
  const cRx = -Math.cos(state.yaw);
  const cRz = Math.sin(state.yaw);
  state.surfacePitchDeg =
    (Math.asin(clamp(cFx * proj.normal.x + cFz * proj.normal.z, -0.65, 0.65, 0)) * 180) / Math.PI;
  state.surfaceRollDeg =
    (Math.asin(clamp(cRx * proj.normal.x + cRz * proj.normal.z, -0.5, 0.5, 0)) * 180) / Math.PI;
  state.surfaceNormal = { x: proj.normal.x, y: proj.normal.y, z: proj.normal.z };

  // Barrier containment & smooth guardrail glancing
  const limit = Math.max(1.2, proj.halfWidth - CAR_RADIUS + 0.15);
  if (Math.abs(proj.lateralOffset) > limit) {
    const sign = proj.lateralOffset > 0 ? 1 : -1;
    const clampedLat = limit - 0.04;
    state.pos.x = proj.point.x + proj.right.x * (sign * clampedLat);
    state.pos.z = proj.point.z + proj.right.z * (sign * clampedLat);
    state.lateralOffset = sign * clampedLat;

    // Outward normal (toward barrier)
    const nx = sign * proj.right.x;
    const nz = sign * proj.right.z;
    const tHorizLen = Math.hypot(proj.tangent.x, proj.tangent.z) || 1;
    const tx = proj.tangent.x / tHorizLen;
    const tz = proj.tangent.z / tHorizLen;

    const vN = state.vel.x * nx + state.vel.z * nz;
    const vT = state.vel.x * tx + state.vel.z * tz;

    if (vN > 0) {
      const isHeavyImpact = vN > 4.2 && state.wallCooldown <= 0;
      const restitution = isHeavyImpact ? 0.16 : 0.08;
      const vNNew = -Math.min(vN * restitution, 3.6);
      const vTNew = vT * (isHeavyImpact ? 0.92 : 0.985);
      state.vel.x = vTNew * tx + vNNew * nx;
      state.vel.z = vTNew * tz + vNNew * nz;

      // Gently deflect car nose along guardrail so scraping a touge corner glances smoothly instead of wedging
      const trackAngle = Math.atan2(tx, tz);
      const yawDiff = wrapAngleRad(trackAngle - state.yaw);
      if (vT > -2.0 && Math.abs(yawDiff) > 0.08 && Math.abs(yawDiff) < 2.25) {
        state.yaw = wrapAngleRad(state.yaw + yawDiff * (isHeavyImpact ? 0.36 : 0.16));
      }

      const fx = Math.sin(state.yaw);
      const fz = Math.cos(state.yaw);
      const rx = -Math.cos(state.yaw);
      const rz = Math.sin(state.yaw);
      state.speed = state.vel.x * fx + state.vel.z * fz;
      state.vLateral = state.vel.x * rx + state.vel.z * rz;

      if (isHeavyImpact) {
        applyCollision(state, clamp(vN / 22, 0.22, 0.95, 0.35), nx, nz);
        state.wallCooldown = 0.42;
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

    // Boost is permanently disabled (Spacebar is purely a mechanical handbrake)
    state.boostTime = 0;
    state.activeBoostTier = 0;
    state.boostCharge = 0;
    state.boostTier = 0;
    state.wasHoldingDrift = wantDrift;

    // Hard 120 km/h ceiling applies to the world speed too (see below).
    const maxFwd = Math.min(def.maxSpeed || def.topSpeed || 44, MAX_TOP_SPEED_MS);
    const maxRev = -(def.reverseSpeed || 13);

    // Longitudinal forces with realistic touge torque & ~1.0-1.2G braking (~47-58m from 120 km/h)
    if (throttle) {
      const speedFrac = clamp(Math.max(0, vForward) / Math.max(1, maxFwd), 0, 1, 0);
      const driftDriveBonus = (state.driftState || 0) > 0.25 && Math.abs(state.slip || 0) > 0.2 ? 1.12 : 1.0;
      const accelForce = (def.accel || 34) * (0.28 - 0.08 * speedFrac) * driftDriveBonus;
      vForward += accelForce * h;
      state.brakedFromForward = false;
      state.brakeStopHoldSec = 0;
    }

    if (wantDrift && !brake && vForward > 0.2) {
      // Spacebar = mechanical rear handbrake (~30-40% of full service brake force, never reverses)
      const handbrakeDecel = throttle ? 1.8 : 4.2;
      const nextFwd = Math.max(0, vForward - handbrakeDecel * h);
      vForward = nextFwd < 0.06 && !throttle ? 0 : nextFwd;
    }

    if (brake) {
      if (vForward > 0.45) {
        const brakeDecel = clamp(def.brake || 10.5, 7.5, 13.5, 10.5);
        vForward = Math.max(0, vForward - brakeDecel * h);
        state.brakedFromForward = true;
        state.brakeStopHoldSec = 0;
      } else if (state.brakedFromForward && !(input && input.forceReverse)) {
        // Hold cleanly at zero after braking from forward motion before engaging reverse
        vForward = 0;
        state.brakeStopHoldSec = (state.brakeStopHoldSec || 0) + h;
        if (state.brakeStopHoldSec >= 0.45) {
          state.brakedFromForward = false;
        }
      } else {
        vForward -= (def.accel || 34) * 0.20 * h;
      }
    } else if (!throttle) {
      state.brakedFromForward = false;
      state.brakeStopHoldSec = 0;
    }

    if (!throttle && !brake && !wantDrift) {
      // High-inertia rolling resistance + quadratic aero drag so lift-off carries momentum
      const sign = vForward >= 0 ? 1 : -1;
      const absV = Math.abs(vForward);
      const dragDecel = 0.34 + 0.0019 * absV * absV;
      const nextAbs = Math.max(0, absV - dragDecel * h);
      vForward = nextAbs < 0.06 ? 0 : sign * nextAbs;
    }

    vForward = clamp(vForward, maxRev, maxFwd, 0);

    // Slip & drift state with hysteresis (sustains real touge drift arcs without snapping dead)
    const speedAbs = Math.abs(vForward);
    state.steerSmoothed += (steer - (state.steerSmoothed || 0)) * (1 - Math.exp(-h * 18));

    const rawSlip = vForward > 1.2 ? Math.atan2(vRight, vForward) : 0;
    const absSlip = Math.abs(rawSlip);
    const steerMag = Math.abs(state.steerSmoothed);
    const driftGrip = clamp(def.driftGrip || 1.0, 0.75, 1.4, 1.0);

    const hbInitiate = wantDrift && vForward > 3.0 && (Math.abs(steer) > 0.05 || absSlip > 0.08);
    const powerInitiate =
      vForward > 10.5 && steerMag > 0.55 && (absSlip > 0.14 || (brake && absSlip > 0.10));
    const sustainDrift =
      (state.driftState || 0) > 0.25 &&
      vForward > 4.2 &&
      absSlip > 0.13 &&
      (throttle || wantDrift || Math.abs(steer) > 0.12);

    if (hbInitiate) {
      state.driftState = Math.min(1, (state.driftState || 0) + 16.0 * h);
    } else if (powerInitiate || sustainDrift) {
      state.driftState = Math.min(1, (state.driftState || 0) + 9.0 * h);
    } else {
      state.driftState = Math.max(0, (state.driftState || 0) - 2.8 * h);
    }
    state.driftExitBlend = state.driftState;

    // Agile touge steering yaw authority (smooth low-speed ramp prevents endless donuts)
    const lowSpdRamp = clamp(speedAbs / 5.8, 0, 1, 0);
    const hiSpdTaper = 1 - 0.14 * clamp((speedAbs - 18.0) / 15.0, 0, 1, 0);
    const dirSign = vForward >= -0.2 ? 1 : -1;
    const steerBase = (def.steerRate || 2.25) * 1.04;
    let yawRate = state.steerSmoothed * steerBase * lowSpdRamp * hiSpdTaper * dirSign;

    // Handbrake rear-swing kick so even a brief Spacebar tap cleanly kicks the tail out
    if (wantDrift && vForward > 3.0 && Math.abs(steer) > 0.05) {
      yawRate *= 1.38;
      if (absSlip < 0.45) {
        yawRate += Math.sign(steer) * 0.55 * lowSpdRamp;
      }
    }

    if (state.driftState > 0.15 && vForward > 4.0) {
      if (steer * rawSlip >= 0) {
        yawRate *= 1 + 0.22 * state.driftState;
      }
      if (steer * rawSlip < -0.02) {
        // Modulate opposite-lock yaw so holding throttle + counter-steer holds a sweeping drift arc
        yawRate *= throttle ? 0.48 : 0.74;
      }
      if (throttle && !brake && absSlip > 0.14 && absSlip < 0.78) {
        // RWD throttle power-oversteer sustain
        yawRate += Math.sign(rawSlip) * 0.36 * state.driftState * clamp((0.78 - absSlip) / 0.40, 0, 1, 0);
      }
      if (Math.abs(steer) < 0.08 && absSlip > 0.08) {
        // Gentle caster self-alignment when steering wheel is neutral
        yawRate -= rawSlip * 0.85;
      }
    }

    // Anti-spinout safety envelope beyond ~41-54 deg
    if (absSlip > 0.72) {
      const excess = clamp((absSlip - 0.72) / (0.95 - 0.72), 0, 1.5, 0);
      if (steer * rawSlip > 0) {
        yawRate *= Math.max(0.10, 1 - excess * 0.88);
      }
      yawRate -= Math.sign(rawSlip) * excess * 1.6;
    }

    // Rotational yaw inertia so steering & rear weight transitions carry realistic momentum
    state.yawRateSmoothed =
      (state.yawRateSmoothed || 0) + (yawRate - (state.yawRateSmoothed || 0)) * (1 - Math.exp(-h * 11.5));

    // Static vs kinetic lateral grip + energy-preserving centripetal redirection
    const hardSteerT =
      clamp((steerMag - 0.25) / 0.30, 0, 1, 0) * clamp((vForward - 7.5) / 4.5, 0, 1, 0);
    const hardCornerBase = throttle ? 6.8 : 5.8;
    const baseLatDamp = 12.0 + (hardCornerBase - 12.0) * hardSteerT;
    const driftLatDamp = wantDrift
      ? 1.45 / Math.sqrt(driftGrip)
      : throttle
      ? 1.75 / Math.sqrt(driftGrip)
      : 3.2;
    let latDamping = baseLatDamp + (driftLatDamp - baseLatDamp) * state.driftState;
    if (absSlip > 0.72) {
      const excess = clamp((absSlip - 0.72) / (0.95 - 0.72), 0, 1.5, 0);
      latDamping += 5.5 * excess;
    }

    // Apply tire grip to lateral velocity BEFORE rotating chassis yaw & redirect damped energy forward
    const vBefore = Math.hypot(vForward, vRight);
    vRight *= Math.exp(-latDamping * h);
    if (Math.abs(vRight) < 0.02 && state.driftState < 0.1) vRight = 0;

    if (vForward > 0.5 && vBefore > 0.5) {
      const vAfter = Math.hypot(vForward, vRight);
      const redirectFrac = 0.88 - 0.10 * state.driftState;
      const sinSlip = Math.sin(clamp(absSlip, 0, MAX_SLIP_RAD, 0));
      const scrubRate = 0.14 * sinSlip * sinSlip * (throttle ? 0.55 : 1.15);
      const targetSpeed = (vAfter + (vBefore - vAfter) * redirectFrac) * (1 - scrubRate * h);
      const targetFwdSq = targetSpeed * targetSpeed - vRight * vRight;
      if (targetFwdSq > vForward * vForward) {
        vForward = Math.min(maxFwd, Math.sqrt(targetFwdSq));
      } else if (targetSpeed < vAfter && vAfter > 0.01) {
        const sc = targetSpeed / vAfter;
        vForward *= sc;
        vRight *= sc;
      }
    }

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

    // Rotate chassis heading using inertia-filtered yaw rate and re-project world momentum
    state.yaw = wrapAngleRad(state.yaw + state.yawRateSmoothed * h);

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
    state.drifting = !!((state.driftState > 0.25 || wantDrift) && Math.abs(state.slip) > 0.14 && newVForward > 3.0);

    // Drift score tracking (boost stays disabled at 0)
    if (state.drifting) {
      state.driftGraceTimer = 0.42;
      state.driftScore += (Math.abs(state.slip) * 90 + vForward * 2.5) * h;
    } else if (state.driftGraceTimer > 0) {
      state.driftGraceTimer = Math.max(0, state.driftGraceTimer - h);
    }
    state.boostCharge = 0;
    state.boostTier = 0;

    if (track) {
      applyTrackBoundary(state, track, h);
    }
  }

  // 2nd-order damped harmonic 3-axis jelly spring (planted touge damping)
  if (dtClamped > 0) {
    const jelly = clamp(def.jellyBounce ?? 1.0, 0.65, 1.5, 1.0);
    const longAccel = clamp((state.speed - prevSpeed) / dtClamped, -60, 60, 0);
    const yawDelta = wrapAngleRad(state.yaw - prevYaw);
    const yawRate = clamp(yawDelta / dtClamped, -8, 8, 0);
    const latAccel = clamp(state.speed * yawRate, -65, 65, 0);

    // Signs: braking (longAccel < 0) -> pitchDeg > 0 (nose dive); accel/back-heavy -> pitchDeg < 0 (rear squat)
    const throttleBias = input && input.throttle ? 1.35 : 0;
    const pitchTarget = clamp((-longAccel * 0.085 - throttleBias * 0.8) * jelly, -4.2, 3.6, 0);
    // Signs: left turn (latAccel > 0) -> rollDeg < 0 (outward right lean via chassis.rotation.z = -deg2rad(rollDeg))
    const rollTarget = clamp(-latAccel * 0.085 * jelly, -4.5, 4.5, 0);
    // Symmetric >= 0 squash under cornering & impacts
    const squashTarget = clamp(
      (Math.abs(latAccel) * 0.0009 + Math.max(0, state.collisionPulse) * 0.07) * jelly,
      0,
      0.09,
      0
    );
    const bounceTarget = 0;

    const omegaPitch = 14.5;
    const zetaPitch = clamp(0.78 / Math.sqrt(jelly), 0.65, 0.92, 0.78);
    const omegaRoll = 14.0;
    const zetaRoll = clamp(0.80 / Math.sqrt(jelly), 0.68, 0.92, 0.80);
    const omegaSquash = 15.5;
    const zetaSquash = clamp(0.76 / Math.sqrt(jelly), 0.62, 0.90, 0.76);
    const omegaBounce = 15.0;
    const zetaBounce = clamp(0.78 / Math.sqrt(jelly), 0.65, 0.92, 0.78);

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
 * Exact 2D Oriented Bounding Box (SAT) overlap test between two cars in XZ plane.
 * Returns null if separated, otherwise { overlap, nx, nz, dx, dz } pointing a -> b.
 */
function testCarOBB(a, b) {
  const yawA = Number.isFinite(a.yaw) ? a.yaw : 0;
  const yawB = Number.isFinite(b.yaw) ? b.yaw : 0;

  const hwA = clamp((a.def?.width ?? 2.05) * 0.5 + 0.04, 0.6, 2.5, 1.06);
  const hlA = clamp((a.def?.length ?? 4.30) * 0.5 + 0.05, 1.2, 4.0, 2.20);
  const hwB = clamp((b.def?.width ?? 2.05) * 0.5 + 0.04, 0.6, 2.5, 1.06);
  const hlB = clamp((b.def?.length ?? 4.30) * 0.5 + 0.05, 1.2, 4.0, 2.20);

  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const maxR = Math.hypot(hwA, hlA) + Math.hypot(hwB, hlB);
  const distSq = dx * dx + dz * dz;
  if (distSq >= maxR * maxR) return null;

  const fAx = Math.sin(yawA);
  const fAz = Math.cos(yawA);
  const rAx = -fAz;
  const rAz = fAx;

  const fBx = Math.sin(yawB);
  const fBz = Math.cos(yawB);
  const rBx = -fBz;
  const rBz = fBx;

  let minOverlap = Infinity;
  let bestNx = rAx;
  let bestNz = rAz;

  // Test the 4 candidate separating axes: fA, rA, fB, rB
  for (let k = 0; k < 4; k++) {
    const ux = k === 0 ? fAx : k === 1 ? rAx : k === 2 ? fBx : rBx;
    const uz = k === 0 ? fAz : k === 1 ? rAz : k === 2 ? fBz : rBz;
    const dProj = dx * ux + dz * uz;
    const radA = hlA * Math.abs(fAx * ux + fAz * uz) + hwA * Math.abs(rAx * ux + rAz * uz);
    const radB = hlB * Math.abs(fBx * ux + fBz * uz) + hwB * Math.abs(rBx * ux + rBz * uz);
    const overlap = radA + radB - Math.abs(dProj);
    if (overlap <= 0) return null;
    if (overlap < minOverlap) {
      minOverlap = overlap;
      const sign = dProj >= 0 ? 1 : -1;
      bestNx = ux * sign;
      bestNz = uz * sign;
    }
  }

  return { overlap: minOverlap, nx: bestNx, nz: bestNz, dx, dz };
}

/**
 * Multi-iteration 2D OBB SAT car-to-car collision separation and impulse transfer.
 * Handles dist === 0 safely without NaN and clamps against track walls when supplied.
 */
export function resolveCarCollisions(cars, opts = {}) {
  if (!Array.isArray(cars) || cars.length < 2) return 0;
  const restitution = Number.isFinite(opts.restitution) ? opts.restitution : 0.35;
  const iterations = clamp(Math.round(opts.iterations ?? 3), 1, 6, 3);
  const track = opts.track && typeof opts.track.projectToTrack === "function" ? opts.track : null;
  const pairPulsed = new Set();
  let hits = 0;

  for (let iter = 0; iter < iterations; iter++) {
    let iterHits = 0;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (!a || !a.pos || !a.vel) continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (!b || !b.pos || !b.vel) continue;

        // Ignore collisions if vertically separated across an overpass
        if (Math.abs((a.pos.y || 0) - (b.pos.y || 0)) > 3.0) continue;

        const col = testCarOBB(a, b);
        if (!col) continue;

        const { nx, nz } = col;
        const invMa = 1 / clamp(a.def?.mass ?? 1.0, 0.5, 3.0, 1.0);
        const invMb = 1 / clamp(b.def?.mass ?? 1.0, 0.5, 3.0, 1.0);
        const invSum = invMa + invMb;

        const push = col.overlap + 0.005;
        a.pos.x -= nx * push * (invMa / invSum);
        a.pos.z -= nz * push * (invMa / invSum);
        b.pos.x += nx * push * (invMb / invSum);
        b.pos.z += nz * push * (invMb / invSum);

        // Keep separated cars inside track guardrails so wall-pinches push cleanly inward
        if (track) {
          for (const car of [a, b]) {
            const proj = track.projectToTrack(car.pos.x, car.pos.z, car.trackSampleIdx, car.pos.y);
            const limit = Math.max(1.2, proj.halfWidth - CAR_RADIUS + 0.15);
            if (Math.abs(proj.lateralOffset) > limit) {
              const sign = proj.lateralOffset > 0 ? 1 : -1;
              const clampedLat = limit - 0.04;
              car.pos.x = proj.point.x + proj.right.x * (sign * clampedLat);
              car.pos.z = proj.point.z + proj.right.z * (sign * clampedLat);
              car.lateralOffset = sign * clampedLat;
            }
          }
        }

        const relVx = b.vel.x - a.vel.x;
        const relVz = b.vel.z - a.vel.z;
        const relVn = relVx * nx + relVz * nz;

        if (relVn < 0) {
          const jN = (-(1 + restitution) * relVn) / invSum;
          const tx = -nz;
          const tz = nx;
          const relVt = relVx * tx + relVz * tz;
          const jT = clamp(-relVt / invSum, -jN * 0.22, jN * 0.22, 0);

          a.vel.x -= (jN * nx + jT * tx) * invMa;
          a.vel.z -= (jN * nz + jT * tz) * invMa;
          b.vel.x += (jN * nx + jT * tx) * invMb;
          b.vel.z += (jN * nz + jT * tz) * invMb;

          // Subtle glancing yaw deflection for off-center bumps
          const lever = clamp((col.dx * nz - col.dz * nx) / 2.2, -1, 1, 0);
          const yawKick = clamp(lever * jN * 0.04, -1.4, 1.4, 0);
          a.yawRateSmoothed = clamp((a.yawRateSmoothed || 0) + yawKick, -6, 6, 0);
          b.yawRateSmoothed = clamp((b.yawRateSmoothed || 0) + yawKick, -6, 6, 0);

          for (const car of [a, b]) {
            const spd = Math.hypot(car.vel.x, car.vel.z);
            if (spd > MAX_TOP_SPEED_MS && spd > 0.01) {
              const sc = MAX_TOP_SPEED_MS / spd;
              car.vel.x *= sc;
              car.vel.z *= sc;
            }
            const fx = Math.sin(car.yaw);
            const fz = Math.cos(car.yaw);
            const rx = -Math.cos(car.yaw);
            const rz = Math.sin(car.yaw);
            car.speed = car.vel.x * fx + car.vel.z * fz;
            car.vLateral = car.vel.x * rx + car.vel.z * rz;
            const sRad = car.speed > 1.2 ? Math.atan2(car.vLateral, car.speed) : 0;
            car.slip = clamp(sRad, -MAX_SLIP_RAD, MAX_SLIP_RAD, 0);
          }

          const pairKey = i * 1024 + j;
          if (!pairPulsed.has(pairKey)) {
            pairPulsed.add(pairKey);
            const impactStrength = clamp(-relVn / 14, 0.22, 1.0, 0.35);
            applyCollision(a, impactStrength, nx, nz);
            applyCollision(b, impactStrength, -nx, -nz);
            hits++;
          }
        }
        iterHits++;
      }
    }
    if (iterHits === 0) break;
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
