import { getCar } from "./cars.js";
import {
  FIXED_DT,
  clamp,
  createCarPhysicsState,
  resetCarPhysicsState,
  stepCarPhysics,
  resolveCarCollisions
} from "./physics.js";

export const AI_COUNT = 4;

export const AI_PROFILES = [
  {
    id: "ai_tofu",
    name: "K. Fujiwara",
    carId: "tofu_86",
    colorHex: "#F4F5F7",
    basePace: 0.99,
    baseLane: -2.6,
    skill: 0.92,
    aggression: 0.65
  },
  {
    id: "ai_bumble",
    name: "B. Rally",
    carId: "bumble_buggy",
    colorHex: "#F3DB5B",
    basePace: 0.96,
    baseLane: 2.6,
    skill: 0.85,
    aggression: 0.82
  },
  {
    id: "ai_cobalt",
    name: "C. Apex",
    carId: "cobalt_hyper",
    colorHex: "#3C83EF",
    basePace: 1.03,
    baseLane: -2.4,
    skill: 0.96,
    aggression: 0.72
  },
  {
    id: "ai_jelly",
    name: "J. Bounce",
    carId: "jelly_gt",
    colorHex: "#E63946",
    basePace: 0.97,
    baseLane: 2.4,
    skill: 0.88,
    aggression: 0.76
  }
];

function wrapAngleRad(a) {
  if (!Number.isFinite(a)) return 0;
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

function safeSpawnLane(track, rawLane) {
  const halfW = track && Number.isFinite(track.halfWidth) ? track.halfWidth : 9.0;
  const maxLane = Math.max(1.5, halfW - 2.6);
  return clamp(rawLane, -maxLane, maxLane, 0);
}

export function createAIState(track, index = 0) {
  const profile = AI_PROFILES[index % AI_PROFILES.length];
  const carDef = getCar(profile.carId);
  const spawnS = 8 + index * 6;
  const lane = safeSpawnLane(track, profile.baseLane);

  const ai = createCarPhysicsState(carDef, track, { s: spawnS, lane });
  ai.index = index;
  ai.id = profile.id;
  ai.name = profile.name;
  ai.carId = profile.carId;
  ai.colorHex = profile.colorHex;
  ai.profile = profile;
  ai.basePace = profile.basePace;
  ai.baseLane = lane;
  ai.dynamicLaneOffset = 0;
  ai.lap = 1;
  ai.checkpointIndex = 0;
  ai.stuckTimer = 0;
  ai.recoveryTimer = 0;
  ai.phase = index * 1.37;
  ai.lastInput = { throttle: false, brake: false, steer: 0, drift: false, boost: false };
  return ai;
}

export function resetAIState(ai, track, index = null) {
  const idx = index !== null ? index : ai.index || 0;
  const profile = AI_PROFILES[idx % AI_PROFILES.length];
  const carDef = getCar(profile.carId);
  const spawnS = 8 + idx * 6;
  const lane = safeSpawnLane(track, profile.baseLane);

  resetCarPhysicsState(ai, track, carDef, { s: spawnS, lane });
  ai.index = idx;
  ai.profile = profile;
  ai.basePace = profile.basePace;
  ai.baseLane = lane;
  ai.dynamicLaneOffset = 0;
  ai.lap = 1;
  ai.checkpointIndex = 0;
  ai.stuckTimer = 0;
  ai.recoveryTimer = 0;
  ai.lastInput = { throttle: false, brake: false, steer: 0, drift: false, boost: false };
  return ai;
}

/**
 * Sequential checkpoint & lap progression for any racer (player or AI).
 * Gates are placed so gates[0] is ahead at s = length / N and gates[N-1] is at s = 0.
 */
export function updateRacerCheckpoints(racer, track) {
  if (!racer || !racer.pos || !track || !Array.isArray(track.gates) || track.gates.length === 0) {
    return { crossed: false, isLap: false, gate: null };
  }
  const n = track.gates.length;
  const idx = ((racer.checkpointIndex || 0) % n + n) % n;
  const gate = track.gates[idx];

  const dx = racer.pos.x - gate.x;
  const dy = (racer.pos.y || 0) - (gate.y || 0);
  const dz = racer.pos.z - gate.z;
  const dist = Math.hypot(dx, dy * 1.5, dz);

  // Require forward motion so reversing across s=0 cannot trigger gates[N-1]
  if (dist <= gate.radius && (racer.speed || 0) > -0.5) {
    const isLap = !!gate.isStartFinish || idx === n - 1;
    if (isLap) {
      racer.lap = (racer.lap || 1) + 1;
      racer.checkpointIndex = 0;
    } else {
      racer.checkpointIndex = idx + 1;
    }
    return { crossed: true, isLap, gate };
  }
  return { crossed: false, isLap: false, gate };
}

/**
 * Sector-gated spline progress metric preventing reverse-across-start-line exploits.
 */
export function computeRacerProgress(racer, track) {
  if (!racer || !track || !Number.isFinite(track.length) || track.length <= 0) return 0;
  const L = track.length;
  const n = Math.max(1, Array.isArray(track.gates) ? track.gates.length : 12);
  const lap = Math.max(1, racer.lap || 1);
  const cpIdx = clamp(racer.checkpointIndex || 0, 0, n - 1, 0);

  let s = Number.isFinite(racer.trackS) ? racer.trackS : 0;

  // Anti-reverse-lap: if still on lap 1, checkpoint 0, and reversed behind s = 0
  if (lap === 1 && cpIdx === 0 && s > L * 0.65) {
    s = s - L;
  } else {
    // Also prevent jumping ahead on early checkpoints if near s=0 wrap
    const maxAllowedS = ((cpIdx + 1.45) / n) * L;
    if (cpIdx < n - 2 && s > maxAllowedS && s > L * 0.72) {
      s = s - L;
    }
    // If on final sector after passing gate n-2 and just crossed s=0 line slightly early
    if (cpIdx === n - 1 && s < L * 0.25) {
      s = L + s;
    }
  }

  return (lap - 1) * L + s;
}

export function computeRaceStandings(player, aiList, track) {
  const racers = [];
  if (player) {
    racers.push({
      id: "player",
      isPlayer: true,
      racer: player,
      progress: computeRacerProgress(player, track)
    });
  }
  if (Array.isArray(aiList)) {
    for (let i = 0; i < aiList.length; i++) {
      const ai = aiList[i];
      if (!ai) continue;
      racers.push({
        id: ai.id || `ai_${i}`,
        isPlayer: false,
        racer: ai,
        progress: computeRacerProgress(ai, track)
      });
    }
  }
  racers.sort((a, b) => b.progress - a.progress);
  let position = 1;
  for (let i = 0; i < racers.length; i++) {
    if (racers[i].isPlayer) {
      position = i + 1;
      break;
    }
  }
  return {
    position,
    standings: racers
  };
}

export function getNextCheckpointInfo(track, checkpointIndex = 0, pos = null) {
  if (!track || !Array.isArray(track.gates) || track.gates.length === 0) {
    return {
      checkpointIndex: 0,
      nextCheckpointPos: { x: 0, y: 0, z: 0 },
      nextCheckpointDirDeg: 0
    };
  }
  const n = track.gates.length;
  const idx = ((checkpointIndex % n) + n) % n;
  const gate = track.gates[idx];
  const nextCheckpointPos = { x: gate.x, y: gate.y, z: gate.z };

  let dirRad = gate.angle || 0;
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) {
    const dx = gate.x - pos.x;
    const dz = gate.z - pos.z;
    if (Math.hypot(dx, dz) > 1.5) {
      dirRad = Math.atan2(dx, dz);
    }
  }
  return {
    checkpointIndex: idx,
    nextCheckpointPos,
    nextCheckpointDirDeg: (dirRad * 180) / Math.PI
  };
}

/**
 * Steps a single AI racer through shared physics (`stepCarPhysics`), with:
 * - Wrap-around spline lookahead steering
 * - Dynamic overtaking lane offsets
 * - Curvature braking & genuine AI drifting (generating slip/smoke/skids/boost)
 * - Fair pacing (0.92x - 1.08x) relative to player
 * - Stuck-against-barrier recovery
 */
export function stepAI(ai, dt = FIXED_DT, track = null, context = {}) {
  if (!ai || !track || typeof track.at !== "function") return ai;
  const dtSafe = clamp(dt, 0, 0.05, FIXED_DT);
  const L = track.length;

  const allCars = Array.isArray(context)
    ? context
    : Array.isArray(context?.allCars)
    ? context.allCars
    : [];
  const player = context && !Array.isArray(context) ? context.player : null;
  const playerProg =
    context && !Array.isArray(context) && Number.isFinite(context.playerProgress)
      ? context.playerProgress
      : player
      ? computeRacerProgress(player, track)
      : computeRacerProgress(ai, track);

  // Stuck detection & recovery
  if (Math.abs(ai.speed || 0) < 2.5 && ai.time > 1.4) {
    ai.stuckTimer = (ai.stuckTimer || 0) + dtSafe;
  } else {
    ai.stuckTimer = 0;
  }
  if (ai.stuckTimer > 1.0 && (ai.recoveryTimer || 0) <= 0) {
    ai.recoveryTimer = 0.72;
    ai.stuckTimer = 0;
  }

  // Dynamic overtaking offset scan against cars ahead
  let desiredDynOffset = 0;
  const curTargetLane = ai.baseLane + (ai.dynamicLaneOffset || 0);
  let nearestAheadDist = 52;

  for (let i = 0; i < allCars.length; i++) {
    const other = allCars[i];
    if (!other || other === ai || !other.pos) continue;
    if (Math.abs((other.pos.y || 0) - (ai.pos.y || 0)) > 3.2) continue;

    let ds = (other.trackS || 0) - (ai.trackS || 0);
    if (ds < 0) ds += L;
    const isSlow = Math.abs(other.speed || 0) < 4.0;
    const scanDist = isSlow ? 52 : 34;
    const laneTol = isSlow ? 4.6 : 3.4;
    if (ds > 1.0 && ds < Math.min(nearestAheadDist, scanDist)) {
      const latDiff = Math.abs((other.lateralOffset || 0) - curTargetLane);
      if (latDiff < laneTol) {
        nearestAheadDist = ds;
        // Pick the passing lane on the side away from the car ahead (avoiding crossing its lane)
        const aiCurrentLat = Number.isFinite(ai.lateralOffset) ? ai.lateralOffset : ai.baseLane;
        const otherLat = other.lateralOffset || 0;
        const passSign = aiCurrentLat >= otherLat ? 1 : -1;
        const safePassLane = otherLat + passSign * (isSlow ? 5.2 : 4.2);
        desiredDynOffset = clamp(safePassLane - ai.baseLane, -7.2, 7.2, 0);
      }
    }
  }

  ai.dynamicLaneOffset += (desiredDynOffset - (ai.dynamicLaneOffset || 0)) * (1 - Math.exp(-dtSafe * 3.2));

  // Lookahead point along closed spline
  const lookDist = clamp(12 + 0.36 * Math.max(0, ai.speed || 0), 12, 30, 15);
  const targetS = (((ai.trackS || 0) + lookDist) % L + L) % L;
  const ahead = track.at(targetS);

  const safeMargin = Math.max(1.8, (ahead.halfWidth || track.halfWidth || 9) - 2.3);
  const targetLane = clamp(ai.baseLane + ai.dynamicLaneOffset, -safeMargin, safeMargin, 0);
  // lateralOffset > 0 is car-right (-binormal)
  const tx = ahead.x - ahead.bx * targetLane;
  const tz = ahead.z - ahead.bz * targetLane;

  const dx = tx - ai.pos.x;
  const dz = tz - ai.pos.z;
  const desiredYaw = Math.atan2(dx, dz);
  const headingErr = wrapAngleRad(desiredYaw - ai.yaw);

  // Upcoming curvature lookahead
  const p1 = track.at((((ai.trackS || 0) + 8) % L + L) % L);
  const p2 = track.at((((ai.trackS || 0) + 28) % L + L) % L);
  const p3 = track.at((((ai.trackS || 0) + 46) % L + L) % L);
  const c1 = Math.abs(wrapAngleRad(p2.angle - p1.angle));
  const c2 = Math.abs(wrapAngleRad(p3.angle - p1.angle));
  const cornerAngle = Math.max(c1, c2 * 0.72);

  // Fair rubber-banded pacing within [0.92x, 1.08x]
  const aiProg = computeRacerProgress(ai, track);
  const progressGap = player ? clamp((playerProg - aiProg) / 140, -1, 1, 0) : 0;
  const paceFactor = clamp((ai.basePace || 1.0) + progressGap * 0.08, 0.92, 1.08, 1.0);

  const cornerSpeedScale = clamp(1 - cornerAngle * 0.42, 0.48, 1.0, 1.0);
  const targetSpeed = (ai.def?.maxSpeed || 44) * paceFactor * cornerSpeedScale;

  let input;
  if ((ai.recoveryTimer || 0) > 0) {
    ai.recoveryTimer = Math.max(0, ai.recoveryTimer - dtSafe);
    // Reverse and turn toward track centerline
    const centerSteer = clamp(-(ai.lateralOffset || 0) * 0.35, -1, 1, 0);
    input = {
      throttle: false,
      brake: true,
      steer: centerSteer,
      drift: false,
      boost: false
    };
  } else {
    const steer = clamp(headingErr * 2.35, -1, 1, 0);
    const curSpeed = ai.speed || 0;
    const throttle = curSpeed < targetSpeed;
    const brake = curSpeed > targetSpeed + 5.0 && cornerAngle > 0.35;
    const wantDrift = cornerAngle > 0.28 && curSpeed > 15.5 && Math.abs(headingErr) > 0.12;
    const wantBoost = !wantDrift && (ai.boostTier || 0) >= 1 && Math.abs(headingErr) < 0.22;

    input = {
      throttle,
      brake,
      steer,
      drift: wantDrift,
      boost: wantBoost
    };
  }

  ai.lastInput = input;
  stepCarPhysics(ai, input, dtSafe, track);
  updateRacerCheckpoints(ai, track);
  return ai;
}

export function stepAllAI(aiList, dt = FIXED_DT, track = null, player = null) {
  if (!Array.isArray(aiList) || !track) return;
  const allCars = player ? [player, ...aiList] : aiList;
  const playerProg = player ? computeRacerProgress(player, track) : 0;
  for (let i = 0; i < aiList.length; i++) {
    stepAI(aiList[i], dt, track, { allCars, player, playerProgress: playerProg });
  }
  resolveCarCollisions(allCars);
}

// Backward-compatible aliases
export function aiProgress(ai, track) {
  return computeRacerProgress(ai, track);
}

export function playerProgress(playerPosOrState, track, lap = 1, stride = 0) {
  if (playerPosOrState && typeof playerPosOrState.trackS === "number") {
    return computeRacerProgress(playerPosOrState, track);
  }
  if (!track || !playerPosOrState) return 0;
  const proj = track.projectToTrack(playerPosOrState.x || 0, playerPosOrState.z || 0, stride >= 0 ? stride : -1);
  return computeRacerProgress({ lap, checkpointIndex: 0, trackS: proj.s }, track);
}
