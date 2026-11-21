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
  const tmpQuaternion = new THREE.Quaternion();

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

  function solveHomography(w, h, points) {
    const rows = [];
    const values = [];
    const source = [[0, 0], [w, 0], [0, h], [w, h]];
    for (let i = 0; i < 4; i += 1) {
      const sx = source[i][0];
      const sy = source[i][1];
      const dx = points[i].x;
      const dy = points[i].y;
      rows.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
      values.push(dx);
      rows.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
      values.push(dy);
    }
    for (let i = 0; i < 8; i += 1) {
      let pivot = i;
      for (let j = i + 1; j < 8; j += 1) {
        if (Math.abs(rows[j][i]) > Math.abs(rows[pivot][i])) pivot = j;
      }
      if (Math.abs(rows[pivot][i]) < 1e-8) return null;
      const row = rows[i];
      rows[i] = rows[pivot];
      rows[pivot] = row;
      const value = values[i];
      values[i] = values[pivot];
      values[pivot] = value;
      const scale = rows[i][i];
      for (let k = i; k < 8; k += 1) rows[i][k] /= scale;
      values[i] /= scale;
      for (let j = 0; j < 8; j += 1) {
        if (j === i) continue;
        const factor = rows[j][i];
        for (let k = i; k < 8; k += 1) rows[j][k] -= factor * rows[i][k];
        values[j] -= factor * values[i];
      }
    }
    return values;
  }

  function projectCorners(anchor, camera, width, height, rect) {
    const corners = anchor && anchor.userData && anchor.userData.corners;
    if (!corners || !camera) return null;
    anchor.updateWorldMatrix(true, true);
    const ordered = [corners.tl, corners.tr, corners.bl, corners.br];
    if (ordered.some((corner) => !corner || typeof corner.getWorldPosition !== "function")) {
      return null;
    }
    const points = [];
    for (let i = 0; i < ordered.length; i += 1) {
      ordered[i].getWorldPosition(anchorWorld);
      projected.copy(anchorWorld).project(camera);
      if (
        !Number.isFinite(projected.x) ||
        !Number.isFinite(projected.y) ||
        !Number.isFinite(projected.z) ||
        projected.z < -1 ||
        projected.z > 1
      ) {
        return null;
      }
      points.push({
        x: (projected.x * 0.5 + 0.5) * width,
        y: (-projected.y * 0.5 + 0.5) * height,
      });
    }
    const area1 =
      (points[1].x - points[0].x) * (points[2].y - points[0].y) -
      (points[1].y - points[0].y) * (points[2].x - points[0].x);
    const area2 =
      (points[2].x - points[3].x) * (points[1].y - points[3].y) -
      (points[2].y - points[3].y) * (points[1].x - points[3].x);
    if (area1 < 25 || area2 < 25) {
      return null;
    }
    const coefficients = solveHomography(rect.width, rect.height, points);
    return coefficients ? { points, coefficients } : null;
  }

  function applyRect(el, rect, transform) {
    if (!el) return;
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.width = rect.width + "px";
    el.style.height = rect.height + "px";
    el.style.transformOrigin = "0 0";
    el.style.transform = transform;
  }

  function applyProjectedRect(el, rect, anchor, camera, width, height) {
    const mapped = projectCorners(anchor, camera, width, height, rect);
    if (mapped) {
      const h = mapped.coefficients;
      // CSS matrix3d() is column-major: column 0 = (h0, h3, 0, h6), column 1 = (h1, h4, 0, h7), column 3 = (h2, h5, 0, 1)
      applyRect(
        el,
        rect,
        "matrix3d(" +
          [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, 1]
            .map((value) => value.toFixed(6))
            .join(",") +
          ")"
      );
      const pts = mapped.points;
      const minX = Math.min(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
      const maxX = Math.max(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
      const minY = Math.min(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
      const maxY = Math.max(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
      return {
        left: Math.round(minX * 100) / 100,
        top: Math.round(minY * 100) / 100,
        width: Math.max(1, Math.round((maxX - minX) * 100) / 100),
        height: Math.max(1, Math.round((maxY - minY) * 100) / 100),
      };
    }
    applyRect(
      el,
      rect,
      "translate3d(" + rect.left.toFixed(2) + "px," + rect.top.toFixed(2) + "px,0)"
    );
    return rect;
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
      last.console.rect = applyProjectedRect(consoleHost, rect, resolveAnchor(opts.consoleAnchor), s.camera, width, height);
      applyShown(consoleHost, "console");
    } else {
      last.console.visible = false;
      applyHidden(consoleHost);
    }

    const showRoof = active && mode === "CHASE";
    if (showRoof) {
      const rect = roofRect(s.camera, width, height, s);
      last.roof.visible = true;
      last.roof.rect = applyProjectedRect(roofHost, rect, resolveAnchor(opts.roofAnchor), s.camera, width, height);
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
