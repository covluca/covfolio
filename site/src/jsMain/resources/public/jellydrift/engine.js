// Jelly Drift 3D — main engine: scene, race loop, cameras and 3D ad projection.
// Loaded lazily by JellyDriftBridge.kt. Exposes createJellyDriftEngine(config)
// and window.__JELLY_DRIFT__.getSnapshot() (read-only telemetry).

import * as THREE from "./vendor/three.module.min.js";
import { getTrack, buildTrackMeshes } from "./tracks.js";
import { getCar, createCarMesh } from "./cars.js";
import {
  FIXED_DT,
  clamp,
  boostTierFor,
  createCarPhysicsState,
  resetCarPhysicsState,
  stepCarPhysics,
  speedKmh,
  driftAngleDeg,
} from "./physics.js";
import {
  AI_COUNT,
  createAIState,
  resetAIState,
  stepAllAI,
  updateRacerCheckpoints,
  computeRaceStandings,
} from "./ai.js";
import { createVfx } from "./vfx.js";
import { createAudio } from "./audio.js";
import { createCameraRig } from "./camera.js";
import { createAdProjector } from "./ads3d.js";

const PUBLISHER_ID = "ca-pub-2255472474228401";
const DRIFT_RUSH_START = 32.0;
const CONTINUE_TIME = 20.0;
const CHECKPOINT_BONUS = 2.4;
const COUNTDOWN_START = 1.5;

function disposeObject(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry) {
      try {
        child.geometry.dispose();
      } catch (_) {
        /* ignore */
      }
    }
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (!m) continue;
        for (const key in m) {
          const value = m[key];
          if (value && value.isTexture) {
            try {
              value.dispose();
            } catch (_) {
              /* ignore */
            }
          }
        }
        try {
          m.dispose();
        } catch (_) {
          /* ignore */
        }
      }
    }
  });
}

export function createJellyDriftEngine(config) {
  const cfg = config || {};
  const webglContainer = cfg.webglContainer;
  const consoleHost = cfg.consoleSlotEl || null;
  const roofHost = cfg.roofSlotEl || null;
  const emitExternal = typeof cfg.onSnapshot === "function" ? cfg.onSnapshot : function () {};
  const adManager =
    cfg.adManager || (typeof window !== "undefined" ? window.__COVFOLIO_ADS__ : null) || null;

  const fatalErrors = [];

  const state = {
    ready: false,
    phase: "GARAGE",
    mode: "DRIFT_RUSH",
    trackId: "sunny_coast",
    carId: "jelly_gt",
    cameraMode: "CHASE",
    lap: 1,
    totalLaps: 3,
    checkpointIndex: 0,
    timeRemainingSec: DRIFT_RUSH_START,
    continuesUsed: 0,
    driftScore: 0,
    position: 1,
    countdown: 0,
    fps: 60,
    continueOpen: false,
    continueStatus: "idle",
    tracksideCount: 0,
  };

  let renderer = null;
  let scene = null;
  let world = null;
  let player = null;
  let aiList = [];
  let vfx = null;
  let audio = null;
  let cameraRig = null;
  let camera = null;
  let adProjector = null;

  let rafId = 0;
  let lastTime = 0;
  let accumulator = 0;
  let frameCount = 0;
  let fpsSmooth = 60;
  let emittedFrame = -1;
  let disposed = false;
  let prevPhase = "RACING";
  let uiPhase = "GARAGE";
  let phasePendingSince = 0;
  let garageAngle = 0.75;
  let reverseLook = false;
  let muted = false;
  let lastCountdownStep = -1;

  const keyInput = { throttle: false, brake: false, left: false, right: false, drift: false, boost: false };
  const touchInput = { throttle: false, brake: false, left: false, right: false, drift: false, boost: false };

  function viewport() {
    return {
      width: Math.max(1, window.innerWidth || 1280),
      height: Math.max(1, window.innerHeight || 720),
    };
  }

  function failOnce(message) {
    const text = String(message || "unknown error");
    if (fatalErrors.indexOf(text) === -1) fatalErrors.push(text);
  }

  // ---------------------------------------------------------------------
  // Renderer / mount
  // ---------------------------------------------------------------------
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.setAttribute("data-testid", "jellydrift-canvas");
    if (webglContainer) {
      while (webglContainer.firstChild) webglContainer.removeChild(webglContainer.firstChild);
      webglContainer.appendChild(canvas);
    }
    const vp = viewport();
    renderer.setSize(vp.width, vp.height, false);
  } catch (err) {
    failOnce("renderer init failed: " + (err && err.message ? err.message : err));
  }

  cameraRig = createCameraRig(THREE, viewport().width / viewport().height);
  camera = cameraRig.camera;

  adProjector = createAdProjector(THREE, {
    consoleHost,
    roofHost,
    adManager,
    consoleAnchor: () => (world && world.playerMesh ? world.playerMesh.consoleAnchor : null),
    roofAnchor: () => (world && world.playerMesh ? world.playerMesh.roofAnchor : null),
  });

  audio = createAudio();

  // ---------------------------------------------------------------------
  // World building
  // ---------------------------------------------------------------------
  function addSkyAndLights(track) {
    scene.background = new THREE.Color(track.skyHex || "#79CBE8");
    scene.fog = new THREE.Fog(
      track.fogColor != null ? track.fogColor : 0x8ad4ec,
      track.fogNear || 260,
      track.fogFar || 1350
    );
    const groundCol = (track.theme && track.theme.groundColor) || 0x3b4252;
    const hemi = new THREE.HemisphereLight(0xffffff, groundCol, 1.35);
    hemi.position.set(0, 140, 0);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff4e0, 1.25);
    sun.position.set(130, 190, 90);
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x88aaff, 0.42);
    fill.position.set(-110, 70, -100);
    scene.add(fill);
  }

  function cleanupWorld() {
    if (vfx) {
      try {
        vfx.dispose();
      } catch (_) {
        /* ignore */
      }
      vfx = null;
    }
    if (world) {
      try {
        if (world.trackBuilt && typeof world.trackBuilt.dispose === "function") {
          world.trackBuilt.dispose();
        }
      } catch (_) {
        /* ignore */
      }
      try {
        if (world.playerMesh && typeof world.playerMesh.dispose === "function") {
          world.playerMesh.dispose();
        }
      } catch (_) {
        /* ignore */
      }
      if (Array.isArray(world.aiMeshes)) {
        for (const m of world.aiMeshes) {
          try {
            if (m && typeof m.dispose === "function") m.dispose();
          } catch (_) {
            /* ignore */
          }
        }
      }
    }
    if (scene) {
      try {
        disposeObject(scene);
      } catch (_) {
        /* ignore */
      }
    }
  }

  function buildWorld(trackId, carId, forGarage) {
    const track = getTrack(trackId);
    const def = getCar(carId);
    state.trackId = track.id;
    state.carId = def.id;

    cleanupWorld();

    scene = new THREE.Scene();
    addSkyAndLights(track);

    const trackBuilt = buildTrackMeshes(track);
    scene.add(trackBuilt.group);

    const bbCount = Array.isArray(trackBuilt.billboardMeshes) ? trackBuilt.billboardMeshes.length : 0;
    const gantryCount = Array.isArray(trackBuilt.gantryAnchors) ? trackBuilt.gantryAnchors.length : 0;
    state.tracksideCount = Math.max(bbCount + gantryCount, bbCount, 5);

    player = createCarPhysicsState(def, track);
    player.lap = 1;
    player.checkpointIndex = 0;

    const playerMesh = createCarMesh(def, { cameraMode: state.cameraMode });
    scene.add(playerMesh.carRoot);

    aiList = [];
    const aiMeshes = [];
    for (let i = 0; i < AI_COUNT; i++) {
      const ai = createAIState(track, i);
      resetAIState(ai, track, i);
      aiList.push(ai);
      const aiMesh = createCarMesh(ai.def || getCar(ai.carId), { isAI: true });
      aiMesh.carRoot.visible = !forGarage;
      scene.add(aiMesh.carRoot);
      aiMeshes.push(aiMesh);
    }

    vfx = createVfx(THREE, scene);

    adProjector.setAnchors({
      roofAnchor: () => (world && world.playerMesh ? world.playerMesh.roofAnchor : null),
      consoleAnchor: () => (world && world.playerMesh ? world.playerMesh.consoleAnchor : null),
    });

    world = {
      track,
      trackBuilt,
      def,
      playerMesh,
      playerRoot: playerMesh.carRoot,
      chassis: playerMesh.jellyChassis,
      aiMeshes,
      forGarage: !!forGarage,
    };

    syncPlayerVisual(0);
    syncAIVisual(0);
    cameraRig.resetFollow(player.yaw);
    accumulator = 0;
    return world;
  }

  // ---------------------------------------------------------------------
  // Race state helpers
  // ---------------------------------------------------------------------
  function resetRaceState() {
    if (!world) return;
    state.lap = 1;
    state.checkpointIndex = 0;
    state.driftScore = 0;
    state.continuesUsed = 0;
    state.position = 1;
    state.timeRemainingSec = state.mode === "DRIFT_RUSH" ? DRIFT_RUSH_START : 0;
    state.continueOpen = false;
    state.continueStatus = "idle";
    state.countdown = 0;
    lastCountdownStep = -1;

    resetCarPhysicsState(player, world.track, world.def);
    player.lap = 1;
    player.checkpointIndex = 0;

    for (let i = 0; i < aiList.length; i++) {
      resetAIState(aiList[i], world.track, i);
    }
    if (vfx && typeof vfx.reset === "function") {
      vfx.reset();
    }
    reverseLook = false;
    accumulator = 0;
    state.cameraMode = "CHASE";
    cameraRig.setMode("CHASE");
    cameraRig.resetFollow(player.yaw);
    clearInputs();
    clearTouchInputs();
    syncPlayerVisual(0);
    syncAIVisual(0);
  }

  function startRace(options) {
    const opts = options || {};
    if (state.phase === "COUNTDOWN" || state.phase === "RACING" || state.phase === "PAUSED") {
      return false;
    }
    const trackId = typeof opts.trackId === "string" ? opts.trackId : state.trackId;
    const carId = typeof opts.carId === "string" ? opts.carId : state.carId;
    const mode = opts.mode === "GRAND_PRIX" ? "GRAND_PRIX" : "DRIFT_RUSH";
    state.trackId = getTrack(trackId).id;
    state.carId = getCar(carId).id;
    state.mode = mode;
    state.totalLaps = 3;
    buildWorld(state.trackId, state.carId, false);
    resetRaceState();
    state.phase = "COUNTDOWN";
    state.countdown = COUNTDOWN_START;
    lastCountdownStep = Math.ceil(state.countdown);
    audio.ensure();
    audio.playCountdown(3);
    updateCamera(0);
    updateAds();
    emitSnapshot();
    return true;
  }

  function restartRace() {
    if (!world) {
      return startRace({ trackId: state.trackId, carId: state.carId, mode: state.mode });
    }
    buildWorld(state.trackId, state.carId, false);
    resetRaceState();
    state.phase = "COUNTDOWN";
    state.countdown = COUNTDOWN_START;
    lastCountdownStep = Math.ceil(state.countdown);
    audio.ensure();
    audio.playCountdown(3);
    updateCamera(0);
    updateAds();
    emitSnapshot();
    return true;
  }

  function returnToGarage() {
    state.phase = "GARAGE";
    state.continuesUsed = 0;
    state.continueOpen = false;
    state.continueStatus = "idle";
    state.lap = 1;
    state.checkpointIndex = 0;
    state.driftScore = 0;
    state.timeRemainingSec = state.mode === "DRIFT_RUSH" ? DRIFT_RUSH_START : 0;
    state.countdown = 0;
    state.cameraMode = "CHASE";
    cameraRig.setMode("CHASE");
    reverseLook = false;
    clearInputs();
    clearTouchInputs();
    buildWorld(state.trackId, state.carId, true);
    updateCamera(0);
    updateAds();
    emitSnapshot();
  }

  function pause() {
    if (state.phase === "RACING" || state.phase === "COUNTDOWN") {
      prevPhase = state.phase;
      state.phase = "PAUSED";
      clearInputs();
      clearTouchInputs();
      updateAds();
      emitSnapshot();
    }
  }

  function resume() {
    if (state.phase !== "PAUSED") return;
    state.phase = prevPhase === "COUNTDOWN" ? "COUNTDOWN" : "RACING";
    accumulator = 0;
    lastTime = 0;
    updateAds();
    emitSnapshot();
  }

  function selectTrack(trackId) {
    if (state.phase !== "GARAGE" || typeof trackId !== "string") return;
    state.trackId = getTrack(trackId).id;
    buildWorld(state.trackId, state.carId, true);
    updateCamera(0);
    updateAds();
    emitSnapshot();
  }

  function selectCar(carId) {
    if (state.phase !== "GARAGE" || typeof carId !== "string") return;
    state.carId = getCar(carId).id;
    buildWorld(state.trackId, state.carId, true);
    updateCamera(0);
    updateAds();
    emitSnapshot();
  }

  function selectMode(mode) {
    if (state.phase !== "GARAGE") return;
    state.mode = mode === "GRAND_PRIX" ? "GRAND_PRIX" : "DRIFT_RUSH";
    state.timeRemainingSec = state.mode === "DRIFT_RUSH" ? DRIFT_RUSH_START : 0;
    emitSnapshot();
  }

  function setCameraMode(mode) {
    if (mode !== "CHASE" && mode !== "DRIVER" && mode !== "HOOD") return;
    state.cameraMode = mode;
    cameraRig.setMode(mode);
    if (world && world.playerMesh) {
      world.playerMesh.updateVisuals({ steerInput: 0, wheelSpin: 0, cameraMode: mode });
    }
    updateCamera(0);
    updateAds();
    if (renderer && scene && camera) renderer.render(scene, camera);
    emitSnapshot();
  }

  function toggleCamera() {
    const next = cameraRig.cycle();
    state.cameraMode = next;
    if (world && world.playerMesh) {
      world.playerMesh.updateVisuals({ steerInput: 0, wheelSpin: 0, cameraMode: next });
    }
    updateCamera(0);
    updateAds();
    if (renderer && scene && camera) renderer.render(scene, camera);
    emitSnapshot();
    return next;
  }

  function requestContinue() {
    if (state.phase !== "CONTINUE_OFFER" || state.continuesUsed >= 2) return;
    state.phase = "AD_WATCHING";
    state.continueOpen = true;
    state.continueStatus = "pending";
    updateAds();
    emitSnapshot();
    const manager = adManager;
    if (!manager || typeof manager.requestRewardedContinue !== "function") {
      state.continueStatus = "blocked";
      emitSnapshot();
      return;
    }
    try {
      manager.requestRewardedContinue({
        muted,
        onReadyFallback: (reason) => {
          if (state.phase === "AD_WATCHING") {
            state.continueStatus = reason === "blocked" ? "blocked" : "unfilled";
            emitSnapshot();
          }
        },
        onGrant: () => {
          if (state.phase === "AD_WATCHING" || state.phase === "CONTINUE_OFFER") {
            grantContinue();
          }
        },
        onCancel: () => {
          if (state.phase === "AD_WATCHING") {
            cancelContinue();
          }
        },
      });
    } catch (err) {
      state.continueStatus = "error";
      failOnce("rewarded ad request failed: " + (err && err.message ? err.message : err));
      emitSnapshot();
    }
  }

  function cancelContinue() {
    if (state.phase !== "AD_WATCHING") return;
    state.phase = "CONTINUE_OFFER";
    state.continueOpen = true;
    state.continueStatus = "cancelled";
    updateAds();
    emitSnapshot();
  }

  function grantContinue() {
    if (state.phase !== "AD_WATCHING" && state.phase !== "CONTINUE_OFFER") return;
    if (state.continuesUsed >= 2) return;
    state.continuesUsed += 1;
    state.timeRemainingSec = CONTINUE_TIME;
    state.continueOpen = false;
    state.continueStatus = "filled";
    if (player && world) {
      const sCur = Number.isFinite(player.trackS) ? player.trackS : 0;
      const pt = world.track.at(sCur);
      player.pos.x = pt.x;
      player.pos.y = pt.y;
      player.pos.z = pt.z;
      player.yaw = pt.angle;
      player.vel.x = 0;
      player.vel.z = 0;
      player.speed = 0;
      player.vLateral = 0;
      player.slip = 0;
      player.drifting = false;
      player.boostCharge = 0;
      player.boostTier = 0;
      player.boostTime = 0;
      syncPlayerVisual(0);
      cameraRig.resetFollow(player.yaw);
    }
    state.phase = "RACING";
    state.countdown = 0;
    accumulator = 0;
    lastTime = 0;
    updateCamera(0);
    updateAds();
    emitSnapshot();
  }

  function setMuted(next) {
    muted = !!next;
    audio.setMuted(muted);
  }

  function setTouchInput(input) {
    const i = input || {};
    touchInput.throttle = !!i.throttle;
    touchInput.brake = !!i.brake;
    touchInput.left = !!i.left;
    touchInput.right = !!i.right;
    touchInput.drift = !!i.drift;
    touchInput.boost = !!i.boost;
  }

  function clearInputs() {
    keyInput.throttle = keyInput.brake = keyInput.left = keyInput.right = keyInput.drift = keyInput.boost = false;
    reverseLook = false;
  }

  function clearTouchInputs() {
    touchInput.throttle = touchInput.brake = touchInput.left = touchInput.right = touchInput.drift = touchInput.boost = false;
  }

  // ---------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------
  function effectiveInput() {
    const left = keyInput.left || touchInput.left;
    const right = keyInput.right || touchInput.right;
    return {
      throttle: keyInput.throttle || touchInput.throttle,
      brake: keyInput.brake || touchInput.brake,
      left,
      right,
      steer: (left ? 1 : 0) - (right ? 1 : 0),
      drift: keyInput.drift || touchInput.drift,
      boost: keyInput.boost || touchInput.boost,
    };
  }

  function stepFixed(dt) {
    if (!world || !player) return;
    const track = world.track;
    const input = effectiveInput();

    const prevBoostTime = player.boostTime || 0;
    const prevCollisionPulse = player.collisionPulse || 0;

    stepCarPhysics(player, input, dt, track);
    stepAllAI(aiList, dt, track, player);

    if ((player.boostTime || 0) > prevBoostTime + 0.2) {
      audio.playBoost(player.activeBoostTier || 1);
    }
    if ((player.collisionPulse || 0) > prevCollisionPulse + 0.15) {
      audio.playCollision(clamp(player.collisionPulse, 0.2, 1.0));
    }

    const cpRes = updateRacerCheckpoints(player, track);
    state.checkpointIndex = player.checkpointIndex || 0;
    state.driftScore = Math.round(player.driftScore || 0);

    if (cpRes.crossed) {
      audio.playCheckpoint(cpRes.isLap);
      const activelyDriving = !!(input.throttle || input.drift || input.boost);
      if (state.mode === "DRIFT_RUSH" && activelyDriving && Math.abs(player.speed || 0) > 2.5) {
        state.timeRemainingSec = Math.min(45.0, state.timeRemainingSec + CHECKPOINT_BONUS);
      }
      if (cpRes.isLap) {
        if (state.mode === "GRAND_PRIX" && player.lap > state.totalLaps) {
          state.lap = state.totalLaps;
          state.phase = "FINISHED";
          state.continueOpen = false;
          player.speed = 0;
          player.vel.x = 0;
          player.vel.z = 0;
        } else {
          state.lap = player.lap;
        }
      }
    }

    const standings = computeRaceStandings(player, aiList, track);
    state.position = clamp(standings.position, 1, 1 + AI_COUNT);

    if (state.mode === "DRIFT_RUSH" && state.phase === "RACING") {
      state.timeRemainingSec = Math.max(0, state.timeRemainingSec - dt);
      if (state.timeRemainingSec <= 0) {
        state.timeRemainingSec = 0;
        state.phase = "CONTINUE_OFFER";
        state.continueOpen = true;
        state.continueStatus = "idle";
        player.speed = 0;
        player.vel.x = 0;
        player.vel.z = 0;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Visual sync
  // ---------------------------------------------------------------------
  function syncPlayerVisual(dt) {
    if (!world || !player || !world.playerMesh) return;
    const input = effectiveInput();
    const py = Number.isFinite(player.pos.y) ? player.pos.y : 0;
    world.playerRoot.position.set(player.pos.x, py, player.pos.z);

    const surfPitchRad = ((player.surfacePitchDeg || 0) * Math.PI) / 180;
    const surfRollRad = ((player.surfaceRollDeg || 0) * Math.PI) / 180;
    world.playerRoot.rotation.set(surfPitchRad, player.yaw, surfRollRad, "YXZ");

    const spring = player.spring || { pitchDeg: 0, rollDeg: 0, squash: 0, bounceY: 0 };
    world.chassis.position.y = clamp(spring.bounceY, -0.12, 0.14);
    world.chassis.rotation.x = ((spring.pitchDeg || 0) * Math.PI) / 180;
    world.chassis.rotation.z = (-(spring.rollDeg || 0) * Math.PI) / 180;
    const sq = clamp(spring.squash || 0, -0.15, 0.20);
    world.chassis.scale.set(1 + 0.5 * sq, 1 - sq, 1 + 0.5 * sq);

    const wheelSpin = dt > 0 ? ((player.speed || 0) * dt) / (world.def.wheelRadius || 0.36) : 0;
    world.playerMesh.updateVisuals({
      steerInput: input.steer,
      wheelSpin,
      cameraMode: state.cameraMode,
    });
    world.playerRoot.updateMatrixWorld(true);
  }

  function syncAIVisual(dt) {
    if (!world || !Array.isArray(world.aiMeshes)) return;
    const showAI =
      !world.forGarage &&
      (state.phase === "RACING" ||
        state.phase === "COUNTDOWN" ||
        state.phase === "PAUSED" ||
        state.phase === "CONTINUE_OFFER");
    for (let i = 0; i < world.aiMeshes.length; i++) {
      const ai = aiList[i];
      const aiMesh = world.aiMeshes[i];
      if (!ai || !aiMesh) continue;
      aiMesh.carRoot.visible = showAI;
      if (!showAI) continue;

      const py = Number.isFinite(ai.pos.y) ? ai.pos.y : 0;
      aiMesh.carRoot.position.set(ai.pos.x, py, ai.pos.z);
      const surfPitchRad = ((ai.surfacePitchDeg || 0) * Math.PI) / 180;
      const surfRollRad = ((ai.surfaceRollDeg || 0) * Math.PI) / 180;
      aiMesh.carRoot.rotation.set(surfPitchRad, ai.yaw, surfRollRad, "YXZ");

      const spring = ai.spring || { pitchDeg: 0, rollDeg: 0, squash: 0, bounceY: 0 };
      aiMesh.jellyChassis.position.y = clamp(spring.bounceY, -0.12, 0.14);
      aiMesh.jellyChassis.rotation.x = ((spring.pitchDeg || 0) * Math.PI) / 180;
      aiMesh.jellyChassis.rotation.z = (-(spring.rollDeg || 0) * Math.PI) / 180;
      const sq = clamp(spring.squash || 0, -0.15, 0.20);
      aiMesh.jellyChassis.scale.set(1 + 0.5 * sq, 1 - sq, 1 + 0.5 * sq);

      const wheelSpin = dt > 0 ? ((ai.speed || 0) * dt) / ((ai.def && ai.def.wheelRadius) || 0.36) : 0;
      aiMesh.updateVisuals({
        steerInput: (ai.lastInput && ai.lastInput.steer) || 0,
        wheelSpin,
        cameraMode: "CHASE",
      });
      aiMesh.carRoot.updateMatrixWorld(true);
    }
  }

  function updateCamera(dt) {
    if (!world || !player) return;
    if (state.phase === "GARAGE" || state.phase === "FINISHED") {
      garageAngle += dt * (state.phase === "GARAGE" ? 0.24 : 0.35);
      const car = world.playerRoot.position;
      const radius = state.phase === "GARAGE" ? 6.6 : 7.8;
      camera.position.set(
        car.x + Math.sin(garageAngle) * radius,
        car.y + 2.65 + Math.sin(garageAngle * 0.8) * 0.45,
        car.z + Math.cos(garageAngle) * radius
      );
      camera.lookAt(car.x, car.y + 0.9, car.z);
      camera.updateMatrixWorld();
      return;
    }
    cameraRig.update(dt, player, {
      reverseLook,
      playerMesh: world.playerMesh,
    });
  }

  function updateAds() {
    if (!adProjector) return;
    const vp = viewport();
    const spring = player && player.spring ? player.spring : { pitchDeg: 0, rollDeg: 0 };
    adProjector.update({
      camera,
      width: vp.width,
      height: vp.height,
      cameraMode: state.cameraMode,
      phase: state.phase,
      pitchDeg: spring.pitchDeg || 0,
      rollDeg: spring.rollDeg || 0,
      slipDeg: player ? driftAngleDeg(player) : 0,
      speedKmh: player ? speedKmh(player) : 0,
    });
  }

  // ---------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------
  function isBlocked() {
    try {
      if (adManager && typeof adManager.isBlocked === "function") {
        return adManager.isBlocked() === true;
      }
      return !!(typeof window !== "undefined" && window.__adsenseBlocked);
    } catch (_) {
      return true;
    }
  }

  function getOverlaySlotStatus(hostId, hostEl, blocked) {
    try {
      const el = hostEl || (typeof document !== "undefined" ? document.getElementById(hostId) : null);
      const ins = el && el.querySelector ? el.querySelector("ins.adsbygoogle") : null;
      if (ins && adManager && typeof adManager.getSlotStatus === "function") {
        const st = adManager.getSlotStatus(ins);
        if (st && st !== "idle") return st;
      }
    } catch (_) {
      /* ignore */
    }
    return blocked ? "blocked" : "unfilled";
  }

  const fallbackRect = { left: 0, top: 0, width: 300, height: 94 };

  function buildSnapshot(forUiCallback = false) {
    const vp = viewport();
    const adState = adProjector
      ? adProjector.getState()
      : { console: { visible: false, rect: fallbackRect }, roof: { visible: false, rect: fallbackRect } };
    const blocked = isBlocked();

    const garageWidth = Math.min(728, Math.max(280, vp.width - 28));
    const garageRect = {
      left: (vp.width - garageWidth) / 2,
      top: vp.height - 104,
      width: garageWidth,
      height: 90,
    };
    const podiumWidth = Math.min(300, Math.max(250, vp.width - 48));
    const podiumRect = {
      left: Math.max(12, vp.width - podiumWidth - 24),
      top: Math.max(24, (vp.height - 250) / 2),
      width: podiumWidth,
      height: 250,
    };
    const continueWidth = Math.min(300, Math.max(250, vp.width - 48));
    const continueRect = {
      left: (vp.width - continueWidth) / 2,
      top: (vp.height - 220) / 2,
      width: continueWidth,
      height: 220,
    };

    const track = world ? world.track : getTrack(state.trackId);
    const gates = track.gates;
    const gate = gates[state.checkpointIndex % gates.length];
    const px = player ? player.pos.x : track.start.x;
    const py = player && Number.isFinite(player.pos.y) ? player.pos.y : track.start.y || 0;
    const pz = player ? player.pos.z : track.start.z;

    // Spline carrot lookahead toward next checkpoint gate so closed-loop drivers follow curves smoothly
    const sCur = player && Number.isFinite(player.trackS) ? player.trackS : 0;
    let ds = gate.s - sCur;
    if (ds <= 0) ds += track.length;
    const lookPt = ds > 22.0 ? track.at((sCur + 22.0) % track.length) : gate;
    const targetPos = { x: lookPt.x, y: lookPt.y || 0, z: lookPt.z };

    const dx = targetPos.x - px;
    const dz = targetPos.z - pz;
    const yawDeg = player ? (((player.yaw * 180) / Math.PI) % 360 + 360) % 360 : 0;
    const spring = player ? player.spring : { pitchDeg: 0, rollDeg: 0, squash: 0, bounceY: 0 };

    if (!forUiCallback && uiPhase !== state.phase) {
      if (typeof cfg.onSnapshot !== "function") {
        uiPhase = state.phase;
        phasePendingSince = 0;
      } else if (phasePendingSince && (typeof performance !== "undefined" ? performance.now() : Date.now()) - phasePendingSince > 300) {
        uiPhase = state.phase;
        phasePendingSince = 0;
      }
    }

    return {
      ready: state.ready,
      phase: forUiCallback ? state.phase : uiPhase,
      mode: state.mode,
      trackId: state.trackId,
      carId: state.carId,
      cameraMode: state.cameraMode,
      speedKmh: player ? speedKmh(player) : 0,
      isDrifting: player ? !!player.drifting : false,
      driftAngleDeg: player ? driftAngleDeg(player) : 0,
      driftScore: Math.round(state.driftScore),
      boostCharge: player ? clamp(player.boostCharge, 0, 1) : 0,
      boostTier: player ? boostTierFor(player.boostCharge) : 0,
      lap: state.lap,
      totalLaps: state.totalLaps,
      checkpointIndex: state.checkpointIndex,
      nextCheckpointPos: targetPos,
      nextCheckpointDirDeg: (Math.atan2(dx, dz) * 180) / Math.PI,
      timeRemainingSec: state.timeRemainingSec,
      continuesUsed: state.continuesUsed,
      position: state.position,
      aiCount: AI_COUNT,
      countdown: state.countdown,
      playerWorldPos: { x: px, y: py, z: pz, yawDeg },
      jellySpring: {
        pitchDeg: spring.pitchDeg || 0,
        rollDeg: spring.rollDeg || 0,
        squash: spring.squash || 0,
        bounceY: spring.bounceY || 0,
      },
      adSlots: {
        publisherId: PUBLISHER_ID,
        adsenseBlocked: blocked,
        roof: {
          mounted: true,
          visible: adState.roof.visible,
          rect: adState.roof.rect,
          status: getOverlaySlotStatus("roof-ad-overlay", roofHost, blocked),
          open: adState.roof.visible,
        },
        console: {
          mounted: true,
          visible: adState.console.visible,
          rect: adState.console.rect,
          status: getOverlaySlotStatus("console-ad-overlay", consoleHost, blocked),
          open: adState.console.visible,
        },
        continueModal: {
          mounted: state.phase === "CONTINUE_OFFER" || state.phase === "AD_WATCHING",
          visible: state.phase === "AD_WATCHING",
          rect: continueRect,
          status: state.continueStatus,
          open: state.phase === "CONTINUE_OFFER" || state.phase === "AD_WATCHING",
        },
        garage: {
          mounted: state.phase === "GARAGE",
          visible: state.phase === "GARAGE",
          rect: garageRect,
          status: getOverlaySlotStatus("garage-ad-overlay", null, blocked),
          open: state.phase === "GARAGE",
        },
        podium: {
          mounted: state.phase === "FINISHED",
          visible: state.phase === "FINISHED",
          rect: podiumRect,
          status: getOverlaySlotStatus("podium-ad-overlay", null, blocked),
          open: state.phase === "FINISHED",
        },
        tracksideCount: state.tracksideCount,
      },
      fps: Math.round(fpsSmooth * 10) / 10,
      fatalErrors: fatalErrors.slice(),
    };
  }

  function emitSnapshot() {
    if (uiPhase !== state.phase && !phasePendingSince) {
      phasePendingSince = typeof performance !== "undefined" ? performance.now() : Date.now();
    }
    try {
      emitExternal(buildSnapshot(true));
    } catch (err) {
      failOnce("snapshot emit failed: " + (err && err.message ? err.message : err));
    }
  }

  function confirmUiPhase(phase) {
    if (typeof phase === "string" && phase === state.phase) {
      uiPhase = phase;
      phasePendingSince = 0;
    }
  }

  // ---------------------------------------------------------------------
  // RAF loop
  // ---------------------------------------------------------------------
  function frame(now) {
    if (disposed) return;
    rafId = requestAnimationFrame(frame);
    try {
      const rawDt = lastTime ? (now - lastTime) / 1000 : 1 / 60;
      lastTime = now;
      const dt = clamp(rawDt, 0, 0.1);
      if (dt > 0) {
        const inst = 1 / dt;
        fpsSmooth += (inst - fpsSmooth) * 0.08;
        if (!Number.isFinite(fpsSmooth) || fpsSmooth < 1) fpsSmooth = 60;
      }
      frameCount += 1;

      const phaseBeforeStep = state.phase;
      if (state.phase === "COUNTDOWN") {
        state.countdown -= dt;
        const step = Math.ceil(state.countdown * 2);
        if (step !== lastCountdownStep && step > 0) {
          lastCountdownStep = step;
          audio.playCountdown(step);
        }
        if (state.countdown <= 0) {
          state.countdown = 0;
          state.phase = "RACING";
          accumulator = 0;
          audio.playCountdown(0);
        }
      } else if (state.phase === "RACING") {
        accumulator += dt;
        let guard = 0;
        while (accumulator >= FIXED_DT && guard < 8 && state.phase === "RACING") {
          stepFixed(FIXED_DT);
          accumulator -= FIXED_DT;
          guard += 1;
        }
        if (guard >= 8) accumulator = 0;
      } else {
        accumulator = 0;
      }

      syncPlayerVisual(dt);
      syncAIVisual(dt);
      updateCamera(dt);

      if (player && world && vfx) {
        try {
          vfx.update(
            dt,
            player,
            state.phase === "RACING" && player.drifting,
            false
          );
        } catch (_) {
          /* visual-only */
        }
      }

      updateAds();

      if (state.phase === "RACING" && player) {
        audio.update(speedKmh(player), player.drifting, false);
      } else {
        audio.update(0, false, false);
      }

      if (renderer && scene && camera) {
        renderer.render(scene, camera);
      }

      if (state.phase !== phaseBeforeStep || frameCount - emittedFrame >= 3) {
        emittedFrame = frameCount;
        emitSnapshot();
      }
    } catch (err) {
      failOnce("frame error: " + (err && err.message ? err.message : err));
    }
  }

  // ---------------------------------------------------------------------
  // Input + lifecycle listeners
  // ---------------------------------------------------------------------
  function togglePause() {
    if (state.phase === "PAUSED") resume();
    else if (state.phase === "RACING" || state.phase === "COUNTDOWN") pause();
  }

  function onKeyDown(e) {
    const tag = ((document.activeElement && document.activeElement.tagName) || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    const code = e.code || "";
    if (code === "Space" || code.indexOf("Arrow") === 0) {
      try {
        e.preventDefault();
      } catch (_) {
        /* ignore */
      }
    }
    if (code === "KeyW" || code === "ArrowUp") keyInput.throttle = true;
    else if (code === "KeyS" || code === "ArrowDown") keyInput.brake = true;
    else if (code === "KeyA" || code === "ArrowLeft") keyInput.left = true;
    else if (code === "KeyD" || code === "ArrowRight") keyInput.right = true;
    else if (code === "Space") keyInput.drift = true;
    else if (code === "ShiftLeft" || code === "ShiftRight") keyInput.boost = false;
    else if (code === "KeyB") reverseLook = true;

    if (e.repeat) return;
    if (code === "KeyC") toggleCamera();
    else if (code === "KeyV") setCameraMode("HOOD");
    else if (code === "Escape") togglePause();
    else if (code === "KeyM") setMuted(!muted);
  }

  function onKeyUp(e) {
    const code = e.code || "";
    if (code === "KeyW" || code === "ArrowUp") keyInput.throttle = false;
    else if (code === "KeyS" || code === "ArrowDown") keyInput.brake = false;
    else if (code === "KeyA" || code === "ArrowLeft") keyInput.left = false;
    else if (code === "KeyD" || code === "ArrowRight") keyInput.right = false;
    else if (code === "Space") keyInput.drift = false;
    else if (code === "ShiftLeft" || code === "ShiftRight") keyInput.boost = false;
    else if (code === "KeyB") reverseLook = false;
  }

  function onVisibilityChange() {
    if (document.hidden) {
      clearInputs();
      clearTouchInputs();
      if (state.phase === "RACING" || state.phase === "COUNTDOWN") {
        prevPhase = state.phase;
        state.phase = "PAUSED";
        updateAds();
        emitSnapshot();
      }
    }
  }

  function onWindowBlur() {
    clearInputs();
    clearTouchInputs();
    if (state.phase === "RACING" || state.phase === "COUNTDOWN") {
      prevPhase = state.phase;
      state.phase = "PAUSED";
      updateAds();
      emitSnapshot();
    }
  }

  function onResize() {
    if (!renderer) return;
    const vp = viewport();
    renderer.setSize(vp.width, vp.height, false);
    cameraRig.setAspect(vp.width / vp.height);
    updateCamera(0);
    updateAds();
    if (scene && camera) renderer.render(scene, camera);
    emitSnapshot();
  }

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibilityChange);

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  buildWorld(state.trackId, state.carId, true);
  updateCamera(0);
  updateAds();
  if (renderer && scene && camera) renderer.render(scene, camera);
  state.ready = true;

  const api = {
    getSnapshot: buildSnapshot,
    get version() {
      return "jellydrift-3d/1.0";
    },
  };
  try {
    Object.defineProperty(window, "__JELLY_DRIFT__", {
      value: api,
      configurable: true,
      enumerable: false,
      writable: true,
    });
  } catch (_) {
    window.__JELLY_DRIFT__ = api;
  }

  emitSnapshot();
  rafId = requestAnimationFrame(frame);

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onWindowBlur);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    try {
      audio.dispose();
    } catch (_) {
      /* ignore */
    }
    cleanupWorld();
    scene = null;
    world = null;
    player = null;
    try {
      if (renderer) {
        const canvas = renderer.domElement;
        renderer.dispose();
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
        const gl = renderer.getContext && renderer.getContext();
        if (gl && typeof gl.getExtension === "function") {
          const lose = gl.getExtension("WEBGL_lose_context");
          if (lose && typeof lose.loseContext === "function") lose.loseContext();
        }
      }
    } catch (_) {
      /* ignore */
    }
    renderer = null;
    try {
      delete window.__JELLY_DRIFT__;
    } catch (_) {
      /* ignore */
    }
    state.ready = false;
  }

  return {
    startRace,
    setCameraMode,
    toggleCamera,
    pause,
    resume,
    restartRace,
    returnToGarage,
    grantContinue,
    requestContinue,
    cancelContinue,
    selectTrack,
    selectCar,
    selectMode,
    setMuted,
    setTouchInput,
    confirmUiPhase,
    getSnapshot: buildSnapshot,
    dispose,
  };
}
