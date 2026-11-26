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
  resolveCarCollisions,
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
  computeRacerProgress,
} from "./ai.js";
import { createVfx } from "./vfx.js";
import { createAudio } from "./audio.js";
import { createCameraRig } from "./camera.js";
import { createAdProjector } from "./ads3d.js";
import { createMultiplayerClient } from "./net.js";

const PUBLISHER_ID = "ca-pub-2255472474228401";
const DRIFT_RUSH_START = 32.0;
const ONLINE_DRIFT_RUSH_START = 60.0;
const CONTINUE_TIME = 20.0;
const CHECKPOINT_BONUS = 3.2;
const COUNTDOWN_START = 1.5;

const RIVAL_DOT_COLORS = ["#38BDF8", "#FB923C", "#C084FC"];
const MP_GRID_SLOTS = [
  { s: 6.5, lane: -1.35 },
  { s: 6.5, lane: 1.35 },
  { s: 0.0, lane: -1.35 },
  { s: 0.0, lane: 1.35 },
];

const RECORDS_STORAGE_KEY = "jellydrift_records_v1";

function computeGearbox(speedMs) {
  const kmh = (Number.isFinite(speedMs) ? speedMs : 0) * 3.6;
  if (kmh < -1.5) {
    return { gear: -1, rpmNorm: clamp(0.2 + (Math.abs(kmh) / 50) * 0.7, 0.2, 0.9) };
  }
  const absKmh = Math.abs(kmh);
  if (absKmh < 1.5) {
    return { gear: 1, rpmNorm: 0.16 };
  }
  const bands = [0, 26, 50, 74, 98, 125];
  let gIdx = 0;
  for (let i = 0; i < bands.length - 1; i++) {
    if (absKmh >= bands[i]) gIdx = i;
  }
  const lo = bands[gIdx];
  const hi = bands[gIdx + 1];
  const frac = clamp((absKmh - lo) / Math.max(1, hi - lo), 0, 1);
  const floor = gIdx === 0 ? 0.16 : 0.38;
  return { gear: gIdx + 1, rpmNorm: clamp(floor + frac * (0.96 - floor), 0.16, 0.98) };
}

function buildMinimapData(track) {
  if (!track || typeof track.at !== "function" || !Number.isFinite(track.length) || track.length <= 0) {
    return { path: "", cx: 0, cz: 0, scale: 1 };
  }
  const pts = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const count = 128;
  for (let i = 0; i < count; i++) {
    const p = track.at((i / count) * track.length);
    if (!p) continue;
    pts.push(p);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  if (!pts.length) return { path: "", cx: 0, cz: 0, scale: 1 };
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const span = Math.max(maxX - minX, maxZ - minZ, 1);
  const scale = 80 / span;
  const segs = pts.map((p, idx) => {
    const mx = (50 - (p.x - cx) * scale).toFixed(1);
    const my = (50 - (p.z - cz) * scale).toFixed(1);
    return `${idx === 0 ? "M" : "L"}${mx},${my}`;
  });
  segs.push("Z");
  return { path: segs.join(" "), cx, cz, scale };
}

function worldToMinimap(pos, bounds) {
  if (!pos || !bounds || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) {
    return { x: 50, y: 50 };
  }
  return {
    x: clamp(50 - (pos.x - bounds.cx) * bounds.scale, 4, 96),
    y: clamp(50 - (pos.z - bounds.cz) * bounds.scale, 4, 96),
  };
}

function loadTrackRecord(trackId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed[trackId] ? parsed[trackId] : null;
  } catch (_) {
    return null;
  }
}

function saveTrackRecord(trackId, bestLapSec, bestDriftScore) {
  try {
    if (typeof window === "undefined" || !window.localStorage || !trackId) return;
    const raw = window.localStorage.getItem(RECORDS_STORAGE_KEY);
    const all = raw ? JSON.parse(raw) || {} : {};
    const prev = all[trackId] || {};
    const nextLap =
      bestLapSec > 0 && (!(prev.bestLapSec > 0) || bestLapSec < prev.bestLapSec)
        ? bestLapSec
        : prev.bestLapSec || 0;
    const nextDrift = Math.max(prev.bestDriftScore || 0, Math.round(bestDriftScore || 0));
    all[trackId] = { bestLapSec: nextLap, bestDriftScore: nextDrift };
    window.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(all));
  } catch (_) {
    /* ignore storage limits */
  }
}

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
    difficulty: "MEDIUM",
    trackId: "sunny_coast",
    carId: "jelly_gt",
    cameraMode: "CHASE",
    lap: 1,
    totalLaps: 3,
    checkpointIndex: 0,
    timeRemainingSec: DRIFT_RUSH_START,
    continuesUsed: 0,
    driftScore: 0,
    driftCombo: 0,
    driftMultiplier: 1,
    lapTimeSec: 0,
    bestLapSec: 0,
    rivalGapMeters: 0,
    rivalName: "K. Fujiwara",
    gear: 1,
    rpmNorm: 0.2,
    minimapPath: "",
    playerMapX: 50,
    playerMapY: 50,
    rivalMapX: 50,
    rivalMapY: 50,
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
  let skyDome = null;
  let sunLight = null;
  const sunDir = new THREE.Vector3(0.45, 0.72, 0.52).normalize();
  let minimapBounds = null;
  let driftComboRaw = 0;
  let comboHoldTimer = 0;
  let comboTime = 0;
  let bankedDriftScore = 0;

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

  // Multiplayer runtime state
  let mpState = {
    open: false,
    inRoom: false,
    connected: false,
    connecting: false,
    statusText: "",
    errorText: "",
    roomCode: "",
    isHost: false,
    isPublic: false,
    collisions: false,
    roomStatus: "LOBBY",
    trackId: "sunny_coast",
    mode: "GRAND_PRIX",
    totalLaps: 3,
    raceSeq: 0,
    startAtMs: 0,
    myUid: "",
    callsign: "Racer",
    transport: "offline",
    players: [],
  };
  const remoteRacers = new Map();
  let isOnlineRace = false;
  let activeOnlineRaceSeq = 0;
  let onlineRaceStartAtMs = 0;
  let onlineFinishedSent = false;
  let hiddenTickTimer = null;

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
    renderer.setPixelRatio(Math.min((typeof window !== "undefined" && window.devicePixelRatio) || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    const isCanyon = track.id === "canyon_loop";
    const isNeon = track.id === "neon_circuit";
    const isAkina = track.id === "akina_forest";
    const topHex = isNeon ? 0x040714 : isAkina ? 0x101c2c : isCanyon ? 0x2b2d5c : 0x2c86d4;
    const horHex = isNeon ? 0x181c3a : isAkina ? 0x3b5368 : isCanyon ? 0xf08c4b : 0xb8e6f7;
    const botHex = isNeon ? 0x050810 : isAkina ? 0x13221c : isCanyon ? 0x8c472b : 0x68b5d8;
    const sunHex = isNeon ? 0x9ec5ff : isAkina ? 0xcbe3ff : isCanyon ? 0xffd07a : 0xfff6d6;
    const starsVal = isNeon ? 1.0 : isAkina ? 0.55 : isCanyon ? 0.15 : 0.0;

    if (isNeon) {
      sunDir.set(-0.35, 0.65, 0.55).normalize();
    } else if (isAkina) {
      sunDir.set(-0.42, 0.52, -0.58).normalize();
    } else if (isCanyon) {
      sunDir.set(-0.55, 0.42, -0.45).normalize();
    } else {
      sunDir.set(0.45, 0.72, 0.52).normalize();
    }

    scene.background = new THREE.Color(track.skyHex || "#79CBE8");
    scene.fog = new THREE.Fog(
      track.fogColor != null ? track.fogColor : 0x8ad4ec,
      track.fogNear || 260,
      track.fogFar || 1350
    );

    const skyGeo = new THREE.SphereGeometry(1800, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTopColor: { value: new THREE.Color(topHex) },
        uHorizonColor: { value: new THREE.Color(horHex) },
        uBottomColor: { value: new THREE.Color(botHex) },
        uSunDir: { value: sunDir.clone() },
        uSunColor: { value: new THREE.Color(sunHex) },
        uStars: { value: starsVal },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uBottomColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uStars;
        varying vec3 vDir;
        float hash31(vec3 p) {
          p = fract(p * vec3(443.897, 441.423, 437.195));
          p += dot(p, p.yzx + 19.19);
          return fract((p.x + p.y) * p.z);
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h >= 0.0
            ? mix(uHorizonColor, uTopColor, pow(clamp(h, 0.0, 1.0), 0.55))
            : mix(uHorizonColor, uBottomColor, pow(clamp(-h, 0.0, 1.0), 0.65));
          float sunDot = max(0.0, dot(d, normalize(uSunDir)));
          col += uSunColor * (pow(sunDot, 14.0) * 0.25 + smoothstep(0.996, 0.9994, sunDot) * 0.9);
          if (uStars > 0.01 && h > 0.04) {
            float cell = hash31(floor(d * 180.0));
            if (cell > 0.9935) {
              float tw = (cell - 0.9935) / 0.0065;
              col += vec3(0.85, 0.92, 1.0) * tw * uStars * smoothstep(0.04, 0.35, h);
            }
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    skyDome = new THREE.Mesh(skyGeo, skyMat);
    skyDome.name = "sky-dome";
    scene.add(skyDome);

    const groundCol = (track.theme && track.theme.groundColor) || 0x3b4252;
    const hemi = new THREE.HemisphereLight(isNeon ? 0xa5b4fc : 0xffffff, groundCol, isNeon ? 0.95 : 1.35);
    hemi.position.set(0, 140, 0);
    scene.add(hemi);

    sunLight = new THREE.DirectionalLight(sunHex, isNeon ? 0.85 : 1.32);
    sunLight.position.copy(sunDir).multiplyScalar(90);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.bias = -0.0006;
    sunLight.shadow.camera.left = -28;
    sunLight.shadow.camera.right = 28;
    sunLight.shadow.camera.top = 28;
    sunLight.shadow.camera.bottom = -28;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 260;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const fill = new THREE.DirectionalLight(isNeon ? 0x38bdf8 : 0x88aaff, isNeon ? 0.55 : 0.42);
    fill.position.set(-110, 70, -100);
    scene.add(fill);
  }

  function cleanupWorld() {
    skyDome = null;
    sunLight = null;
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
    for (const r of remoteRacers.values()) {
      try {
        if (r && r.mesh && typeof r.mesh.dispose === "function") r.mesh.dispose();
      } catch (_) {
        /* ignore */
      }
    }
    remoteRacers.clear();
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

    const isNight = track.id === "neon_circuit" || track.id === "akina_forest";
    const playerMesh = createCarMesh(def, { cameraMode: state.cameraMode, nightMode: isNight });
    scene.add(playerMesh.carRoot);

    aiList = [];
    const aiMeshes = [];
    for (let i = 0; i < AI_COUNT; i++) {
      const ai = createAIState(track, i, { trackId: track.id, excludeCarId: def.id });
      resetAIState(ai, track, i, { trackId: track.id, excludeCarId: def.id });
      aiList.push(ai);
      const aiMesh = createCarMesh(ai.def || getCar(ai.carId), { isAI: true, nightMode: isNight });
      aiMesh.carRoot.visible = !forGarage;
      scene.add(aiMesh.carRoot);
      aiMeshes.push(aiMesh);
    }

    minimapBounds = buildMinimapData(track);
    state.minimapPath = minimapBounds.path;
    state.rivalName = (aiList[0] && aiList[0].name) || "K. Fujiwara";
    const savedRec = loadTrackRecord(track.id);
    state.bestLapSec = savedRec && savedRec.bestLapSec > 0 ? savedRec.bestLapSec : 0;

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
    state.driftCombo = 0;
    state.driftMultiplier = 1;
    state.lapTimeSec = 0;
    state.rivalGapMeters = 0;
    state.gear = 1;
    state.rpmNorm = 0.2;
    driftComboRaw = 0;
    comboHoldTimer = 0;
    comboTime = 0;
    bankedDriftScore = 0;
    const savedRec = loadTrackRecord(world.track.id);
    state.bestLapSec = savedRec && savedRec.bestLapSec > 0 ? savedRec.bestLapSec : 0;
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
      resetAIState(aiList[i], world.track, i, { trackId: world.track.id, excludeCarId: world.def.id });
    }
    state.rivalName = (aiList[0] && aiList[0].name) || "K. Fujiwara";
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
    if (typeof opts.difficulty === "string") {
      const up = opts.difficulty.toUpperCase();
      if (up === "EASY" || up === "MEDIUM" || up === "HARD") state.difficulty = up;
    }
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

  function startOnlineRaceLocal(mp) {
    if (!mp || !mp.inRoom) return;
    isOnlineRace = true;
    onlineFinishedSent = false;
    onlineRaceStartAtMs = mp.startAtMs || mpClient.serverNow() + 2500;
    mpClient.setOpen(false);

    const trackId = getTrack(mp.trackId).id;
    const me = Array.isArray(mp.players) ? mp.players.find((p) => p.isMe) : null;
    const carId = getCar(me ? me.carId : state.carId).id;
    state.trackId = trackId;
    state.carId = carId;
    state.mode = mp.mode === "DRIFT_RUSH" ? "DRIFT_RUSH" : "GRAND_PRIX";
    state.totalLaps = mp.totalLaps || 3;

    buildWorld(state.trackId, state.carId, false);
    resetRaceState();

    // Hide AI cars during multiplayer race
    aiList = [];
    if (world && Array.isArray(world.aiMeshes)) {
      for (const m of world.aiMeshes) {
        if (m && m.carRoot) m.carRoot.visible = false;
      }
    }

    const track = world.track;
    const maxLane = Math.max(0.8, (track.halfWidth || 3.9) - 1.55);
    const mySlot = clamp(me ? me.slot : 0, 0, 3);
    const myGrid = MP_GRID_SLOTS[mySlot];
    resetCarPhysicsState(player, track, world.def, {
      s: myGrid.s,
      lane: clamp(myGrid.lane, -maxLane, maxLane),
    });
    player.lap = 1;
    player.checkpointIndex = 0;

    const isNight = track.id === "neon_circuit" || track.id === "akina_forest";
    const remoteList = (mp.players || []).filter((p) => !p.isMe);
    for (let i = 0; i < remoteList.length; i++) {
      const rp = remoteList[i];
      const rDef = getCar(rp.carId);
      const rSlotIdx = clamp(rp.slot || 0, 0, 3);
      const rGrid = MP_GRID_SLOTS[rSlotIdx];
      const rPhys = createCarPhysicsState(rDef, track, {
        s: rGrid.s,
        lane: clamp(rGrid.lane, -maxLane, maxLane),
      });
      rPhys.id = rp.uid;
      rPhys.name = rp.name || "Racer";
      rPhys.carId = rDef.id;
      rPhys.lap = 1;
      rPhys.checkpointIndex = 0;
      rPhys.lastInput = { steer: 0, brake: false, drift: false };

      const colorHex = RIVAL_DOT_COLORS[i % RIVAL_DOT_COLORS.length];
      const rMesh = createCarMesh(rDef, { isAI: true, nightMode: isNight });
      if (typeof rMesh.setLabel === "function") rMesh.setLabel(rp.name || "Racer", colorHex);
      if (typeof rMesh.setGhostMode === "function") rMesh.setGhostMode(!mp.collisions);
      scene.add(rMesh.carRoot);

      remoteRacers.set(rp.uid, {
        uid: rp.uid,
        name: rp.name || "Racer",
        carId: rDef.id,
        slot: rSlotIdx,
        def: rDef,
        phys: rPhys,
        mesh: rMesh,
        target: null,
        colorHex,
      });
    }

    state.rivalName = remoteList[0] ? remoteList[0].name || "Racer" : "Online";
    state.timeRemainingSec = state.mode === "DRIFT_RUSH" ? ONLINE_DRIFT_RUSH_START : 0;
    state.countdown = Math.max(0, (onlineRaceStartAtMs - mpClient.serverNow()) / 1000);
    state.phase = state.countdown > 0.02 ? "COUNTDOWN" : "RACING";
    lastCountdownStep = Math.ceil(state.countdown * 2);
    audio.ensure();
    audio.playCountdown(3);
    syncPlayerVisual(0);
    syncRemoteVisuals(0);
    updateCamera(0);
    updateAds();
    emitSnapshot();
  }

  function handleMpStateChange(nextMp) {
    mpState = nextMp;
    if (!nextMp.inRoom) {
      if (isOnlineRace) {
        isOnlineRace = false;
        activeOnlineRaceSeq = 0;
        returnToGarage();
      } else {
        emitSnapshot();
      }
      return;
    }

    if (state.phase === "GARAGE" && nextMp.roomStatus === "LOBBY") {
      const me = Array.isArray(nextMp.players) ? nextMp.players.find((p) => p.isMe) : null;
      const wantedTrack = getTrack(nextMp.trackId || state.trackId).id;
      const wantedCar = getCar(me ? me.carId : state.carId).id;
      state.mode = nextMp.mode === "DRIFT_RUSH" ? "DRIFT_RUSH" : "GRAND_PRIX";
      if (wantedTrack !== state.trackId || wantedCar !== state.carId) {
        state.trackId = wantedTrack;
        state.carId = wantedCar;
        buildWorld(state.trackId, state.carId, true);
        updateCamera(0);
        updateAds();
      }
    }

    if (nextMp.roomStatus === "COUNTDOWN" && nextMp.raceSeq > 0 && nextMp.raceSeq !== activeOnlineRaceSeq) {
      activeOnlineRaceSeq = nextMp.raceSeq;
      startOnlineRaceLocal(nextMp);
      return;
    }

    if (nextMp.roomStatus === "LOBBY" && isOnlineRace && state.phase !== "GARAGE") {
      isOnlineRace = false;
      mpClient.setOpen(true);
      returnToGarage();
      return;
    }

    if (isOnlineRace && Array.isArray(nextMp.players)) {
      const activeRemoteUids = new Set(nextMp.players.filter((p) => !p.isMe).map((p) => p.uid));
      for (const [uid, r] of remoteRacers.entries()) {
        if (!activeRemoteUids.has(uid)) {
          try {
            if (r && r.mesh && typeof r.mesh.dispose === "function") r.mesh.dispose();
          } catch (_) {
            /* ignore */
          }
          remoteRacers.delete(uid);
        }
      }
    }

    for (const r of remoteRacers.values()) {
      if (r && r.mesh && typeof r.mesh.setGhostMode === "function") {
        r.mesh.setGhostMode(!nextMp.collisions);
      }
    }
    emitSnapshot();
  }

  function handleRemoteTelemetry(uid, pkt) {
    const r = remoteRacers.get(uid);
    if (!r || !pkt) return;
    r.target = {
      x: pkt.x,
      y: pkt.y,
      z: pkt.z,
      vx: Number.isFinite(pkt.vx) ? pkt.vx : 0,
      vz: Number.isFinite(pkt.vz) ? pkt.vz : 0,
      yaw: Number.isFinite(pkt.yaw) ? pkt.yaw : r.phys.yaw,
      steer: Number.isFinite(pkt.steer) ? pkt.steer : 0,
      slip: Number.isFinite(pkt.slip) ? pkt.slip : 0,
      speed: Number.isFinite(pkt.speed) ? pkt.speed : 0,
      drifting: !!pkt.drifting,
      braking: !!pkt.braking,
      lap: Number.isFinite(pkt.lap) ? pkt.lap : 1,
      cp: Number.isFinite(pkt.cp) ? pkt.cp : 0,
      score: Number.isFinite(pkt.score) ? pkt.score : 0,
      t: Number.isFinite(pkt.t) ? pkt.t : mpClient.serverNow(),
    };
  }

  const mpClient = createMultiplayerClient({
    onStateChange: handleMpStateChange,
    onRemoteTelemetry: handleRemoteTelemetry,
  });
  mpState = mpClient.getState();

  function selectTrack(trackId) {
    if (state.phase !== "GARAGE" || typeof trackId !== "string") return;
    const valid = getTrack(trackId).id;
    state.trackId = valid;
    if (mpState.inRoom && mpState.isHost) {
      mpClient.updateRoomSettings({ trackId: valid });
    }
    buildWorld(state.trackId, state.carId, true);
    updateCamera(0);
    updateAds();
    emitSnapshot();
  }

  function selectCar(carId) {
    if (state.phase !== "GARAGE" || typeof carId !== "string") return;
    const valid = getCar(carId).id;
    state.carId = valid;
    if (mpState.inRoom) {
      mpClient.updateLocalCar(valid);
    }
    buildWorld(state.trackId, state.carId, true);
    updateCamera(0);
    updateAds();
    emitSnapshot();
  }

  function selectMode(mode) {
    if (state.phase !== "GARAGE") return;
    const nextMode = mode === "GRAND_PRIX" ? "GRAND_PRIX" : "DRIFT_RUSH";
    state.mode = nextMode;
    state.timeRemainingSec = state.mode === "DRIFT_RUSH" ? DRIFT_RUSH_START : 0;
    if (mpState.inRoom && mpState.isHost) {
      mpClient.updateRoomSettings({ mode: nextMode });
    }
    emitSnapshot();
  }

  function selectDifficulty(diff) {
    if (state.phase !== "GARAGE" || typeof diff !== "string") return;
    const up = diff.toUpperCase();
    if (up !== "EASY" && up !== "MEDIUM" && up !== "HARD") return;
    state.difficulty = up;
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
    const prevDriftPts = player.driftScore || 0;

    stepCarPhysics(player, input, dt, track);
    if (isOnlineRace) {
      if (mpState.collisions && remoteRacers.size > 0) {
        const racersArr = [player];
        for (const r of remoteRacers.values()) {
          if (r && r.phys) racersArr.push(r.phys);
        }
        resolveCarCollisions(racersArr, { track, restitution: 0.32 });
      }
    } else {
      stepAllAI(aiList, dt, track, player, state.difficulty);
    }

    state.lapTimeSec += dt;
    const gb = computeGearbox(player.speed || 0);
    state.gear = gb.gear;
    state.rpmNorm = gb.rpmNorm;

    const heavyHit = (player.collisionPulse || 0) > 0.35 && (player.collisionPulse || 0) > prevCollisionPulse + 0.12;
    if ((player.boostTime || 0) > prevBoostTime + 0.2) {
      audio.playBoost(player.activeBoostTier || 1);
    }
    if ((player.collisionPulse || 0) > prevCollisionPulse + 0.15) {
      audio.playCollision(clamp(player.collisionPulse, 0.2, 1.0));
    }

    const earnedPts = Math.max(0, (player.driftScore || 0) - prevDriftPts);
    if (heavyHit) {
      // Heavy impact drops unbanked combo chain
      driftComboRaw = 0;
      state.driftCombo = 0;
      state.driftMultiplier = 1;
      comboHoldTimer = 0;
      comboTime = 0;
    } else if (player.drifting && earnedPts > 0) {
      driftComboRaw += earnedPts;
      comboHoldTimer = 1.6;
      comboTime += dt;
      state.driftMultiplier = clamp(1 + Math.floor(comboTime / 1.2), 1, 5);
      state.driftCombo = Math.round(driftComboRaw);
    } else if (comboHoldTimer > 0) {
      comboHoldTimer = Math.max(0, comboHoldTimer - dt);
      if (comboHoldTimer <= 0 && driftComboRaw > 0) {
        const banked = Math.round(driftComboRaw * state.driftMultiplier);
        bankedDriftScore += banked;
        if (banked >= 150) audio.playCheckpoint(false);
        driftComboRaw = 0;
        state.driftCombo = 0;
        state.driftMultiplier = 1;
        comboTime = 0;
      }
    }

    state.driftScore = Math.round(bankedDriftScore + state.driftCombo * state.driftMultiplier);

    const cpRes = updateRacerCheckpoints(player, track);
    state.checkpointIndex = player.checkpointIndex || 0;

    if (cpRes.crossed) {
      audio.playCheckpoint(cpRes.isLap);
      const activelyDriving = !!(input.throttle || input.drift || input.boost);
      if (state.mode === "DRIFT_RUSH" && activelyDriving && Math.abs(player.speed || 0) > 2.5) {
        state.timeRemainingSec = Math.min(45.0, state.timeRemainingSec + CHECKPOINT_BONUS);
      }
      if (cpRes.isLap) {
        if (state.lapTimeSec > 3.0 && (state.bestLapSec <= 0 || state.lapTimeSec < state.bestLapSec)) {
          state.bestLapSec = state.lapTimeSec;
        }
        state.lapTimeSec = 0;
        saveTrackRecord(track.id, state.bestLapSec, state.driftScore);
        if (state.mode === "GRAND_PRIX" && player.lap > state.totalLaps) {
          if (driftComboRaw > 0) {
            bankedDriftScore += Math.round(driftComboRaw * state.driftMultiplier);
            driftComboRaw = 0;
            state.driftCombo = 0;
            state.driftMultiplier = 1;
            state.driftScore = Math.round(bankedDriftScore);
            saveTrackRecord(track.id, state.bestLapSec, state.driftScore);
          }
          state.lap = state.totalLaps;
          state.phase = "FINISHED";
          state.continueOpen = false;
          player.speed = 0;
          player.vel.x = 0;
          player.vel.z = 0;
          if (isOnlineRace && !onlineFinishedSent) {
            onlineFinishedSent = true;
            mpClient.reportRaceFinish({
              driftScore: state.driftScore,
              bestLapSec: state.bestLapSec,
            });
          }
        } else {
          state.lap = player.lap;
        }
      }
    }

    const activeRivals = isOnlineRace
      ? Array.from(remoteRacers.values()).map((r) => r.phys)
      : aiList;

    if (isOnlineRace && state.mode === "DRIFT_RUSH") {
      const scoreBoard = [
        { isPlayer: true, score: state.driftScore },
        ...activeRivals.map((r) => ({ isPlayer: false, score: r.driftScore || 0 })),
      ].sort((a, b) => b.score - a.score);
      const idx = scoreBoard.findIndex((x) => x.isPlayer);
      state.position = clamp(idx >= 0 ? idx + 1 : 1, 1, 1 + activeRivals.length);
    } else {
      const standings = computeRaceStandings(player, activeRivals, track);
      state.position = clamp(standings.position, 1, 1 + activeRivals.length);
    }

    if (activeRivals.length > 0) {
      const pProg = computeRacerProgress(player, track);
      let bestRival = activeRivals[0];
      let bestAbs = Infinity;
      let bestGap = 0;
      for (const rv of activeRivals) {
        const g = Math.round(pProg - computeRacerProgress(rv, track));
        if (Math.abs(g) < bestAbs) {
          bestAbs = Math.abs(g);
          bestGap = g;
          bestRival = rv;
        }
      }
      state.rivalGapMeters = bestGap;
      if (isOnlineRace && bestRival && bestRival.name) {
        state.rivalName = bestRival.name;
      }
    } else {
      state.rivalGapMeters = 0;
    }

    if (state.mode === "DRIFT_RUSH" && state.phase === "RACING") {
      if (isOnlineRace) {
        const elapsedSec = Math.max(0, (mpClient.serverNow() - onlineRaceStartAtMs) / 1000);
        state.timeRemainingSec = Math.max(0, ONLINE_DRIFT_RUSH_START - elapsedSec);
        if (state.timeRemainingSec <= 0) {
          state.timeRemainingSec = 0;
          if (driftComboRaw > 0) {
            bankedDriftScore += Math.round(driftComboRaw * state.driftMultiplier);
            driftComboRaw = 0;
            state.driftCombo = 0;
            state.driftMultiplier = 1;
            state.driftScore = Math.round(bankedDriftScore);
          }
          state.phase = "FINISHED";
          state.continueOpen = false;
          player.speed = 0;
          player.vel.x = 0;
          player.vel.z = 0;
          if (!onlineFinishedSent) {
            onlineFinishedSent = true;
            mpClient.reportRaceFinish({
              driftScore: state.driftScore,
              bestLapSec: state.bestLapSec,
            });
          }
        }
      } else {
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
      braking: !!(input.brake || input.drift),
      rpmNorm: state.rpmNorm,
    });
    world.playerRoot.updateMatrixWorld(true);
    if (skyDome) {
      skyDome.position.set(player.pos.x, py, player.pos.z);
    }
    if (sunLight) {
      sunLight.position.set(player.pos.x + sunDir.x * 90, py + sunDir.y * 90, player.pos.z + sunDir.z * 90);
      sunLight.target.position.set(player.pos.x, py, player.pos.z);
      sunLight.target.updateMatrixWorld();
    }
  }

  function syncAIVisual(dt) {
    if (!world || !Array.isArray(world.aiMeshes)) return;
    const showAI =
      !isOnlineRace &&
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
      const aiGb = computeGearbox(ai.speed || 0);
      aiMesh.updateVisuals({
        steerInput: (ai.lastInput && ai.lastInput.steer) || 0,
        wheelSpin,
        cameraMode: "CHASE",
        braking: !!(ai.lastInput && (ai.lastInput.brake || ai.lastInput.drift)),
        rpmNorm: aiGb.rpmNorm,
      });
      aiMesh.carRoot.updateMatrixWorld(true);
    }
  }

  function syncRemoteVisuals(dt) {
    if (!world || !isOnlineRace || remoteRacers.size === 0) return;
    const track = world.track;
    const showRemote =
      state.phase === "RACING" ||
      state.phase === "COUNTDOWN" ||
      state.phase === "PAUSED" ||
      state.phase === "FINISHED";

    for (const r of remoteRacers.values()) {
      const rp = r.phys;
      const rm = r.mesh;
      if (!rp || !rm) continue;
      rm.carRoot.visible = showRemote;
      if (!showRemote) continue;

      if (r.target && dt > 0 && state.phase !== "COUNTDOWN") {
        const lead = clamp((mpClient.serverNow() - r.target.t) / 1000, 0, 0.14);
        const tx = r.target.x + r.target.vx * lead;
        const tz = r.target.z + r.target.vz * lead;
        const dist = Math.hypot(tx - rp.pos.x, tz - rp.pos.z);
        if (dist > 16) {
          rp.pos.x = tx;
          rp.pos.z = tz;
        } else {
          const alpha = 1 - Math.exp(-dt * 14);
          rp.pos.x += (tx - rp.pos.x) * alpha;
          rp.pos.z += (tz - rp.pos.z) * alpha;
        }

        let dyaw = r.target.yaw - rp.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        rp.yaw += dyaw * (1 - Math.exp(-dt * 16));

        rp.vel.x = r.target.vx;
        rp.vel.z = r.target.vz;
        rp.speed = r.target.speed;
        rp.slip = r.target.slip;
        rp.drifting = r.target.drifting;
        rp.lap = r.target.lap;
        rp.checkpointIndex = r.target.cp;
        rp.driftScore = r.target.score;
        rp.lastInput = {
          steer: r.target.steer,
          brake: r.target.braking,
          drift: r.target.drifting,
        };

        if (track && typeof track.projectToTrack === "function") {
          const proj = track.projectToTrack(rp.pos.x, rp.pos.z, rp.trackSampleIdx, rp.pos.y);
          rp.trackSampleIdx = proj.sampleIdx;
          rp.trackS = proj.s;
          rp.lateralOffset = proj.lateralOffset;
          const bankH = (proj.binormal && Number.isFinite(proj.binormal.y) ? proj.binormal.y : 0) * proj.lateralOffset;
          rp.pos.y = proj.point.y - bankH;
          const cFx = Math.sin(rp.yaw);
          const cFz = Math.cos(rp.yaw);
          const cRx = -Math.cos(rp.yaw);
          const cRz = Math.sin(rp.yaw);
          rp.surfacePitchDeg =
            (Math.asin(clamp(cFx * proj.normal.x + cFz * proj.normal.z, -0.65, 0.65)) * 180) / Math.PI;
          rp.surfaceRollDeg =
            (Math.asin(clamp(cRx * proj.normal.x + cRz * proj.normal.z, -0.5, 0.5)) * 180) / Math.PI;
          rp.surfaceNormal = { x: proj.normal.x, y: proj.normal.y, z: proj.normal.z };
        }
      }

      const py = Number.isFinite(rp.pos.y) ? rp.pos.y : 0;
      rm.carRoot.position.set(rp.pos.x, py, rp.pos.z);
      const surfPitchRad = ((rp.surfacePitchDeg || 0) * Math.PI) / 180;
      const surfRollRad = ((rp.surfaceRollDeg || 0) * Math.PI) / 180;
      rm.carRoot.rotation.set(surfPitchRad, rp.yaw, surfRollRad, "YXZ");

      const wheelSpin = dt > 0 ? ((rp.speed || 0) * dt) / ((r.def && r.def.wheelRadius) || 0.36) : 0;
      const rGb = computeGearbox(rp.speed || 0);
      rm.updateVisuals({
        steerInput: (rp.lastInput && rp.lastInput.steer) || 0,
        wheelSpin,
        cameraMode: "CHASE",
        braking: !!(rp.lastInput && (rp.lastInput.brake || rp.lastInput.drift)),
        rpmNorm: rGb.rpmNorm,
      });
      rm.carRoot.updateMatrixWorld(true);
    }
  }

  function updateCamera(dt) {
    if (!world || !player) return;
    if (state.phase === "GARAGE" || state.phase === "FINISHED") {
      garageAngle += dt * (state.phase === "GARAGE" ? 0.24 : 0.35);
      const car = world.playerRoot.position;
      const radius = state.phase === "GARAGE" ? 5.2 : 6.0;
      camera.position.set(
        car.x + Math.sin(garageAngle) * radius,
        car.y + 1.95 + Math.sin(garageAngle * 0.8) * 0.35,
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

    const pMap = player && minimapBounds ? worldToMinimap(player.pos, minimapBounds) : { x: 50, y: 50 };
    const rMap = aiList[0] && minimapBounds ? worldToMinimap(aiList[0].pos, minimapBounds) : { x: 50, y: 50 };
    const rivalsMap = [];
    if (isOnlineRace && minimapBounds) {
      for (const r of remoteRacers.values()) {
        if (!r || !r.phys) continue;
        const pt = worldToMinimap(r.phys.pos, minimapBounds);
        rivalsMap.push({ x: pt.x, y: pt.y, color: r.colorHex || "#38BDF8" });
      }
    } else if (minimapBounds) {
      for (let i = 0; i < aiList.length; i++) {
        const pt = worldToMinimap(aiList[i].pos, minimapBounds);
        rivalsMap.push({ x: pt.x, y: pt.y, color: RIVAL_DOT_COLORS[i % RIVAL_DOT_COLORS.length] });
      }
    }

    let mpSnapshot = mpState;
    if (mpState.inRoom && Array.isArray(mpState.players)) {
      const rankList = [];
      const curTrack = world ? world.track : track;
      for (const p of mpState.players) {
        let prog = 0;
        let score = p.driftScore || 0;
        if (p.isMe && player) {
          prog = computeRacerProgress(player, curTrack);
          score = Math.round(state.driftScore);
        } else {
          const rr = remoteRacers.get(p.uid);
          if (rr && rr.phys) {
            prog = computeRacerProgress(rr.phys, curTrack);
            score = Math.round(rr.phys.driftScore || p.driftScore || 0);
          }
        }
        rankList.push({ p, prog, score });
      }
      rankList.sort((a, b) => {
        if (state.mode === "DRIFT_RUSH") return b.score - a.score;
        const fa = a.p.finishedAtMs || 0;
        const fb = b.p.finishedAtMs || 0;
        if (fa > 0 && fb > 0) return fa - fb;
        if (fa > 0) return -1;
        if (fb > 0) return 1;
        return b.prog - a.prog;
      });
      const enriched = rankList.map((item, idx) => ({
        ...item.p,
        driftScore: item.score,
        position: idx + 1,
      }));
      mpSnapshot = { ...mpState, players: enriched };
    }

    const totalRacers = isOnlineRace ? Math.max(1, 1 + remoteRacers.size) : 1 + AI_COUNT;

    return {
      ready: state.ready,
      phase: forUiCallback ? state.phase : uiPhase,
      mode: state.mode,
      difficulty: state.difficulty,
      trackId: state.trackId,
      carId: state.carId,
      cameraMode: state.cameraMode,
      speedKmh: player ? speedKmh(player) : 0,
      isDrifting: player ? !!player.drifting : false,
      driftAngleDeg: player ? driftAngleDeg(player) : 0,
      driftScore: Math.round(state.driftScore),
      driftCombo: state.driftCombo,
      driftMultiplier: state.driftMultiplier,
      lapTimeSec: state.lapTimeSec,
      bestLapSec: state.bestLapSec,
      rivalGapMeters: state.rivalGapMeters,
      rivalName: state.rivalName,
      gear: state.gear,
      rpmNorm: state.rpmNorm,
      minimapPath: state.minimapPath,
      playerMapX: pMap.x,
      playerMapY: pMap.y,
      rivalMapX: rMap.x,
      rivalMapY: rMap.y,
      rivalsMap,
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
      aiCount: isOnlineRace ? remoteRacers.size : AI_COUNT,
      totalRacers,
      countdown: state.countdown,
      mp: mpSnapshot,
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
        if (isOnlineRace && onlineRaceStartAtMs > 0) {
          state.countdown = Math.max(0, (onlineRaceStartAtMs - mpClient.serverNow()) / 1000);
        } else {
          state.countdown -= dt;
        }
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

      if (isOnlineRace && player && (state.phase === "COUNTDOWN" || state.phase === "RACING" || state.phase === "FINISHED")) {
        const inp = effectiveInput();
        mpClient.sendTelemetry({
          x: Math.round(player.pos.x * 100) / 100,
          y: Math.round((player.pos.y || 0) * 100) / 100,
          z: Math.round(player.pos.z * 100) / 100,
          vx: Math.round((player.vel.x || 0) * 100) / 100,
          vz: Math.round((player.vel.z || 0) * 100) / 100,
          yaw: Math.round(player.yaw * 1000) / 1000,
          steer: Math.round(inp.steer * 100) / 100,
          slip: Math.round((player.slip || 0) * 1000) / 1000,
          speed: Math.round((player.speed || 0) * 100) / 100,
          drifting: !!player.drifting,
          braking: !!(inp.brake || inp.drift),
          lap: player.lap || 1,
          cp: player.checkpointIndex || 0,
          score: Math.round(state.driftScore || 0),
        });
      }

      syncPlayerVisual(dt);
      syncAIVisual(dt);
      syncRemoteVisuals(dt);
      updateCamera(dt);

      if (player && world && vfx) {
        try {
          const activeVfxRivals =
            state.phase === "RACING"
              ? isOnlineRace
                ? Array.from(remoteRacers.values()).map((r) => r.phys)
                : aiList
              : [];
          vfx.update(
            dt,
            player,
            state.phase === "RACING" && player.drifting,
            false,
            { rivals: activeVfxRivals }
          );
        } catch (_) {
          /* visual-only */
        }
      }

      updateAds();

      if (state.phase === "RACING" && player) {
        audio.update(
          speedKmh(player),
          player.drifting,
          false,
          clamp(Math.abs(player.slip || 0) / 0.7, 0.25, 1)
        );
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
      if (!isOnlineRace && (state.phase === "RACING" || state.phase === "COUNTDOWN")) {
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
    if (!isOnlineRace && (state.phase === "RACING" || state.phase === "COUNTDOWN")) {
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

  // Keep online countdown/telemetry alive when browser tab is momentarily unfocused
  hiddenTickTimer = setInterval(() => {
    if (disposed || !isOnlineRace) return;
    if (typeof document !== "undefined" && document.hidden) {
      if (state.phase === "COUNTDOWN" && onlineRaceStartAtMs > 0) {
        state.countdown = Math.max(0, (onlineRaceStartAtMs - mpClient.serverNow()) / 1000);
        if (state.countdown <= 0) {
          state.countdown = 0;
          state.phase = "RACING";
        }
      }
      if (player && (state.phase === "COUNTDOWN" || state.phase === "RACING")) {
        mpClient.sendTelemetry({
          x: Math.round(player.pos.x * 100) / 100,
          y: Math.round((player.pos.y || 0) * 100) / 100,
          z: Math.round(player.pos.z * 100) / 100,
          vx: Math.round((player.vel.x || 0) * 100) / 100,
          vz: Math.round((player.vel.z || 0) * 100) / 100,
          yaw: Math.round(player.yaw * 1000) / 1000,
          steer: 0,
          slip: Math.round((player.slip || 0) * 1000) / 1000,
          speed: Math.round((player.speed || 0) * 100) / 100,
          drifting: false,
          braking: false,
          lap: player.lap || 1,
          cp: player.checkpointIndex || 0,
          score: Math.round(state.driftScore || 0),
        });
      }
    }
  }, 50);

  // Check ?room=XXXX query param on boot (ignore during Kobweb static export)
  try {
    if (typeof window !== "undefined" && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const isExp = params.get("_kobwebIsExporting") === "true";
      const roomParam = params.get("room");
      if (!isExp && roomParam && roomParam.trim().length >= 4) {
        mpClient.setOpen(true);
        mpClient.joinRoom(roomParam, { carId: state.carId });
      }
    }
  } catch (_) {
    /* ignore query parsing */
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (hiddenTickTimer) {
      clearInterval(hiddenTickTimer);
      hiddenTickTimer = null;
    }
    try {
      mpClient.dispose();
    } catch (_) {
      /* ignore */
    }
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
    selectDifficulty,
    setMuted,
    setTouchInput,
    confirmUiPhase,
    mpOpenLobby: () => mpClient.setOpen(true),
    mpCloseLobby: () => mpClient.setOpen(false),
    mpSetCallsign: (name) => mpClient.setCallsign(name),
    mpCreateRoom: () =>
      mpClient.createRoom({
        trackId: state.trackId,
        mode: state.mode,
        carId: state.carId,
        collisions: false,
        isPublic: false,
      }),
    mpJoinRoom: (code) => mpClient.joinRoom(code, { carId: state.carId }),
    mpQuickMatch: () =>
      mpClient.quickMatch({
        trackId: state.trackId,
        mode: state.mode,
        carId: state.carId,
        collisions: false,
      }),
    mpLeaveRoom: () => {
      isOnlineRace = false;
      activeOnlineRaceSeq = 0;
      mpClient.leaveRoom();
      if (state.phase !== "GARAGE") returnToGarage();
    },
    mpSetReady: (ready) => mpClient.setReady(ready),
    mpToggleCollisions: () => {
      if (mpState.inRoom && mpState.isHost) {
        mpClient.updateRoomSettings({ collisions: !mpState.collisions });
      }
    },
    mpStartRace: () => mpClient.startOnlineRace(),
    mpReturnToLobby: () => {
      if (mpState.inRoom && mpState.isHost) {
        mpClient.returnRoomToLobby();
      } else {
        isOnlineRace = false;
        mpClient.setOpen(true);
        returnToGarage();
      }
    },
    getSnapshot: buildSnapshot,
    dispose,
  };
}
