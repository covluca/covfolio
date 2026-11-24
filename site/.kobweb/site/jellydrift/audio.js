function finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function clamp(v, lo, hi, fallback = lo) {
  if (!Number.isFinite(v)) return fallback;
  return v < lo ? lo : v > hi ? hi : v;
}

function pos(v, min = 0.0001) {
  const f = finite(v, min);
  return f > min ? f : min;
}

export function createAudio() {
  const g = typeof globalThis !== "undefined" ? globalThis : null;

  let ctx = null;
  let master = null;
  let engineFilter = null;
  let engineGain = null;
  let oscA = null;
  let oscB = null;
  let oscC = null;
  let oscD = null;
  let gainA = null;
  let gainB = null;
  let gainC = null;
  let gainD = null;
  let growlSrc = null;
  let growlFilter = null;
  let growlGain = null;

  let noiseBuffer = null;
  let screechSrc = null;
  let screechFilter = null;
  let screechGain = null;

  let muted = false;
  let disposed = false;
  let failed = false;
  let wasBoosting = false;
  let prevGear = 0;
  let shiftPulseUntil = 0;
  let unlockAttached = false;

  function removeUnlockListeners() {
    if (!unlockAttached || !g || typeof g.removeEventListener !== "function") return;
    g.removeEventListener("pointerdown", onUserGesture);
    g.removeEventListener("keydown", onUserGesture);
    unlockAttached = false;
  }

  function onUserGesture() {
    if (disposed || muted || !ctx) return;
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      try {
        const res = ctx.resume();
        if (res && typeof res.catch === "function") {
          res.catch(() => {});
        }
      } catch (_) {
        // ignore pre-gesture block
      }
    } else if (ctx.state === "running") {
      removeUnlockListeners();
    }
  }

  function attachUnlockListeners() {
    if (unlockAttached || disposed || !g || typeof g.addEventListener !== "function") return;
    g.addEventListener("pointerdown", onUserGesture, { passive: true });
    g.addEventListener("keydown", onUserGesture, { passive: true });
    unlockAttached = true;
  }

  function safeSetTarget(param, target, now, tau = 0.06) {
    if (!param || typeof param.setTargetAtTime !== "function") return;
    const t = finite(target, 0);
    const n = finite(now, 0);
    const tc = pos(tau, 0.001);
    param.setTargetAtTime(t, n, tc);
  }

  function createNoiseBuffer(audioCtx) {
    if (!audioCtx || typeof audioCtx.createBuffer !== "function") return null;
    const sampleRate = pos(audioCtx.sampleRate, 22050);
    const length = Math.max(1024, Math.floor(sampleRate * 1.5));
    const buf = audioCtx.createBuffer(1, length, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  function ensure() {
    if (disposed || failed) return false;
    const Ctor = g && (g.AudioContext || g.webkitAudioContext);
    if (typeof Ctor !== "function") return false;

    if (!ctx) {
      try {
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.045;
        master.connect(ctx.destination);

        // Dual-oscillator engine hum -> lowpass -> engineGain -> master
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = "lowpass";
        engineFilter.frequency.value = 340;
        engineFilter.Q.value = 0.85;

        engineGain = ctx.createGain();
        engineGain.gain.value = 0.78;

        // Warm procedural boxer/inline engine: real per-oscillator GainNodes (fundamental, 5th, sub, octave)
        oscA = ctx.createOscillator();
        oscA.type = "sawtooth";
        oscA.frequency.value = 54;
        gainA = ctx.createGain();
        gainA.gain.value = 0.26;

        oscB = ctx.createOscillator();
        oscB.type = "triangle";
        oscB.frequency.value = 81;
        gainB = ctx.createGain();
        gainB.gain.value = 0.22;

        oscC = ctx.createOscillator();
        oscC.type = "sine";
        oscC.frequency.value = 27;
        gainC = ctx.createGain();
        gainC.gain.value = 0.36;

        oscD = ctx.createOscillator();
        oscD.type = "triangle";
        oscD.frequency.value = 108;
        gainD = ctx.createGain();
        gainD.gain.value = 0.10;

        oscA.connect(gainA);
        gainA.connect(engineFilter);
        oscB.connect(gainB);
        gainB.connect(engineFilter);
        oscC.connect(gainC);
        gainC.connect(engineFilter);
        oscD.connect(gainD);
        gainD.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(master);

        oscA.start();
        oscB.start();
        oscC.start();
        oscD.start();

        // Looped bandpass noise for tire screech
        noiseBuffer = createNoiseBuffer(ctx);
        if (noiseBuffer) {
          screechSrc = ctx.createBufferSource();
          screechSrc.buffer = noiseBuffer;
          screechSrc.loop = true;

          screechFilter = ctx.createBiquadFilter();
          screechFilter.type = "bandpass";
          screechFilter.frequency.value = 920;
          screechFilter.Q.value = 3.2;

          screechGain = ctx.createGain();
          screechGain.gain.value = 0;

          screechSrc.connect(screechFilter);
          screechFilter.connect(screechGain);
          screechGain.connect(master);
          screechSrc.start();

          // Looped noise "engine growl" layer (subtle intake texture)
          growlSrc = ctx.createBufferSource();
          growlSrc.buffer = noiseBuffer;
          growlSrc.loop = true;

          growlFilter = ctx.createBiquadFilter();
          growlFilter.type = "lowpass";
          growlFilter.frequency.value = 420;
          growlFilter.Q.value = 1.2;

          growlGain = ctx.createGain();
          growlGain.gain.value = 0;

          growlSrc.connect(growlFilter);
          growlFilter.connect(growlGain);
          growlGain.connect(master);
          growlSrc.start();
        }
      } catch (_) {
        try {
          if (oscA) oscA.stop();
        } catch (_) {}
        try {
          if (oscB) oscB.stop();
        } catch (_) {}
        try {
          if (oscC) oscC.stop();
        } catch (_) {}
        try {
          if (oscD) oscD.stop();
        } catch (_) {}
        try {
          if (screechSrc) screechSrc.stop();
        } catch (_) {}
        try {
          if (growlSrc) growlSrc.stop();
        } catch (_) {}
        try {
          if (ctx && ctx.state !== "closed" && typeof ctx.close === "function") {
            const cRes = ctx.close();
            if (cRes && typeof cRes.catch === "function") cRes.catch(() => {});
          }
        } catch (_) {}
        ctx = null;
        master = null;
        engineFilter = null;
        engineGain = null;
        oscA = null;
        oscB = null;
        oscC = null;
        oscD = null;
        gainA = null;
        gainB = null;
        gainC = null;
        gainD = null;
        screechSrc = null;
        screechFilter = null;
        screechGain = null;
        growlSrc = null;
        growlFilter = null;
        growlGain = null;
        noiseBuffer = null;
        failed = true;
        return false;
      }
    }

    if (ctx.state === "suspended") {
      attachUnlockListeners();
      if (!muted && typeof ctx.resume === "function") {
        try {
          const res = ctx.resume();
          if (res && typeof res.catch === "function") {
            res.catch(() => {});
          }
        } catch (_) {
          // blocked pre-gesture
        }
      }
    } else if (ctx.state === "running") {
      removeUnlockListeners();
    }

    return true;
  }

  function setMuted(next) {
    muted = !!next;
    if (disposed || !ctx) return;
    const now = finite(ctx.currentTime, 0);
    if (master) {
      safeSetTarget(master.gain, muted ? 0 : 0.045, now, 0.03);
    }
    if (muted && ctx.state === "running" && typeof ctx.suspend === "function") {
      try {
        const res = ctx.suspend();
        if (res && typeof res.catch === "function") res.catch(() => {});
      } catch (_) {}
    } else if (!muted && ctx.state === "suspended" && typeof ctx.resume === "function") {
      try {
        const res = ctx.resume();
        if (res && typeof res.catch === "function") res.catch(() => {});
      } catch (_) {}
    }
  }

  function isMuted() {
    return muted;
  }

  function canPlayOneShot() {
    if (disposed || muted) return false;
    if (!ensure() || !ctx || !master) return false;
    return ctx.state !== "closed";
  }

  function playBoost(tier = 1) {
    if (!canPlayOneShot()) return;
    try {
      const t = clamp(Math.round(finite(tier, 1)), 1, 3, 1);
      const now = finite(ctx.currentTime, 0);
      const dur = 0.34 + t * 0.10;

      // Sub-harmonic turbine rise
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(pos(150 + t * 40), now);
      osc.frequency.exponentialRampToValueAtTime(pos(420 + t * 130), now + dur);

      oscGain.gain.setValueAtTime(0.0001, now);
      oscGain.gain.exponentialRampToValueAtTime(pos(0.32 + t * 0.08), now + 0.05);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      osc.connect(oscGain);
      oscGain.connect(master);
      osc.onended = () => {
        try {
          osc.disconnect();
          oscGain.disconnect();
        } catch (_) {}
      };
      osc.start(now);
      osc.stop(now + dur + 0.02);

      // Filtered noise whoosh
      if (noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.Q.value = 1.6;
        bp.frequency.setValueAtTime(pos(550), now);
        bp.frequency.exponentialRampToValueAtTime(pos(2400 + t * 600), now + dur);

        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.0001, now);
        nGain.gain.exponentialRampToValueAtTime(pos(0.45 + t * 0.1), now + 0.04);
        nGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        src.connect(bp);
        bp.connect(nGain);
        nGain.connect(master);
        src.onended = () => {
          try {
            src.disconnect();
            bp.disconnect();
            nGain.disconnect();
          } catch (_) {}
        };
        src.start(now);
        src.stop(now + dur + 0.02);
      }
    } catch (_) {
      // safe no-op
    }
  }

  function playCollision(strength = 0.6) {
    if (!canPlayOneShot()) return;
    try {
      const s = clamp(finite(strength, 0.6), 0.1, 1.5, 0.6);
      const now = finite(ctx.currentTime, 0);
      const dur = 0.22;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(pos(145 * (0.85 + s * 0.25)), now);
      osc.frequency.exponentialRampToValueAtTime(pos(42), now + dur);

      gain.gain.setValueAtTime(pos(0.65 * s), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      osc.connect(gain);
      gain.connect(master);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (_) {}
      };
      osc.start(now);
      osc.stop(now + dur + 0.02);

      if (noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(pos(680 + s * 420), now);

        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(pos(0.42 * s), now);
        nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

        src.connect(lp);
        lp.connect(nGain);
        nGain.connect(master);
        src.onended = () => {
          try {
            src.disconnect();
            lp.disconnect();
            nGain.disconnect();
          } catch (_) {}
        };
        src.start(now);
        src.stop(now + 0.16);
      }
    } catch (_) {
      // safe no-op
    }
  }

  function playCheckpoint(isLap = false) {
    if (!canPlayOneShot()) return;
    try {
      const now = finite(ctx.currentTime, 0);
      const notes = isLap ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 783.99];
      for (let i = 0; i < notes.length; i++) {
        const t0 = now + i * 0.075;
        const dur = i === notes.length - 1 ? 0.24 : 0.12;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(pos(notes[i]), t0);

        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.32, t0 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(gain);
        gain.connect(master);
        osc.onended = () => {
          try {
            osc.disconnect();
            gain.disconnect();
          } catch (_) {}
        };
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      }
    } catch (_) {
      // safe no-op
    }
  }

  function playCountdown(step) {
    if (!canPlayOneShot()) return;
    try {
      const now = finite(ctx.currentTime, 0);
      const isGo = step === 0 || step === "GO" || step === "go";
      const freqs = isGo ? [880, 1108.73, 1318.5] : [440];
      const dur = isGo ? 0.30 : 0.15;

      for (let i = 0; i < freqs.length; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = isGo ? "triangle" : "sine";
        osc.frequency.setValueAtTime(pos(freqs[i]), now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(isGo ? 0.28 : 0.36, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        osc.connect(gain);
        gain.connect(master);
        osc.onended = () => {
          try {
            osc.disconnect();
            gain.disconnect();
          } catch (_) {}
        };
        osc.start(now);
        osc.stop(now + dur + 0.02);
      }
    } catch (_) {
      // safe no-op
    }
  }

  // After-fire pop when the boost cuts out: unburnt fuel crackling in the pipes.
  function playAfterFire() {
    if (!canPlayOneShot()) return;
    try {
      const now = finite(ctx.currentTime, 0);
      const dur = 0.18;

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(pos(180), now);
      osc.frequency.exponentialRampToValueAtTime(pos(58), now + dur);
      oscGain.gain.setValueAtTime(pos(0.22), now);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(oscGain);
      oscGain.connect(master);
      osc.onended = () => {
        try {
          osc.disconnect();
          oscGain.disconnect();
        } catch (_) {}
      };
      osc.start(now);
      osc.stop(now + dur + 0.02);

      if (noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        src.playbackRate.value = 1.45;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.Q.value = 2.4;
        bp.frequency.setValueAtTime(pos(1100), now);
        bp.frequency.exponentialRampToValueAtTime(pos(240), now + dur);

        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(pos(0.3), now);
        nGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        src.connect(bp);
        bp.connect(nGain);
        nGain.connect(master);
        src.onended = () => {
          try {
            src.disconnect();
            bp.disconnect();
            nGain.disconnect();
          } catch (_) {}
        };
        src.start(now);
        src.stop(now + dur + 0.02);
      }
    } catch (_) {
      // safe no-op
    }
  }

  function update(speedKmh = 0, drifting = false, boosting = false, boostOrSlip = 1) {
    if (disposed || !ctx || !master || !oscA || !oscB || !oscC || !oscD || !engineFilter) return;

    const spd = Math.abs(finite(speedKmh, 0));
    const now = finite(ctx.currentTime, 0);
    const isBoosting = !!boosting;

    // Edge-trigger turbo boost SFX when boost begins, after-fire crackle when it ends
    // (OC-4: cars never boost, so these are suppressed)
    wasBoosting = isBoosting;

    // Simulated 5-speed gearbox RPM curve avoids shrill alarm-siren runaway across speeds
    let rpmNorm = 0.10;
    let gIdx = 0;
    if (spd >= 1.5) {
      const bands = [0, 26, 50, 74, 98, 125];
      for (let i = 0; i < bands.length - 1; i++) {
        if (spd >= bands[i]) gIdx = i;
      }
      const lo = bands[gIdx];
      const hi = bands[gIdx + 1];
      const frac = clamp((spd - lo) / Math.max(1, hi - lo), 0, 1, 0);
      const gearFloor = gIdx === 0 ? 0.14 : 0.36;
      rpmNorm = clamp(gearFloor + frac * (0.94 - gearFloor), 0.10, 0.96, 0.25);
      if (gIdx > prevGear && prevGear >= 0) {
        shiftPulseUntil = now + 0.09;
      }
      prevGear = gIdx;
    } else {
      prevGear = 0;
    }

    let load = 0;
    if (isBoosting) {
      load = 1;
    } else if (typeof drifting === "number") {
      load = clamp(Math.abs(drifting), 0, 1, 0);
    } else if (drifting) {
      load = typeof boostOrSlip === "number" ? clamp(Math.abs(boostOrSlip), 0.25, 1, 0.72) : 0.72;
    }

    // Warm exhaust harmonics (A: fundamental, B: musical 5th, C: sub octave, D: warm octave)
    const baseFreq = pos(46 + 88 * rpmNorm, 20);
    safeSetTarget(oscA.frequency, baseFreq, now, 0.065);
    safeSetTarget(oscB.frequency, pos(baseFreq * 1.5, 20), now, 0.065);
    safeSetTarget(oscC.frequency, pos(baseFreq * 0.5, 20), now, 0.065);
    safeSetTarget(oscD.frequency, pos(baseFreq * 2.0, 20), now, 0.065);

    if (gainA) safeSetTarget(gainA.gain, 0.26, now, 0.05);
    if (gainB) safeSetTarget(gainB.gain, 0.22, now, 0.05);
    if (gainC) safeSetTarget(gainC.gain, 0.36 - 0.08 * rpmNorm, now, 0.05);
    if (gainD) safeSetTarget(gainD.gain, 0.08 + 0.10 * rpmNorm, now, 0.05);

    safeSetTarget(engineFilter.frequency, pos(260 + 540 * rpmNorm + 160 * load, 80), now, 0.065);
    safeSetTarget(engineFilter.Q, pos(0.85 + 0.25 * load, 0.4), now, 0.08);
    safeSetTarget(engineGain.gain, pos(0.75 + 0.12 * rpmNorm + 0.08 * load, 0.15), now, 0.055);

    const shiftBoost = now < shiftPulseUntil ? 0.022 : 0;
    if (growlSrc && growlFilter && growlGain) {
      const growlFreq = pos(340 + 480 * rpmNorm + 220 * load + (shiftBoost > 0 ? 180 : 0), 100);
      const targetGrowl = muted ? 0 : Math.min(0.08, pos(0.012 + 0.03 * load + 0.018 * rpmNorm + shiftBoost, 0.005));
      safeSetTarget(growlFilter.frequency, growlFreq, now, 0.045);
      safeSetTarget(growlFilter.Q, pos(1.1 + 0.4 * load, 0.5), now, 0.08);
      safeSetTarget(growlGain.gain, targetGrowl, now, 0.035);
    }

    // Master gain
    const targetMaster = muted ? 0 : drifting ? 0.056 : 0.045;
    safeSetTarget(master.gain, targetMaster, now, 0.055);

    // Slip-proportional tire screech (softened bandpass to avoid harsh whistling)
    if (screechGain && screechFilter) {
      let slipNorm = 0;
      if (typeof drifting === "number") {
        slipNorm = clamp(Math.abs(drifting), 0, 1, 0);
      } else if (drifting) {
        slipNorm = typeof boostOrSlip === "number" && !isBoosting ? clamp(Math.abs(boostOrSlip), 0.25, 1, 0.72) : 0.72;
      }
      const speedScale = clamp(spd / 45, 0, 1, 0);
      const targetScreech = muted ? 0 : slipNorm * speedScale * 0.16;
      const centerFreq = pos(860 + slipNorm * 380, 200);
      safeSetTarget(screechFilter.frequency, centerFreq, now, 0.04);
      safeSetTarget(screechGain.gain, targetScreech, now, 0.04);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    removeUnlockListeners();

    const stopNode = (node) => {
      if (!node) return;
      try {
        if (typeof node.stop === "function") node.stop();
      } catch (_) {}
      try {
        if (typeof node.disconnect === "function") node.disconnect();
      } catch (_) {}
    };

    stopNode(oscA);
    stopNode(oscB);
    stopNode(oscC);
    stopNode(oscD);
    stopNode(screechSrc);
    stopNode(growlSrc);

    for (const node of [gainA, gainB, gainC, gainD, engineFilter, engineGain, screechFilter, screechGain, growlFilter, growlGain, master]) {
      if (node && typeof node.disconnect === "function") {
        try {
          node.disconnect();
        } catch (_) {}
      }
    }

    if (ctx && ctx.state !== "closed" && typeof ctx.close === "function") {
      try {
        const res = ctx.close();
        if (res && typeof res.catch === "function") res.catch(() => {});
      } catch (_) {}
    }

    ctx = null;
    master = null;
    engineFilter = null;
    engineGain = null;
    oscA = null;
    oscB = null;
    oscC = null;
    oscD = null;
    gainA = null;
    gainB = null;
    gainC = null;
    gainD = null;
    screechSrc = null;
    screechFilter = null;
    screechGain = null;
    growlSrc = null;
    growlFilter = null;
    growlGain = null;
    noiseBuffer = null;
  }

  return {
    ensure,
    setMuted,
    isMuted,
    update,
    playBoost,
    playCollision,
    playCheckpoint,
    playCountdown,
    dispose
  };
}
