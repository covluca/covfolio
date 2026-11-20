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

        oscA = ctx.createOscillator();
        oscA.type = "sawtooth";
        oscA.frequency.value = 58;

        oscB = ctx.createOscillator();
        oscB.type = "triangle";
        oscB.frequency.value = 87;

        oscA.connect(engineFilter);
        oscB.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(master);

        oscA.start();
        oscB.start();

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
        }
      } catch (_) {
        try {
          if (oscA) oscA.stop();
        } catch (_) {}
        try {
          if (oscB) oscB.stop();
        } catch (_) {}
        try {
          if (screechSrc) screechSrc.stop();
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
        screechSrc = null;
        screechFilter = null;
        screechGain = null;
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
    if (disposed || !ctx || !master || !oscA || !oscB || !engineFilter) return;

    const spd = Math.abs(finite(speedKmh, 0));
    const now = finite(ctx.currentTime, 0);
    const isBoosting = !!boosting;

    // Edge-trigger turbo boost SFX when boost begins
    if (isBoosting && !wasBoosting) {
      const tier = typeof boostOrSlip === "number" ? clamp(Math.round(boostOrSlip), 1, 3, 1) : 1;
      playBoost(tier);
    }
    wasBoosting = isBoosting;

    // Engine pitch & lowpass filter cutoff
    const boostPitch = isBoosting ? 24 : 0;
    const baseFreq = pos(54 + Math.min(165, spd * 1.15) + boostPitch, 20);
    safeSetTarget(oscA.frequency, baseFreq, now, 0.06);
    safeSetTarget(oscB.frequency, pos(baseFreq * 1.5, 20), now, 0.06);
    safeSetTarget(engineFilter.frequency, pos(500 + Math.min(2000, spd * 10) + (isBoosting ? 450 : 0), 80), now, 0.07);

    // Master gain
    const targetMaster = muted ? 0 : isBoosting ? 0.075 : drifting ? 0.065 : 0.052;
    safeSetTarget(master.gain, targetMaster, now, 0.06);

    // Slip-proportional tire screech
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
    stopNode(screechSrc);

    for (const node of [engineFilter, engineGain, screechFilter, screechGain, master]) {
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
    screechSrc = null;
    screechFilter = null;
    screechGain = null;
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
