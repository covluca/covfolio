// Jelly Drift 3D — CHASE / DRIVER / HOOD camera rig with 3D elevation & follow lag.

const MODES = ["CHASE", "DRIVER", "HOOD"];

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngleRad(a) {
  if (!Number.isFinite(a)) return 0;
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

export function createCameraRig(THREE, aspect) {
  const safeAspect = Number.isFinite(aspect) && aspect > 0.1 ? aspect : 16 / 9;
  const camera = new THREE.PerspectiveCamera(64, safeAspect, 0.08, 4000);
  camera.position.set(0, 6, -12);

  const desired = new THREE.Vector3();
  const look = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const driverPosition = new THREE.Vector3();
  const driverLook = new THREE.Vector3();
  let smoothPy = 0;

  let mode = "CHASE";
  let initialized = false;
  let followYaw = 0;
  let yawOffset = 0;

  function setMode(next) {
    if (MODES.indexOf(next) === -1) return mode;
    if (next !== mode) {
      initialized = false;
    }
    mode = next;
    return mode;
  }

  function cycle() {
    if (mode === "CHASE") return setMode("DRIVER");
    if (mode === "DRIVER") return setMode("CHASE");
    return setMode("CHASE");
  }

  function resetFollow(yaw) {
    followYaw = Number.isFinite(yaw) ? yaw : 0;
    yawOffset = 0;
    initialized = false;
  }

  function update(dtInput, player, opts) {
    if (!player || !player.pos) return mode;
    const dt = clamp(dtInput, 0, 0.1);
    const options = opts || {};
    const playerMesh = options.playerMesh || null;

    const speed = Math.abs(player.speed || 0);
    const maxSpd = Math.max(1, (player.def && player.def.maxSpeed) || 44);
    const speedFactor = clamp(speed / maxSpd, 0, 1);

    const yaw = Number.isFinite(player.yaw) ? player.yaw : 0;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);

    const px = Number.isFinite(player.pos.x) ? player.pos.x : 0;
    const py = Number.isFinite(player.pos.y) ? player.pos.y : 0;
    const pz = Number.isFinite(player.pos.z) ? player.pos.z : 0;
    const spring = player.spring || { pitchDeg: 0, rollDeg: 0, squash: 0, bounceY: 0 };
    const bounceY = Number.isFinite(spring.bounceY) ? spring.bounceY : 0;

    if (!initialized) {
      followYaw = yaw;
    } else if (dt > 0) {
      const yawFollowRate = 6.2;
      followYaw = wrapAngleRad(followYaw + wrapAngleRad(yaw - followYaw) * (1 - Math.exp(-dt * yawFollowRate)));
    }

    const yawOffsetTarget = options.reverseLook ? 0.62 : 0;
    if (dt > 0) {
      yawOffset += (yawOffsetTarget - yawOffset) * (1 - Math.exp(-dt * 8));
    } else {
      yawOffset = yawOffsetTarget;
    }

    if (mode === "CHASE") {
      const slipShift = clamp(player.slip || 0, -0.7, 0.7) * 0.32;
      const orbit = followYaw + yawOffset - slipShift;
      const ofx = Math.sin(orbit);
      const ofz = Math.cos(orbit);

      const dist = 8.8 + speedFactor * 0.8;
      if (!initialized || dt <= 0) {
        smoothPy = py;
      } else {
        smoothPy += (py - smoothPy) * (1 - Math.exp(-dt * 5.5));
      }
      const height = smoothPy + 3.85;

      desired.set(px - ofx * dist, height, pz - ofz * dist);
      look.set(px + fx * 4.8, smoothPy + 1.25, pz + fz * 4.8);

      if (!initialized || dt <= 0) {
        camera.position.copy(desired);
        initialized = true;
      } else {
        camera.position.copy(desired);
      }

      const targetFov = 64 + speedFactor * 6;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }
      camera.up.set(0, 1, 0);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      return mode;
    }

    if (mode === "DRIVER") {
      const eyeAnchor =
        playerMesh && (playerMesh.driverEyeRootAnchor || playerMesh.driverEyeAnchor);
      if (eyeAnchor && playerMesh.driverLookTarget) {
        eyeAnchor.getWorldPosition(desired);
        playerMesh.driverLookTarget.getWorldPosition(look);
      } else {
        desired.set(px - rx * 0.25 + fx * 0.08, py + 1.04, pz - rz * 0.25 + fz * 0.08);
        look.set(px + fx * 12.0, py + 0.92, pz + fz * 12.0);
      }

      // Lift and center the eye slightly above the modeled anchor so the dash,
      // steering wheel, and hood stay below the driving sightline.
      desired.x += fx * 0.10;
      desired.y += 0.08;
      desired.z += fz * 0.10;

      // Let the view lead a small amount into a slide without turning the
      // camera into a distracting chase-orbit.
      const slip = clamp(player.slip || 0, -0.7, 0.7);
      look.x += rx * slip * 1.45 + fx * 1.2;
      look.y += 0.10;
      look.z += rz * slip * 1.45 + fz * 1.2;

      if (!initialized || dt <= 0) {
        driverPosition.copy(desired);
        driverLook.copy(look);
      } else {
        const lookK = 1 - Math.exp(-dt * 11);
        driverPosition.copy(desired);
        driverLook.lerp(look, lookK);
      }

      camera.position.copy(driverPosition);
      initialized = true;
      const targetFov = 74 + speedFactor * 5;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }
      camera.up.set(0, 1, 0);
      camera.lookAt(driverLook);
      camera.updateMatrixWorld();
      return mode;
    }

    // HOOD mode
    if (playerMesh && playerMesh.hoodAnchor) {
      playerMesh.hoodAnchor.getWorldPosition(desired);
    } else {
      desired.set(px + fx * 0.95, py + 1.18, pz + fz * 0.95);
    }
    look.set(px + fx * 24.0, py + 1.1, pz + fz * 24.0);
    camera.position.copy(desired);
    initialized = true;
    if (Math.abs(camera.fov - 66) > 0.05) {
      camera.fov = 66;
      camera.updateProjectionMatrix();
    }
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    return mode;
  }

  return {
    camera,
    update,
    setMode,
    cycle,
    resetFollow,
    getMode: () => mode,
    setAspect(a) {
      const nextA = Number.isFinite(a) && a > 0.1 ? a : 16 / 9;
      camera.aspect = nextA;
      camera.updateProjectionMatrix();
    },
    MODES,
  };
}
