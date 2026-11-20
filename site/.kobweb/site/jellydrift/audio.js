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
        master.gain.value = muted ? 0 : 0.055;
        master.connect(ctx.destination);

        // Dual-oscillator engine hum -> lowpass -> engineGain -> master
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = "lowpass";
        engineFilter.frequency.value = 540;
        engineFilter.Q.value = 1.2;

        engineGain = ctx.createGain();
        engineGain.gain.value = 0.85;

        // Layered procedural engine: fundamental (A/B), sub rumble (C),
        // harmonic growl (D) -> lowpass -> engineGain -> master.
        oscA = ctx.createOscillator();
        oscA.type = "sawtooth";
        oscA.frequency.value = 58;

        oscB = ctx.createOscillator();
        oscB.type = "triangle";
        oscB.frequency.value = 87;

        oscC = ctx.createOscillator();
        oscC.type = "sine";
        oscC.frequency.value = 50;

        oscD = ctx.createOscillator();
        oscD.type = "sawtooth";
        oscD.frequency.value = 50;

        oscA.connect(engineFilter);
        oscB.connect(engineFilter);
        oscC.connect(engineFilter);
        oscD.connect(engineFilter);
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
          screechFilter.frequency.value = 1150;
          screechFilter.Q.value = 3.5;

          screechGain = ctx.createGain();
          screechGain.gain.value = 0;

          screechSrc.connect(screechFilter);
          screechFilter.connect(screechGain);
          screechGain.connect(master);
          screechSrc.start();

          // Looped noise "engine growl" layer (procedural, no new asset)
          growlSrc = ctx.createBufferSource();
          growlSrc.buffer = noiseBuffer;
          growlSrc.loop = true;

          growlFilter = ctx.createBiquadFilter();
          growlFilter.type = "lowpass";
          growlFilter.frequency.value = 900;
          growlFilter.Q.value = 2.0;

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
      safeSetTarget(master.gain, muted ? 0 : 0.055, now, 0.03);
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

  function update(speedKmh = 0, drifting = false, boosting = false, boostOrSlip = 1) {
    if (disposed || !ctx || !master || !oscA || !oscB || !oscC || !oscD || !engineFilter) return;

    const spd = Math.abs(finite(speedKmh, 0));
    const now = finite(ctx.currentTime, 0);
    const isBoosting = !!boosting;

    // Edge-trigger turbo boost SFX when boost begins
    if (isBoosting && !wasBoosting) {
      const tier = typeof boostOrSlip === "number" ? clamp(Math.round(boostOrSlip), 1, 3, 1) : 1;
      playBoost(tier);
    }
    wasBoosting = isBoosting;

    // Engine RPM proxy from speed; load from boost/slip.
    const rpm = clamp(spd * 1.1 + 60, 40, 340);
    const rpmNorm = clamp((rpm - 40) / 300, 0, 1);
    let load = 0;
    if (isBoosting) {
      load = 1;
    } else if (typeof drifting === "number") {
      load = clamp(Math.abs(drifting), 0, 1, 0);
    } else if (drifting) {
      load = typeof boostOrSlip === "number" ? clamp(Math.abs(boostOrSlip), 0.25, 1, 0.72) : 0.72;
    }

    // Layered procedural engine: A/B fundamentals rise with RPM, C sub-rumble
    // fades as RPM climbs, D harmonic layer gets raspier with RPM and load.
    const baseFreq = pos(45 + 295 * rpmNorm + (isBoosting ? 26 : 0), 20);
    safeSetTarget(oscA.frequency, baseFreq, now, 0.06);
    safeSetTarget(oscB.frequency, pos(baseFreq * 1.35, 20), now, 0.06);
    safeSetTarget(oscC.frequency, pos(baseFreq * 0.42, 20), now, 0.06);
    safeSetTarget(oscD.frequency, pos(baseFreq * 3.0, 20), now, 0.06);

    // Timbre shifts with RPM and load: brighter filter + harmonic mix up high,
    // dirty growl noise layer while loaded.
    safeSetTarget(engineFilter.frequency, pos(640 + 1600 * rpmNorm + 500 * load, 120), now, 0.07);
    safeSetTarget(engineFilter.Q, pos(1.15 + 0.7 * rpmNorm + 0.5 * load, 0.6), now, 0.09);
    safeSetTarget(engineGain.gain, pos(0.9 + 0.07 * rpmNorm + 0.06 * load, 0.2), now, 0.06);

    safeSetTarget(oscC.gain, pos(0.15 + 0.10 * (1 - rpmNorm) + 0.05 * load, 0.05), now, 0.07);
    safeSetTarget(oscD.gain, pos(0.08 + 0.24 * rpmNorm + 0.22 * load, 0.04), now, 0.07);

    if (growlSrc && growlFilter && growlGain) {
      const growlFreq = pos(500 + 1400 * rpmNorm + 600 * load, 120);
      const targetGrowl = muted ? 0 : pos(0.04 + 0.26 * load + 0.10 * rpmNorm * (1 - load), 0.02);
      safeSetTarget(growlFilter.frequency, growlFreq, now, 0.06);
      safeSetTarget(growlFilter.Q, pos(2.0 + 0.8 * load, 0.5), now, 0.1);
      safeSetTarget(growlGain.gain, targetGrowl, now, 0.06);
    }

    // Master gain
    const targetMaster = muted ? 0 : isBoosting ? 0.075 : drifting ? 0.065 : 0.052;
    safeSetTarget(master.gain, targetMaster, now, 0.06);

    // Slip-proportional tire screech (unchanged)
    if (screechGain && screechFilter) {
      let slipNorm = 0;
      if (typeof drifting === "number") {
        slipNorm = clamp(Math.abs(drifting), 0, 1, 0);
      } else if (drifting) {
        slipNorm = typeof boostOrSlip === "number" && !isBoosting ? clamp(Math.abs(boostOrSlip), 0.25, 1, 0.72) : 0.72;
      }
      const speedScale = clamp(spd / 45, 0, 1, 0);
      const targetScreech = muted ? 0 : slipNorm * speedScale * 0.42;
      const centerFreq = pos(920 + slipNorm * 620, 200);
      safeSetTarget(screechFilter.frequency, centerFreq, now, 0.05);
      safeSetTarget(screechGain.gain, targetScreech, now, 0.05);
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

    for (const node of [engineFilter, engineGain, screechFilter, screechGain, growlFilter, growlGain, master]) {
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
