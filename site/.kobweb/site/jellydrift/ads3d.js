// Jelly Drift 3D — projects 3D anchors (roofAnchor & consoleAnchor) to fixed-size DOM ad slots.
// IMPORTANT: Never call getBoundingClientRect() inside the RAF loop and never use display:none.

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  if (hi < lo) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

export function createAdProjector(THREE, options) {
  const opts = options || {};
  const consoleHost = opts.consoleHost || null;
  const roofHost = opts.roofHost || null;
  const getAdManager = () =>
    opts.adManager || (typeof window !== "undefined" ? window.__COVFOLIO_ADS__ : null) || null;

  const anchorWorld = new THREE.Vector3();
  const projected = new THREE.Vector3();

  const last = {
    console: { mounted: !!consoleHost, visible: false, rect: { left: 0, top: 0, width: 300, height: 94 } },
    roof: { mounted: !!roofHost, visible: false, rect: { left: 0, top: 0, width: 220, height: 69 } },
  };

  function applyHidden(el) {
    if (!el) return;
    el.style.visibility = "hidden";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
  }

  function applyShown(el, slotKey) {
    if (!el) return;
    const wasHidden = el.style.visibility !== "visible";
    el.style.visibility = "visible";
    el.style.opacity = "1";
    el.style.pointerEvents = "none";
    if (wasHidden) {
      try {
        const ins = el.querySelector && el.querySelector("ins.adsbygoogle");
        const mgr = getAdManager();
        if (ins && mgr && typeof mgr.pushSlotOnce === "function") {
          mgr.pushSlotOnce(ins, slotKey);
        }
      } catch (_) {
        /* non-fatal */
      }
    }
  }

  function applyRect(el, rect) {
    if (!el) return;
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.width = rect.width + "px";
    el.style.height = rect.height + "px";
    el.style.transformOrigin = "0 0";
    el.style.transform =
      "translate3d(" + rect.left.toFixed(2) + "px," + rect.top.toFixed(2) + "px,0)";
  }

  function resolveAnchor(getterOrObj) {
    if (!getterOrObj) return null;
    return typeof getterOrObj === "function" ? getterOrObj() : getterOrObj;
  }

  function project(anchor, camera, width, height) {
    if (!anchor || !camera) {
      return { x: width * 0.5, y: height * 0.62, dist: 10, inFront: true };
    }
    anchor.updateWorldMatrix(true, false);
    anchorWorld.setFromMatrixPosition(anchor.matrixWorld);
    const dist = camera.position.distanceTo(anchorWorld);
    projected.copy(anchorWorld).project(camera);
    const px = (projected.x * 0.5 + 0.5) * width;
    const py = (-projected.y * 0.5 + 0.5) * height;
    return {
      x: Number.isFinite(px) ? px : width * 0.5,
      y: Number.isFinite(py) ? py : height * 0.62,
      dist: Number.isFinite(dist) && dist > 0.1 ? dist : 10,
      inFront: projected.z > -1 && projected.z < 1,
    };
  }

  function consoleRect(camera, width, height, state) {
    const anchor = resolveAnchor(opts.consoleAnchor);
    const p = project(anchor, camera, width, height);
    const w = clamp(Math.round(Math.min(300, width * 0.42)), 140, Math.max(140, width - 28));
    const h = clamp(Math.round(w * 0.3125), 48, 100);
    const minTop = Math.max(255, Math.round(height * 0.56));
    const maxTop = Math.max(minTop, height - h - 16);
    const rollShift = ((state && state.rollDeg) || 0) * 0.6;
    const pitchShift = ((state && state.pitchDeg) || 0) * 0.5;
    const left = clamp(p.x + rollShift - w / 2, 12, Math.max(12, width - w - 12));
    const top = clamp(p.y + pitchShift - h / 2, minTop, maxTop);
    return {
      left: Math.round(left * 100) / 100,
      top: Math.round(top * 100) / 100,
      width: w,
      height: h,
    };
  }

  function roofRect(camera, width, height, state) {
    const anchor = resolveAnchor(opts.roofAnchor);
    const p = project(anchor, camera, width, height);
    const scale = clamp(9.5 / Math.max(4.5, p.dist), 0.45, 1.35);
    const maxW = Math.max(80, Math.min(340, width - 20));
    const w = clamp(Math.round(220 * scale), 80, maxW);
    const h = clamp(Math.round(w * 0.3125), 26, 110);
    const rollShift = ((state && state.rollDeg) || 0) * 1.45 + ((state && state.slipDeg) || 0) * 0.45;
    const pitchShift = ((state && state.pitchDeg) || 0) * 0.95 - ((state && state.speedKmh) || 0) * 0.08;
    const left = clamp(p.x + rollShift - w / 2, 4, Math.max(4, width - w - 4));
    const top = clamp(p.y + pitchShift - h / 2, 4, Math.max(4, height - h - 4));
    return {
      left: Math.round(left * 100) / 100,
      top: Math.round(top * 100) / 100,
      width: w,
      height: h,
    };
  }

  function update(state) {
    const s = state || {};
    const width = Math.max(1, s.width || 1280);
    const height = Math.max(1, s.height || 720);
    const active =
      s.phase === "COUNTDOWN" ||
      s.phase === "RACING" ||
      s.phase === "PAUSED" ||
      s.phase === "CONTINUE_OFFER";
    const mode = s.cameraMode;

    const showConsole = active && mode === "DRIVER";
    if (showConsole) {
      const rect = consoleRect(s.camera, width, height, s);
      last.console.visible = true;
      last.console.rect = rect;
      applyRect(consoleHost, rect);
      applyShown(consoleHost, "console");
    } else {
      last.console.visible = false;
      applyHidden(consoleHost);
    }

    const showRoof = active && mode === "CHASE";
    if (showRoof) {
      const rect = roofRect(s.camera, width, height, s);
      last.roof.visible = true;
      last.roof.rect = rect;
      applyRect(roofHost, rect);
      applyShown(roofHost, "roof");
    } else {
      last.roof.visible = false;
      applyHidden(roofHost);
    }

    return last;
  }

  applyHidden(consoleHost);
  applyHidden(roofHost);

  return {
    update,
    getState: () => last,
    setAnchors(anchors) {
      opts.roofAnchor = (anchors && anchors.roofAnchor) || null;
      opts.consoleAnchor = (anchors && anchors.consoleAnchor) || null;
    },
  };
}
