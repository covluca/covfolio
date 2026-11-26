import * as THREE from "./vendor/three.module.min.js";

// Hard 120 km/h ceiling — every car is tuned just under it, and physics
// enforces the same cap as a backstop.
export const MAX_TOP_SPEED_MS = 120 / 3.6;

export const CARS = {
  jelly_gt: {
    id: "jelly_gt",
    name: "Jelly GT",
    subtitle: "Balanced Arcade Coupe",
    colorHex: "#E63946",
    accentHex: "#FFFFFF",
    primary: 0xe63946,
    accent: 0xffffff,
    trim: 0x1d2330,
    maxSpeed: 32.9,
    topSpeed: 32.9,
    accel: 34,
    brake: 10.5,
    steerRate: 2.25,
    reverseSpeed: 13,
    driftGrip: 1.0,
    jellyBounce: 1.0,
    mass: 1.0,
    width: 1.84,
    height: 1.32,
    length: 4.3,
    wheelBase: 2.58,
    wheelRadius: 0.34,
    stats: {
      topSpeed: 7,
      accel: 7,
      driftGrip: 7,
      jellyBounce: 7
    }
  },
  tofu_86: {
    id: "tofu_86",
    name: "Tofu 86",
    subtitle: "Drift Specialist Fastback",
    colorHex: "#F4F5F7",
    accentHex: "#181B22",
    primary: 0xf4f5f7,
    accent: 0x181b22,
    trim: 0x1e2430,
    maxSpeed: 32.8,
    topSpeed: 32.8,
    accel: 32,
    brake: 10.0,
    steerRate: 2.35,
    reverseSpeed: 12,
    driftGrip: 1.24,
    jellyBounce: 0.92,
    mass: 0.92,
    width: 1.74,
    height: 1.34,
    length: 4.2,
    wheelBase: 2.44,
    wheelRadius: 0.32,
    stats: {
      topSpeed: 6,
      accel: 7,
      driftGrip: 10,
      jellyBounce: 6
    }
  },
  bumble_buggy: {
    id: "bumble_buggy",
    name: "Bumble Buggy",
    subtitle: "High-Bounce Rally Micro-Truck",
    colorHex: "#F3DB5B",
    accentHex: "#222630",
    primary: 0xf3db5b,
    accent: 0x222630,
    trim: 0xff9f1c,
    maxSpeed: 32.5,
    topSpeed: 32.5,
    accel: 38,
    brake: 9.6,
    steerRate: 2.30,
    reverseSpeed: 14,
    driftGrip: 0.95,
    jellyBounce: 1.35,
    mass: 1.18,
    width: 1.86,
    height: 1.50,
    length: 3.98,
    wheelBase: 2.50,
    wheelRadius: 0.38,
    stats: {
      topSpeed: 6,
      accel: 9,
      driftGrip: 6,
      jellyBounce: 10
    }
  },
  cobalt_hyper: {
    id: "cobalt_hyper",
    name: "Cobalt Hyper",
    subtitle: "Low-Slug Aero Hypercar",
    colorHex: "#3C83EF",
    accentHex: "#00E5FF",
    primary: 0x3c83ef,
    accent: 0x00e5ff,
    trim: 0x101828,
    maxSpeed: MAX_TOP_SPEED_MS,
    topSpeed: MAX_TOP_SPEED_MS,
    accel: 37,
    brake: 11.8,
    steerRate: 2.15,
    reverseSpeed: 13,
    driftGrip: 1.06,
    jellyBounce: 0.78,
    mass: 1.05,
    width: 2.00,
    height: 1.22,
    length: 4.54,
    wheelBase: 2.72,
    wheelRadius: 0.35,
    stats: {
      topSpeed: 10,
      accel: 8,
      driftGrip: 8,
      jellyBounce: 5
    }
  }
};

export const CAR_IDS = ["jelly_gt", "tofu_86", "bumble_buggy", "cobalt_hyper"];

export function getCar(id) {
  return CARS[id] || CARS[CAR_IDS[0]];
}

function makeContactShadowTexture(THREE) {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(32, 32, 8, 32, 32, 31);
  grad.addColorStop(0, "rgba(0, 0, 0, 0.85)");
  grad.addColorStop(0.55, "rgba(0, 0, 0, 0.45)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeWheelAssembly(radius, width, rimColor, trackGeo, trackMat) {
  const spinGroup = new THREE.Group();
  spinGroup.name = "wheel-spin";

  const tireGeo = trackGeo(new THREE.CylinderGeometry(radius, radius, width, 18));
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x171a21,
      roughness: 0.85,
      metalness: 0.1
    })
  );
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = true;
  spinGroup.add(tire);

  const rimGeo = trackGeo(new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, width + 0.02, 12));
  rimGeo.rotateZ(Math.PI / 2);
  const rimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: rimColor,
      roughness: 0.32,
      metalness: 0.68
    })
  );
  const rim = new THREE.Mesh(rimGeo, rimMat);
  spinGroup.add(rim);

  const hubGeo = trackGeo(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, width + 0.04, 8));
  hubGeo.rotateZ(Math.PI / 2);
  const hubMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x0f1219, metalness: 0.5, roughness: 0.4 }));
  spinGroup.add(new THREE.Mesh(hubGeo, hubMat));

  return spinGroup;
}

/**
 * Supports both createCarMesh(def, options) and legacy createCarMesh(THREE, def, options).
 * Coordinate frame: +Z forward, +Y up, +X car-left, -X car-right.
 */
export function createCarMesh(defOrThree, optionsOrDef = {}, maybeOpts = {}) {
  let def;
  let options;
  if (defOrThree && typeof defOrThree.Group === "function") {
    def = typeof optionsOrDef === "string" ? getCar(optionsOrDef) : optionsOrDef || getCar("jelly_gt");
    options = maybeOpts || {};
  } else {
    def = typeof defOrThree === "string" ? getCar(defOrThree) : defOrThree || getCar("jelly_gt");
    options = optionsOrDef || {};
  }

  const disposables = [];
  const trackGeo = (g) => { disposables.push(g); return g; };
  const trackMat = (m) => { disposables.push(m); return m; };

  const carRoot = new THREE.Group();
  carRoot.name = "carRoot";

  const jellyChassis = new THREE.Group();
  jellyChassis.name = "jellyChassis";
  carRoot.add(jellyChassis);

  const bodyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: def.primary,
      roughness: 0.28,
      metalness: 0.35
    })
  );
  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: def.accent,
      roughness: 0.36,
      metalness: 0.28
    })
  );
  const trimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: def.trim,
      roughness: 0.6,
      metalness: 0.25
    })
  );
  const dashMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161a24,
      roughness: 0.72,
      metalness: 0.18
    })
  );
  const interiorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e2432,
      roughness: 0.78,
      metalness: 0.15,
      side: THREE.DoubleSide
    })
  );
  const glassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x99d8ff,
      roughness: 0.12,
      metalness: 0.15,
      transparent: true,
      opacity: 0.10,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  const rearGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.15,
      metalness: 0.3,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  const headLightMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xfff8cf }));
  const tailLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x991122,
      emissive: 0xff1e38,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.1
    })
  );
  const brakeGlowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xff2b48,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  const beamMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfff6d2,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  const roofLightMat = trackMat(new THREE.MeshBasicMaterial({ color: def.id === "cobalt_hyper" ? 0x00e5ff : 0xf3db5b }));

  const w = def.width;
  const len = def.length;
  const rWheel = def.wheelRadius;
  const isBuggy = def.id === "bumble_buggy";
  const isHyper = def.id === "cobalt_hyper";
  const isTofu = def.id === "tofu_86";

  const groundClearance = isBuggy ? 0.34 : isHyper ? 0.18 : 0.24;
  const sillTopY = groundClearance + (isBuggy ? 0.44 : isHyper ? 0.32 : 0.38);
  const roofTopY = isBuggy ? 1.66 : isHyper ? 1.53 : 1.58;
  const hoodTopY = isBuggy ? 0.88 : isHyper ? 0.64 : 0.74;
  const eyeY = isBuggy ? 1.24 : isHyper ? 1.14 : 1.18;
  const eyeZ = 0.25;

  // --- 1. Lower Chassis Tub / Floorpan / Sills (Open Interior Cockpit!) ---
  const body = new THREE.Group();
  body.name = "car-body";
  jellyChassis.add(body);

  // Floorpan
  const floorGeo = trackGeo(new THREE.BoxGeometry(w * 0.92, 0.14, len * 0.88));
  const floorMesh = new THREE.Mesh(floorGeo, trimMat);
  floorMesh.position.set(0, groundClearance + 0.07, 0);
  body.add(floorMesh);

  // Left & Right Door Sills (open cockpit side walls up to sillTopY)
  const sillH = sillTopY - groundClearance;
  const sillGeo = trackGeo(new THREE.BoxGeometry(0.18, sillH, len * 0.56));
  for (const side of [-1, 1]) {
    const sill = new THREE.Mesh(sillGeo, bodyMat);
    sill.position.set(side * (w * 0.5 - 0.09), groundClearance + sillH * 0.5, -0.05);
    body.add(sill);
  }

  // Front Hood / Nose Section (forward of cabin: z = +0.76 .. +len*0.48)
  const hoodLen = len * 0.34;
  const hoodZ = len * 0.5 - hoodLen * 0.5 - 0.06;
  const hoodH = hoodTopY - groundClearance;
  const hoodGeo = trackGeo(new THREE.BoxGeometry(w * 0.96, hoodH, hoodLen));
  const hood = new THREE.Mesh(hoodGeo, isTofu ? accentMat : bodyMat);
  hood.position.set(0, groundClearance + hoodH * 0.5, hoodZ);
  if (isHyper) {
    hood.rotation.x = 0.08;
  }
  body.add(hood);

  // Rear Deck / Engine Bay (behind cabin: z = -len*0.48 .. -0.68)
  const rearLen = len * 0.30;
  const rearZ = -len * 0.5 + rearLen * 0.5 + 0.06;
  const rearH = (isBuggy ? 0.52 : 0.48);
  const rearGeo = trackGeo(new THREE.BoxGeometry(w * 0.96, rearH, rearLen));
  const rearDeck = new THREE.Mesh(rearGeo, bodyMat);
  rearDeck.position.set(0, groundClearance + rearH * 0.5, rearZ);
  body.add(rearDeck);

  // Rear Bulkhead (behind driver seat)
  const bulkheadGeo = trackGeo(new THREE.BoxGeometry(w * 0.86, 0.52, 0.14));
  const bulkhead = new THREE.Mesh(bulkheadGeo, interiorMat);
  bulkhead.position.set(0, groundClearance + 0.34, -0.58);
  body.add(bulkhead);

  // Bumpers
  const frontBumperGeo = trackGeo(new THREE.BoxGeometry(w * 1.0, isBuggy ? 0.24 : 0.16, 0.24));
  const frontBumper = new THREE.Mesh(frontBumperGeo, isTofu || isBuggy ? accentMat : trimMat);
  frontBumper.position.set(0, groundClearance + 0.12, len * 0.5 - 0.02);
  body.add(frontBumper);

  const rearBumperGeo = trackGeo(new THREE.BoxGeometry(w * 1.0, 0.18, 0.24));
  const rearBumper = new THREE.Mesh(rearBumperGeo, trimMat);
  rearBumper.position.set(0, groundClearance + 0.12, -len * 0.5 + 0.02);
  body.add(rearBumper);

  // Headlights, Taillights, Dynamic Brake Glows & Night Headlight Beams
  const hlGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.13, 0.08));
  const brakeGlowGeo = trackGeo(new THREE.PlaneGeometry(0.46, 0.24));
  const beamGeo = trackGeo(new THREE.ConeGeometry(1.15, 11.5, 12, 1, true));
  beamGeo.rotateX(Math.PI / 2);
  const brakeGlows = [];
  const headlightBeams = [];
  const isNightMode = !!(options && options.nightMode);

  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(hlGeo, headLightMat);
    hl.position.set(side * (w * 0.33), groundClearance + (isBuggy ? 0.38 : 0.28), len * 0.5 + 0.02);
    body.add(hl);

    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(side * (w * 0.33), groundClearance + 0.20, len * 0.5 + 5.75);
    beam.rotation.x = 0.05;
    beam.visible = isNightMode;
    beam.castShadow = false;
    body.add(beam);
    headlightBeams.push(beam);

    const tl = new THREE.Mesh(hlGeo, tailLightMat);
    tl.position.set(side * (w * 0.33), groundClearance + 0.34, -len * 0.5 - 0.02);
    body.add(tl);

    const glow = new THREE.Mesh(brakeGlowGeo, brakeGlowMat);
    glow.position.set(side * (w * 0.33), groundClearance + 0.34, -len * 0.5 - 0.075);
    glow.rotation.y = Math.PI;
    glow.castShadow = false;
    body.add(glow);
    brakeGlows.push(glow);

    // Sculpted side mirrors & twin chrome exhaust tips
    const mirror = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.09, 0.12)), bodyMat);
    mirror.position.set(side * (w * 0.52), sillTopY + 0.10, 0.62);
    body.add(mirror);

    const exhaust = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.048, 0.048, 0.18, 10)).rotateX(Math.PI / 2),
      trackMat(new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.85, roughness: 0.22 }))
    );
    exhaust.position.set(side * (w * 0.28), groundClearance + 0.07, -len * 0.5 - 0.05);
    body.add(exhaust);
  }

  // --- 2. Silhouette-Distinct Details per Car ---
  if (def.id === "jelly_gt") {
    // Racing center stripe
    const stripeGeo = trackGeo(new THREE.BoxGeometry(0.36, 0.02, hoodLen * 0.95));
    const stripe = new THREE.Mesh(stripeGeo, accentMat);
    stripe.position.set(0, hoodTopY + 0.015, hoodZ);
    body.add(stripe);

    // Front splitter
    const splitterGeo = trackGeo(new THREE.BoxGeometry(w * 1.04, 0.06, 0.34));
    const splitter = new THREE.Mesh(splitterGeo, trimMat);
    splitter.position.set(0, groundClearance + 0.03, len * 0.5 + 0.06);
    body.add(splitter);

    // Twin-post GT Wing
    const wingY = groundClearance + rearH + 0.30;
    const postGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.32, 0.14));
    for (const side of [-0.48, 0.48]) {
      const post = new THREE.Mesh(postGeo, trimMat);
      post.position.set(side, groundClearance + rearH + 0.14, -len * 0.44);
      body.add(post);
    }
    const wingGeo = trackGeo(new THREE.BoxGeometry(w * 0.94, 0.07, 0.34));
    const wing = new THREE.Mesh(wingGeo, accentMat);
    wing.position.set(0, wingY, -len * 0.46);
    body.add(wing);
  } else if (isTofu) {
    // Panda black side beltline trim
    const sideTrimGeo = trackGeo(new THREE.BoxGeometry(w * 0.99, 0.10, len * 0.88));
    const sideTrim = new THREE.Mesh(sideTrimGeo, accentMat);
    sideTrim.position.set(0, groundClearance + 0.20, 0);
    body.add(sideTrim);

    // Pop-up headlight housings
    const popGeo = trackGeo(new THREE.BoxGeometry(0.36, 0.14, 0.24));
    for (const side of [-1, 1]) {
      const pop = new THREE.Mesh(popGeo, bodyMat);
      pop.position.set(side * (w * 0.33), hoodTopY + 0.07, len * 0.5 - 0.14);
      body.add(pop);
    }

    // Fastback ducktail spoiler
    const duckGeo = trackGeo(new THREE.BoxGeometry(w * 0.92, 0.14, 0.22));
    const duck = new THREE.Mesh(duckGeo, accentMat);
    duck.position.set(0, groundClearance + rearH + 0.08, -len * 0.46);
    duck.rotation.x = -0.35;
    body.add(duck);
  } else if (isBuggy) {
    // Chunky fender flares
    const flareGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.24, 0.96));
    for (const side of [-1, 1]) {
      for (const zOff of [def.wheelBase * 0.5, -def.wheelBase * 0.5]) {
        const flare = new THREE.Mesh(flareGeo, accentMat);
        flare.position.set(side * (w * 0.49), groundClearance + 0.32, zOff);
        body.add(flare);
      }
    }
    // Front tubular bullbar
    const bullGeo = trackGeo(new THREE.BoxGeometry(w * 0.72, 0.22, 0.18));
    const bull = new THREE.Mesh(bullGeo, trimMat);
    bull.position.set(0, groundClearance + 0.28, len * 0.5 + 0.10);
    body.add(bull);

    // Diagonal rear roll-cage bars + tailgate spare tire
    const barGeo = trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 1.25, 8));
    for (const side of [-0.56, 0.56]) {
      const bar = new THREE.Mesh(barGeo, accentMat);
      bar.position.set(side, groundClearance + rearH + 0.36, -1.05);
      bar.rotation.x = 0.72;
      body.add(bar);
    }
    const spareGeo = trackGeo(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 14));
    spareGeo.rotateX(Math.PI / 2);
    const spare = new THREE.Mesh(spareGeo, accentMat);
    spare.position.set(0, groundClearance + 0.42, -len * 0.5 - 0.12);
    body.add(spare);
  } else if (isHyper) {
    // Side aero pods & cyan trim strips
    const podGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.32, len * 0.46));
    const stripGeo = trackGeo(new THREE.BoxGeometry(0.05, 0.07, len * 0.48));
    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(podGeo, trimMat);
      pod.position.set(side * (w * 0.49), groundClearance + 0.20, -0.08);
      body.add(pod);

      const strip = new THREE.Mesh(stripGeo, accentMat);
      strip.position.set(side * (w * 0.52), groundClearance + 0.24, -0.08);
      body.add(strip);
    }
    // Split rear diffuser + low aero wing
    const wingGeo = trackGeo(new THREE.BoxGeometry(w * 1.02, 0.06, 0.38));
    const wing = new THREE.Mesh(wingGeo, trimMat);
    wing.position.set(0, groundClearance + rearH + 0.22, -len * 0.47);
    body.add(wing);

    const wingEdgeGeo = trackGeo(new THREE.BoxGeometry(w * 1.04, 0.03, 0.08));
    const wingEdge = new THREE.Mesh(wingEdgeGeo, accentMat);
    wingEdge.position.set(0, groundClearance + rearH + 0.23, -len * 0.49);
    body.add(wingEdge);
  }

  // --- 3. Open Cabin Frame (Thin A-pillars, B/C-pillars, Roof, Tinted Windshield) ---
  const cabin = new THREE.Group();
  cabin.name = "cabin-frame";
  jellyChassis.add(cabin);

  const roofW = w * 0.78;
  const roofL = len * 0.30;
  const roofZ = -0.18;
  const roofThickness = 0.07;

  const roofGeo = trackGeo(new THREE.BoxGeometry(roofW, roofThickness, roofL));
  const roofPanel = new THREE.Mesh(roofGeo, bodyMat);
  roofPanel.position.set(0, roofTopY - roofThickness * 0.5, roofZ);
  cabin.add(roofPanel);

  // Inner dark headliner so driver view never sees bright white underside
  const headlinerGeo = trackGeo(new THREE.PlaneGeometry(roofW * 0.94, roofL * 0.94));
  headlinerGeo.rotateX(Math.PI / 2);
  const headliner = new THREE.Mesh(headlinerGeo, interiorMat);
  headliner.position.set(0, roofTopY - roofThickness - 0.005, roofZ);
  cabin.add(headliner);

  // Thin A-pillars connecting front dash corners to roof front corners
  const aPillarTopY = roofTopY - 0.04;
  const aPillarBotY = sillTopY;
  const aStartZ = 0.92;
  const aEndZ = roofZ + roofL * 0.5;
  const aLen = Math.hypot(aPillarTopY - aPillarBotY, aStartZ - aEndZ);
  const aTilt = Math.atan2(aStartZ - aEndZ, aPillarTopY - aPillarBotY);
  const aPillarGeo = trackGeo(new THREE.BoxGeometry(0.036, aLen, 0.045));

  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(aPillarGeo, trimMat);
    pillar.position.set(
      side * (roofW * 0.5 - 0.02),
      (aPillarTopY + aPillarBotY) * 0.5,
      (aStartZ + aEndZ) * 0.5
    );
    pillar.rotation.x = -aTilt;
    cabin.add(pillar);
  }

  // Subtle translucent windshield aligned cleanly with A-pillars (never occludes horizon or console)
  const wsGeo = trackGeo(new THREE.PlaneGeometry(roofW * 0.94, aLen * 0.96));
  const windshield = new THREE.Mesh(wsGeo, glassMat);
  windshield.position.set(0, (aPillarTopY + aPillarBotY) * 0.5, (aStartZ + aEndZ) * 0.5);
  windshield.rotation.x = -aTilt;
  cabin.add(windshield);

  // Rear B/C-pillars + sleek tinted rear & quarter glass so coupes read solid from chase view
  const cStartZ = -0.82;
  const cEndZ = roofZ - roofL * 0.5;
  const cLen = Math.hypot(aPillarTopY - aPillarBotY, cStartZ - cEndZ);
  const cTilt = Math.atan2(cEndZ - cStartZ, aPillarTopY - aPillarBotY);
  const cPillarGeo = trackGeo(new THREE.BoxGeometry(0.08, cLen, 0.14));
  for (const side of [-1, 1]) {
    const cp = new THREE.Mesh(cPillarGeo, bodyMat);
    cp.position.set(
      side * (roofW * 0.5 - 0.03),
      (aPillarTopY + aPillarBotY) * 0.5,
      (cStartZ + cEndZ) * 0.5
    );
    cp.rotation.x = cTilt;
    cabin.add(cp);
  }

  const rearWinGeo = trackGeo(new THREE.PlaneGeometry(roofW * 0.88, cLen * 0.94));
  const rearWindow = new THREE.Mesh(rearWinGeo, rearGlassMat);
  rearWindow.position.set(0, (aPillarTopY + aPillarBotY) * 0.5, (cStartZ + cEndZ) * 0.5);
  rearWindow.rotation.x = cTilt;
  cabin.add(rearWindow);

  const quarterWinGeo = trackGeo(new THREE.PlaneGeometry(0.50, Math.max(0.24, aPillarTopY - aPillarBotY)));
  for (const side of [-1, 1]) {
    const qw = new THREE.Mesh(quarterWinGeo, rearGlassMat);
    qw.position.set(side * (roofW * 0.5 - 0.025), (aPillarTopY + aPillarBotY) * 0.5, -0.56);
    qw.rotation.y = Math.PI * 0.5;
    cabin.add(qw);
  }

  // --- 4. Open Interior Cockpit: Sculpted Wrap-Around Dash & Recessed Center Console ---
  // The dash cowl sweeps door-to-door with a hard height cap below the driver's
  // sightline so the road stays visible over the hood in DRIVER/HOOD views.
  const dashTopY = isBuggy ? 0.88 : isHyper ? 0.80 : 0.84;
  const dashShiftY = dashTopY - 0.80;
  const dashCowl = new THREE.Group();
  dashCowl.name = "dash-cowl";
  jellyChassis.add(dashCowl);

  // Center dash panels split around a center-console opening so the display
  // stack stays visible (never buried behind a solid dash slab)
  const cowlPanelW = Math.max(0.20, w * 0.31 - 0.30);
  const cowlPanelGeo = trackGeo(new THREE.BoxGeometry(cowlPanelW, 0.20, 0.36));
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(cowlPanelGeo, dashMat);
    panel.position.set(side * (0.30 + cowlPanelW * 0.5), 0.70 + dashShiftY, 0.76);
    panel.rotation.x = -0.30;
    dashCowl.add(panel);
  }

  // Side wings sweep into the door sills for a wrap-around cockpit cowl
  const cowlWingGeo = trackGeo(new THREE.BoxGeometry(0.30, 0.17, 0.48));
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(cowlWingGeo, dashMat);
    wing.position.set(side * (w * 0.31), 0.66 + dashShiftY, 0.75);
    wing.rotation.set(-0.22, side * 0.42, 0);
    dashCowl.add(wing);
  }

  // Flat dash cap: hard ceiling on dash height, keeps windshield sightline clear
  const capPanelW = Math.max(0.16, w * 0.35 - 0.30);
  const capPanelGeo = trackGeo(new THREE.BoxGeometry(capPanelW, 0.07, 0.30));
  for (const side of [-1, 1]) {
    const capPanel = new THREE.Mesh(capPanelGeo, dashMat);
    capPanel.position.set(side * (0.30 + capPanelW * 0.5), dashTopY - 0.035, 0.76);
    dashCowl.add(capPanel);
  }

  // Driver instrument binnacle tucked in front of the wheel + live cockpit RPM bar
  const binnacleGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.08, 0.24));
  const binnacle = new THREE.Mesh(binnacleGeo, dashMat);
  binnacle.position.set(-0.25, 0.77 + dashShiftY, 0.66);
  binnacle.rotation.x = -0.16;
  dashCowl.add(binnacle);

  const rpmBacking = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(0.28, 0.030)),
    trackMat(new THREE.MeshBasicMaterial({ color: 0x090d16 }))
  );
  rpmBacking.position.set(-0.25, 0.77 + dashShiftY + 0.022, 0.535);
  rpmBacking.rotation.y = Math.PI;
  dashCowl.add(rpmBacking);

  const rpmBarMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x22c55e }));
  const rpmBarGeo = trackGeo(new THREE.PlaneGeometry(0.26, 0.020));
  const rpmBarMesh = new THREE.Mesh(rpmBarGeo, rpmBarMat);
  rpmBarMesh.position.set(-0.25, 0.77 + dashShiftY + 0.022, 0.532);
  rpmBarMesh.rotation.y = Math.PI;
  dashCowl.add(rpmBarMesh);

  // Lower center console stack between the seats
  const consoleStackGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.34, 0.44));
  const consoleStack = new THREE.Mesh(consoleStackGeo, dashMat);
  consoleStack.position.set(0, 0.55, 0.46);
  consoleStack.rotation.x = -0.10;
  jellyChassis.add(consoleStack);

  // Shifter hump on the console tunnel
  const shifterHumpGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.07, 0.20));
  const shifterHump = new THREE.Mesh(shifterHumpGeo, trimMat);
  shifterHump.position.set(0, 0.72, 0.32);
  shifterHump.rotation.x = -0.08;
  jellyChassis.add(shifterHump);

  // Driver Seat & Head/Helmet
  const seatGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.52, 0.16));
  const seat = new THREE.Mesh(seatGeo, interiorMat);
  seat.position.set(-0.25, 0.64, -0.08);
  seat.rotation.x = -0.15;
  jellyChassis.add(seat);

  const driverHead = new THREE.Group();
  driverHead.name = "driver-head";
  driverHead.position.set(-0.25, eyeY, 0.04);
  const helmetGeo = trackGeo(new THREE.SphereGeometry(0.17, 12, 10));
  const helmetMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: def.id === "tofu_86" ? 0xf8fafc : def.accent,
      roughness: 0.35,
      metalness: 0.25
    })
  );
  const helmet = new THREE.Mesh(helmetGeo, helmetMat);
  driverHead.add(helmet);

  const visorGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.09, 0.14));
  const visorMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.8 }));
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 0.02, 0.12);
  driverHead.add(visor);
  jellyChassis.add(driverHead);

  // Steering Column + Animated Steering Wheel in front of driver eye
  const steerMount = new THREE.Group();
  steerMount.position.set(-0.25, isBuggy ? 0.94 : isHyper ? 0.87 : 0.90, 0.48);
  steerMount.rotation.x = 0.45; // tilted back toward driver
  jellyChassis.add(steerMount);

  const colGeo = trackGeo(new THREE.CylinderGeometry(0.032, 0.04, 0.28, 8));
  colGeo.rotateX(Math.PI / 2);
  const col = new THREE.Mesh(colGeo, trimMat);
  col.position.z = 0.12;
  steerMount.add(col);

  const steerWheel = new THREE.Group();
  steerWheel.name = "steer-wheel";
  steerMount.add(steerWheel);

  const wheelRimGeo = trackGeo(new THREE.TorusGeometry(0.165, 0.022, 8, 20));
  const wheelRim = new THREE.Mesh(wheelRimGeo, trimMat);
  steerWheel.add(wheelRim);

  const spokeGeo = trackGeo(new THREE.BoxGeometry(0.30, 0.028, 0.02));
  const spokeH = new THREE.Mesh(spokeGeo, accentMat);
  steerWheel.add(spokeH);

  const spokeVGeo = trackGeo(new THREE.BoxGeometry(0.028, 0.16, 0.02));
  const spokeV = new THREE.Mesh(spokeVGeo, accentMat);
  spokeV.position.y = -0.08;
  steerWheel.add(spokeV);

  const centerCapGeo = trackGeo(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10));
  centerCapGeo.rotateX(Math.PI / 2);
  const centerCap = new THREE.Mesh(centerCapGeo, accentMat);
  steerWheel.add(centerCap);

  // --- 4b. Recessed Center-Console Infotainment (compact lower-dash bezel angled at driver's eyes) ---
  const displayW = 0.32;
  const displayH = 0.105;
  const consoleY = eyeY - 0.30;

  // Center dash tower / stack face that the display is sunk into
  const centerTowerGeo = trackGeo(new THREE.BoxGeometry(0.40, 0.26, 0.14));
  const centerTower = new THREE.Mesh(centerTowerGeo, dashMat);
  centerTower.position.set(0.15, consoleY - 0.04, 0.96);
  jellyChassis.add(centerTower);

  // Neck bridging the console tunnel up to the display housing
  const consoleNeckGeo = trackGeo(new THREE.BoxGeometry(0.34, 0.10, 0.16));
  const consoleNeck = new THREE.Mesh(consoleNeckGeo, dashMat);
  consoleNeck.position.set(0.12, consoleY - 0.12, 0.81);
  jellyChassis.add(consoleNeck);

  const consoleBezel = new THREE.Group();
  consoleBezel.name = "console-bezel";
  consoleBezel.position.set(0.16, consoleY, 0.92);
  consoleBezel.lookAt(-0.22, eyeY, eyeZ);
  jellyChassis.add(consoleBezel);

  // Matte housing sunk into the console stack (four bezel bars + inset screen)
  const panelW = 0.36;
  const panelH = 0.14;
  const panelDepth = 0.04;
  const panelZ = -0.005;
  const consoleTopMargin = (panelH - displayH) * 0.5;
  const consoleSideMargin = (panelW - displayW) * 0.5;

  const consoleTopBarGeo = trackGeo(new THREE.BoxGeometry(panelW, consoleTopMargin, panelDepth));
  const consoleTopBar = new THREE.Mesh(consoleTopBarGeo, trimMat);
  consoleTopBar.position.set(0, (panelH - consoleTopMargin) * 0.5, panelZ);
  consoleBezel.add(consoleTopBar);

  const consoleBottomBar = new THREE.Mesh(consoleTopBarGeo, trimMat);
  consoleBottomBar.position.set(0, -(panelH - consoleTopMargin) * 0.5, panelZ);
  consoleBezel.add(consoleBottomBar);

  const consoleSideBarGeo = trackGeo(new THREE.BoxGeometry(consoleSideMargin, displayH, panelDepth));
  for (const side of [-1, 1]) {
    const sideBar = new THREE.Mesh(consoleSideBarGeo, trimMat);
    sideBar.position.set(side * (panelW - consoleSideMargin) * 0.5, 0, panelZ);
    consoleBezel.add(sideBar);
  }

  const consoleFloorGeo = trackGeo(new THREE.BoxGeometry(panelW, panelH, 0.01));
  const consoleFloor = new THREE.Mesh(consoleFloorGeo, trimMat);
  consoleFloor.position.set(0, 0, panelZ - panelDepth * 0.5);
  consoleBezel.add(consoleFloor);

  // Screen plane, recessed inside the bezel (DOM ad overlay maps onto it)
  const screenGeo = trackGeo(new THREE.PlaneGeometry(displayW, displayH));
  const screenMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      side: THREE.FrontSide
    })
  );
  const screenFace = new THREE.Mesh(screenGeo, screenMat);
  screenFace.position.z = 0.004;
  consoleBezel.add(screenFace);

  // Overhanging cowl brow shades the screen top for the "sunken" look
  const bezelBrowGeo = trackGeo(new THREE.BoxGeometry(0.40, 0.04, 0.10));
  const bezelBrow = new THREE.Mesh(bezelBrowGeo, trimMat);
  bezelBrow.position.set(0, panelH * 0.5 + 0.025, 0.02);
  bezelBrow.rotation.x = 0.28;
  consoleBezel.add(bezelBrow);

  // Thin accent underline below the display
  const bezelUnderlineGeo = trackGeo(new THREE.BoxGeometry(displayW, 0.010, 0.008));
  const bezelUnderline = new THREE.Mesh(bezelUnderlineGeo, accentMat);
  bezelUnderline.position.set(0, -displayH * 0.5 - 0.010, 0.020);
  consoleBezel.add(bezelUnderline);

  const consoleAnchor = new THREE.Object3D();
  consoleAnchor.name = "console-anchor";
  consoleAnchor.position.set(0, 0, 0.006);
  consoleBezel.add(consoleAnchor);

  // Frozen contract: corner children in screen-viewer orientation (driver eye).
  // Local +Z points out of the screen toward the driver, +X is the viewer's
  // screen-right (driver right = car -X), +Y is screen-up.
  const consoleHalfW = displayW * 0.5;
  const consoleHalfH = displayH * 0.5;
  const consoleCorners = {
    tl: new THREE.Object3D(),
    tr: new THREE.Object3D(),
    bl: new THREE.Object3D(),
    br: new THREE.Object3D()
  };
  consoleCorners.tl.name = "console-corner-tl";
  consoleCorners.tl.position.set(-consoleHalfW, consoleHalfH, 0);
  consoleCorners.tr.name = "console-corner-tr";
  consoleCorners.tr.position.set(consoleHalfW, consoleHalfH, 0);
  consoleCorners.bl.name = "console-corner-bl";
  consoleCorners.bl.position.set(-consoleHalfW, -consoleHalfH, 0);
  consoleCorners.br.name = "console-corner-br";
  consoleCorners.br.position.set(consoleHalfW, -consoleHalfH, 0);
  consoleAnchor.add(consoleCorners.tl);
  consoleAnchor.add(consoleCorners.tr);
  consoleAnchor.add(consoleCorners.bl);
  consoleAnchor.add(consoleCorners.br);
  consoleAnchor.userData.corners = consoleCorners;
  consoleAnchor.userData.aspect = displayW / displayH;

  // --- 5. Flush Aero Roof Pod (replaces the old four-stilt "post sign" carrier) ---
  // Seated directly on roofTopY: low base + sleek shark-fin spine + rear-angled
  // fin housing a recessed LED display. No struts, no floating billboard.
  const podGroup = new THREE.Group();
  podGroup.name = "roof-pod";
  podGroup.position.set(0, roofTopY, 0);
  jellyChassis.add(podGroup);

  const podW = 1.18;
  const podBaseH = 0.075;
  const podBaseGeo = trackGeo(new THREE.BoxGeometry(podW, podBaseH, 1.00));
  const podBase = new THREE.Mesh(podBaseGeo, trimMat);
  podBase.position.set(0, podBaseH * 0.5, -0.22);
  podGroup.add(podBase);

  // Rear fin housing the display face (sleek low-profile aero pod)
  const finH = 0.32;
  const finGeo = trackGeo(new THREE.BoxGeometry(podW, finH, 0.30));
  const fin = new THREE.Mesh(finGeo, isBuggy ? accentMat : bodyMat);
  fin.position.set(0, finH * 0.5, -0.55);
  podGroup.add(fin);

  // Streamlined shark-fin spine: low at the windscreen, rising into the fin
  const spineGeo = trackGeo(new THREE.BoxGeometry(podW * 0.88, 0.035, 0.80));
  const spine = new THREE.Mesh(spineGeo, isBuggy ? bodyMat : trimMat);
  spine.position.set(0, 0.19, -0.06);
  spine.rotation.x = 0.36;
  podGroup.add(spine);

  // Per-car pod detailing so silhouettes stay distinct
  if (isBuggy) {
    // Roll-cage rails bracketing the pod
    const railGeo = trackGeo(new THREE.CylinderGeometry(0.04, 0.04, 0.98, 8));
    railGeo.rotateX(Math.PI / 2);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, accentMat);
      rail.position.set(side * (podW * 0.44), 0.095, -0.18);
      rail.rotation.x = 0.16;
      podGroup.add(rail);
    }
  } else if (isHyper) {
    // Low-slung aero lip + cyan edge strakes
    const lipGeo = trackGeo(new THREE.BoxGeometry(podW * 1.04, 0.025, 0.86));
    const lip = new THREE.Mesh(lipGeo, accentMat);
    lip.position.set(0, 0.10, -0.24);
    podGroup.add(lip);
    const strakeGeo = trackGeo(new THREE.BoxGeometry(0.02, 0.06, 0.62));
    for (const side of [-1, 1]) {
      const strake = new THREE.Mesh(strakeGeo, accentMat);
      strake.position.set(side * (podW * 0.5 + 0.01), 0.13, -0.28);
      podGroup.add(strake);
    }
  } else if (isTofu) {
    // Panda accent cap along the spine
    const spineCapGeo = trackGeo(new THREE.BoxGeometry(podW * 0.42, 0.03, 0.74));
    const spineCap = new THREE.Mesh(spineCapGeo, accentMat);
    spineCap.position.set(0, 0.195, -0.06);
    spineCap.rotation.x = 0.36;
    podGroup.add(spineCap);
  } else {
    // Jelly GT racing stripe along the pod spine
    const podStripeGeo = trackGeo(new THREE.BoxGeometry(0.20, 0.03, 0.74));
    const podStripe = new THREE.Mesh(podStripeGeo, accentMat);
    podStripe.position.set(0, 0.195, -0.06);
    podStripe.rotation.x = 0.36;
    podGroup.add(podStripe);
  }

  // Rear-angled recessed LED display face
  const roofDisplayW = 0.96;
  const roofDisplayH = 0.30;
  const faceH = 0.31;
  const faceW = 1.02;
  const faceCenterY = 0.165;
  const faceCenterZ = -0.72;

  const faceGroup = new THREE.Group();
  faceGroup.name = "roof-pod-face";
  faceGroup.position.set(0, faceCenterY, faceCenterZ);
  faceGroup.lookAt(0, faceCenterY + 0.12, faceCenterZ - 1.0);
  podGroup.add(faceGroup);

  // Recessed display housing: four bezel bars around an inset screen cavity
  const frameDepth = 0.03;
  const frameInset = 0.005;
  const sideBarW = (faceW - roofDisplayW) * 0.5;
  const topBarH = (faceH - roofDisplayH) * 0.5;

  const topBarGeo = trackGeo(new THREE.BoxGeometry(faceW, topBarH, frameDepth));
  const topBar = new THREE.Mesh(topBarGeo, trimMat);
  topBar.position.set(0, (faceH - topBarH) * 0.5, frameInset);
  faceGroup.add(topBar);

  const bottomBar = new THREE.Mesh(topBarGeo, trimMat);
  bottomBar.position.set(0, -(faceH - topBarH) * 0.5, frameInset);
  faceGroup.add(bottomBar);

  const sideBarGeo = trackGeo(new THREE.BoxGeometry(sideBarW, roofDisplayH, frameDepth));
  for (const side of [-1, 1]) {
    const sideBar = new THREE.Mesh(sideBarGeo, trimMat);
    sideBar.position.set(side * (faceW - sideBarW) * 0.5, 0, frameInset);
    faceGroup.add(sideBar);
  }

  // Cavity floor behind the screen
  const cavityFloorGeo = trackGeo(new THREE.BoxGeometry(faceW, faceH, 0.01));
  const cavityFloor = new THREE.Mesh(cavityFloorGeo, trimMat);
  cavityFloor.position.set(0, 0, frameInset - frameDepth);
  faceGroup.add(cavityFloor);

  const podScreenMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0x05080f, side: THREE.FrontSide })
  );
  const podScreenGeo = trackGeo(new THREE.PlaneGeometry(roofDisplayW, roofDisplayH));
  const podScreen = new THREE.Mesh(podScreenGeo, podScreenMat);
  podScreen.position.set(0, 0, 0.006);
  faceGroup.add(podScreen);

  // Slim self-lit LED status bar above the display (per-car accent color)
  const podLedGeo = trackGeo(new THREE.BoxGeometry(roofDisplayW * 0.98, 0.014, 0.012));
  const podLed = new THREE.Mesh(podLedGeo, roofLightMat);
  podLed.position.set(0, (faceH - topBarH) * 0.5, frameInset + frameDepth * 0.5);
  faceGroup.add(podLed);

  // Overhanging bezel brow turns the display into recessed hardware
  const podBrowGeo = trackGeo(new THREE.BoxGeometry(faceW * 1.02, 0.04, 0.09));
  const podBrow = new THREE.Mesh(podBrowGeo, trimMat);
  podBrow.position.set(0, faceH * 0.5 + 0.010, 0.012);
  podBrow.rotation.x = 0.26;
  faceGroup.add(podBrow);

  const roofAnchor = new THREE.Object3D();
  roofAnchor.name = "roof-anchor";
  roofAnchor.position.set(0, 0, 0.008);
  faceGroup.add(roofAnchor);

  // Frozen contract: corner children in rear-chase-view orientation.
  // Local +Z points out of the display toward the chase camera, +X is the
  // viewer's screen-right (rear camera right = car -X), +Y is screen-up.
  const roofHalfW = roofDisplayW * 0.5;
  const roofHalfH = roofDisplayH * 0.5;
  const roofCorners = {
    tl: new THREE.Object3D(),
    tr: new THREE.Object3D(),
    bl: new THREE.Object3D(),
    br: new THREE.Object3D()
  };
  roofCorners.tl.name = "roof-corner-tl";
  roofCorners.tl.position.set(-roofHalfW, roofHalfH, 0);
  roofCorners.tr.name = "roof-corner-tr";
  roofCorners.tr.position.set(roofHalfW, roofHalfH, 0);
  roofCorners.bl.name = "roof-corner-bl";
  roofCorners.bl.position.set(-roofHalfW, -roofHalfH, 0);
  roofCorners.br.name = "roof-corner-br";
  roofCorners.br.position.set(roofHalfW, -roofHalfH, 0);
  roofAnchor.add(roofCorners.tl);
  roofAnchor.add(roofCorners.tr);
  roofAnchor.add(roofCorners.bl);
  roofAnchor.add(roofCorners.br);
  roofAnchor.userData.corners = roofCorners;
  roofAnchor.userData.aspect = roofDisplayW / roofDisplayH;

  // Camera anchors on jellyChassis
  const driverEyeAnchor = new THREE.Object3D();
  driverEyeAnchor.name = "driver-eye-anchor";
  driverEyeAnchor.position.set(-0.25, eyeY, 0.12);
  jellyChassis.add(driverEyeAnchor);

  // Frozen contract: rigid driver eye frame & look target on carRoot (not jellyChassis) so the
  // DRIVER camera never bounces or aims into the roof ceiling during accel squat / braking dive.
  const driverEyeRootAnchor = new THREE.Object3D();
  driverEyeRootAnchor.name = "driver-eye-root-anchor";
  driverEyeRootAnchor.position.set(-0.22, eyeY, eyeZ);
  carRoot.add(driverEyeRootAnchor);

  const driverLookTarget = new THREE.Object3D();
  driverLookTarget.name = "driver-look-target";
  driverLookTarget.position.set(-0.12, eyeY - 0.09, 14.0);
  carRoot.add(driverLookTarget);

  const hoodAnchor = new THREE.Object3D();
  hoodAnchor.name = "hood-anchor";
  hoodAnchor.position.set(0, hoodTopY + 0.36, 0.95);
  jellyChassis.add(hoodAnchor);

  // --- 6. 4 Articulated Wheels Parented Directly to carRoot (NOT squashed by jellyChassis!) ---
  const wheelWidth = isBuggy ? 0.34 : 0.28;
  const frontWheelZ = def.wheelBase * 0.5;
  const rearWheelZ = -def.wheelBase * 0.5;
  const trackHalfW = w * 0.5 - 0.08;

  const frontLeftSteer = new THREE.Group();
  frontLeftSteer.name = "frontLeftSteer";
  frontLeftSteer.position.set(trackHalfW, rWheel, frontWheelZ);
  carRoot.add(frontLeftSteer);
  const frontLeftSpin = makeWheelAssembly(rWheel, wheelWidth, def.accent, trackGeo, trackMat);
  frontLeftSteer.add(frontLeftSpin);

  const frontRightSteer = new THREE.Group();
  frontRightSteer.name = "frontRightSteer";
  frontRightSteer.position.set(-trackHalfW, rWheel, frontWheelZ);
  carRoot.add(frontRightSteer);
  const frontRightSpin = makeWheelAssembly(rWheel, wheelWidth, def.accent, trackGeo, trackMat);
  frontRightSteer.add(frontRightSpin);

  const rearLeftSpin = makeWheelAssembly(rWheel, wheelWidth * 1.08, def.accent, trackGeo, trackMat);
  rearLeftSpin.position.set(trackHalfW, rWheel, rearWheelZ);
  carRoot.add(rearLeftSpin);

  const rearRightSpin = makeWheelAssembly(rWheel, wheelWidth * 1.08, def.accent, trackGeo, trackMat);
  rearRightSpin.position.set(-trackHalfW, rWheel, rearWheelZ);
  carRoot.add(rearRightSpin);

  // Grounded radial contact shadow directly on carRoot
  const shadowTex = makeContactShadowTexture(THREE);
  if (shadowTex) disposables.push(shadowTex);
  const contactShadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      map: shadowTex,
      transparent: true,
      opacity: shadowTex ? 0.55 : 0.30,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1
    })
  );
  const contactShadow = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(w * 1.16, len * 1.08)).rotateX(-Math.PI / 2),
    contactShadowMat
  );
  contactShadow.position.y = 0.03;
  contactShadow.name = "car-contact-shadow";
  carRoot.add(contactShadow);

  // Brake calipers + castShadow on exterior body/cabin meshes
  const caliperMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35, metalness: 0.5 }));
  const caliperGeo = trackGeo(new THREE.BoxGeometry(0.08, rWheel * 0.42, rWheel * 0.32));
  for (const stGroup of [frontLeftSteer, frontRightSteer]) {
    const cal = new THREE.Mesh(caliperGeo, caliperMat);
    cal.position.set(0, 0.04, -rWheel * 0.24);
    stGroup.add(cal);
  }
  body.traverse((obj) => {
    if (obj.isMesh && !brakeGlows.includes(obj) && !headlightBeams.includes(obj)) obj.castShadow = true;
  });
  cabin.traverse((obj) => {
    if (obj.isMesh && obj !== windshield && obj !== rearWindow && obj.material !== glassMat && obj.material !== rearGlassMat) {
      obj.castShadow = true;
    }
  });

  const wheels = {
    frontLeftSteer,
    frontRightSteer,
    frontLeftSpin,
    frontRightSpin,
    rearLeftSpin,
    rearRightSpin,
    all: [frontLeftSpin, frontRightSpin, rearLeftSpin, rearRightSpin]
  };

  function updateVisuals({
    steerInput = 0,
    wheelSpin = 0,
    cameraMode = "CHASE",
    braking = false,
    rpmNorm = 0.2,
    nightMode = null
  } = {}) {
    const steerClamped = Number.isFinite(steerInput)
      ? Math.max(-1, Math.min(1, steerInput))
      : 0;
    const spinDelta = Number.isFinite(wheelSpin) ? wheelSpin : 0;

    frontLeftSteer.rotation.y = steerClamped * 0.45;
    frontRightSteer.rotation.y = steerClamped * 0.45;

    for (let i = 0; i < wheels.all.length; i++) {
      wheels.all[i].rotation.x += spinDelta;
    }

    steerWheel.rotation.z = -steerClamped * 1.15;

    if (driverHead) {
      driverHead.visible = cameraMode !== "DRIVER";
    }

    const isBraking = !!braking;
    tailLightMat.emissiveIntensity = isBraking ? 2.6 : 0.6;
    brakeGlowMat.opacity = isBraking ? 0.55 : 0.0;
    for (let i = 0; i < brakeGlows.length; i++) {
      brakeGlows[i].visible = isBraking;
    }

    if (nightMode !== null) {
      for (let i = 0; i < headlightBeams.length; i++) {
        headlightBeams[i].visible = !!nightMode;
      }
    }

    const rNorm = Number.isFinite(rpmNorm) ? Math.max(0.06, Math.min(1, rpmNorm)) : 0.2;
    rpmBarMesh.scale.x = rNorm;
    rpmBarMesh.position.x = -0.25 + 0.13 * (1 - rNorm);
    if (rNorm >= 0.85) {
      rpmBarMat.color.setHex(0xff2b48);
    } else if (rNorm >= 0.62) {
      rpmBarMat.color.setHex(0xf3db5b);
    } else {
      rpmBarMat.color.setHex(0x22c55e);
    }
  }

  let labelSprite = null;
  let labelTex = null;
  let labelMat = null;
  let lastLabelText = "";

  function setLabel(name, accentColor = "#38BDF8") {
    const clean = typeof name === "string" ? name.trim().slice(0, 18) : "";
    if (!clean) {
      if (labelSprite) labelSprite.visible = false;
      lastLabelText = "";
      return;
    }
    if (clean === lastLabelText && labelSprite) {
      labelSprite.visible = true;
      return;
    }
    if (typeof document === "undefined" || typeof document.createElement !== "function") return;
    lastLabelText = clean;

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = "rgba(12, 17, 25, 0.84)";
    ctx.strokeStyle = accentColor || "#38BDF8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(8, 8, 240, 48, 14);
    } else {
      ctx.rect(8, 8, 240, 48);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#F8FAFC";
    ctx.font = "bold 24px 'Space Grotesk', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(clean, 128, 33);

    if (labelTex) {
      try {
        labelTex.dispose();
      } catch (_) {}
    }
    labelTex = new THREE.CanvasTexture(canvas);
    labelTex.needsUpdate = true;

    if (!labelMat) {
      labelMat = trackMat(
        new THREE.SpriteMaterial({
          map: labelTex,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        })
      );
      labelSprite = new THREE.Sprite(labelMat);
      labelSprite.name = "mp-nametag";
      labelSprite.position.set(0, roofTopY + 0.44, 0);
      labelSprite.scale.set(1.9, 0.48, 1);
      labelSprite.renderOrder = 10;
      carRoot.add(labelSprite);
    } else {
      labelMat.map = labelTex;
      labelMat.needsUpdate = true;
    }
    labelSprite.visible = true;
  }

  let ghostActive = false;
  function setGhostMode(enabled) {
    const next = !!enabled;
    if (next === ghostActive) return;
    ghostActive = next;
    const opacity = next ? 0.56 : 1.0;
    for (const m of [bodyMat, accentMat, trimMat]) {
      m.transparent = next;
      m.opacity = opacity;
      m.needsUpdate = true;
    }
  }

  function dispose() {
    if (labelTex) {
      try {
        labelTex.dispose();
      } catch (_) {}
      labelTex = null;
    }
    if (carRoot.parent) {
      carRoot.parent.remove(carRoot);
    }
    for (let i = 0; i < disposables.length; i++) {
      const d = disposables[i];
      if (d && typeof d.dispose === "function") {
        try {
          d.dispose();
        } catch (_) {
          // ignore
        }
      }
    }
  }

  if (options && options.cameraMode) {
    updateVisuals({ cameraMode: options.cameraMode });
  }

  return {
    def,
    carRoot,
    jellyChassis,
    group: carRoot,
    body,
    cabin,
    wheels,
    steerWheel,
    driverHead,
    dashCowl,
    consoleStack,
    consoleBezel,
    roofAnchor,
    consoleAnchor,
    roofPod: podGroup,
    driverEyeAnchor,
    driverEyeRootAnchor,
    driverLookTarget,
    hoodAnchor,
    updateVisuals,
    setLabel,
    setGhostMode,
    dispose
  };
}
