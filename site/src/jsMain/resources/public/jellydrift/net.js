// Jelly Drift 3D — Multiplayer Client (Firebase RTDB Signaling + WebRTC Mesh P2P)
// Lazy-loads Firebase ESM SDK in the browser so Node syntax checks and offline play work seamlessly.

import { FIREBASE_CONFIG } from "./firebase_config.js";

const FIREBASE_SDK_VER = "11.4.0";
const CALLSIGN_KEY = "jellydrift_callsign_v1";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const P2P_INTERVAL_MS = 40;   // 25 Hz over WebRTC DataChannels
const RELAY_INTERVAL_MS = 85; // 12 Hz fallback over Firebase RTDB

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function sanitizeCallsign(raw) {
  const cleaned = String(raw || "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 16);
  return cleaned;
}

function loadCallsign() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = sanitizeCallsign(window.localStorage.getItem(CALLSIGN_KEY));
      if (saved) return saved;
    }
  } catch (_) {
    /* ignore */
  }
  const num = 10 + Math.floor(Math.random() * 89);
  return `Racer ${num}`;
}

function saveCallsign(name) {
  try {
    if (typeof window !== "undefined" && window.localStorage && name) {
      window.localStorage.setItem(CALLSIGN_KEY, name);
    }
  } catch (_) {
    /* ignore */
  }
}

function generateRoomCode() {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function normalizeRoomCode(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export function createMultiplayerClient(callbacks = {}) {
  const onStateChange = typeof callbacks.onStateChange === "function" ? callbacks.onStateChange : () => {};
  const onRemoteTelemetry =
    typeof callbacks.onRemoteTelemetry === "function" ? callbacks.onRemoteTelemetry : () => {};

  let fb = null; // { app, auth, db, mods: { authMod, dbMod } }
  let fbPromise = null;
  let serverOffsetMs = 0;
  let offsetUnsub = null;

  let myUid = null;
  let callsign = loadCallsign();

  let roomCode = null;
  let roomMeta = null;
  let playersMap = {};
  let isPublicRoom = false;
  let roomUnsubs = [];
  let matchmakingHeartbeatTimer = null;

  // peerUid -> { pc, dc, status: 'connecting'|'p2p'|'relay', pendingIce: [], remoteDescSet: false, seenOfferSdp: null, seenAnswerSdp: null, seenCandKeys: Set }
  const peers = new Map();

  let open = false;
  let connecting = false;
  let statusText = "";
  let errorText = "";

  let lastP2pSendMs = 0;
  let lastRelaySendMs = 0;
  let lastRelayTelemetrySeq = new Map(); // uid -> last t

  function serverNow() {
    return Date.now() + serverOffsetMs;
  }

  function hasValidConfig() {
    return !!(
      FIREBASE_CONFIG &&
      typeof FIREBASE_CONFIG.apiKey === "string" &&
      FIREBASE_CONFIG.apiKey.length > 5 &&
      typeof FIREBASE_CONFIG.databaseURL === "string" &&
      FIREBASE_CONFIG.databaseURL.startsWith("https://")
    );
  }

  async function ensureFirebase() {
    if (fb) return fb;
    if (fbPromise) return fbPromise;

    fbPromise = (async () => {
      if (!hasValidConfig()) {
        throw new Error("Firebase multiplayer config is not set up yet.");
      }
      const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VER}`;
      const [appMod, authMod, dbMod] = await Promise.all([
        import(/* webpackIgnore: true */ `${base}/firebase-app.js`),
        import(/* webpackIgnore: true */ `${base}/firebase-auth.js`),
        import(/* webpackIgnore: true */ `${base}/firebase-database.js`),
      ]);

      const existing = typeof appMod.getApps === "function" ? appMod.getApps() : [];
      const app = existing.length > 0 ? existing[0] : appMod.initializeApp(FIREBASE_CONFIG);
      const auth = authMod.getAuth(app);
      const db = dbMod.getDatabase(app);

      // Sign in anonymously if not already signed in
      const user = await new Promise((resolve, reject) => {
        let settled = false;
        const unsub = authMod.onAuthStateChanged(
          auth,
          (u) => {
            if (settled) return;
            if (u) {
              settled = true;
              unsub();
              resolve(u);
            } else {
              authMod
                .signInAnonymously(auth)
                .then((cred) => {
                  if (!settled) {
                    settled = true;
                    unsub();
                    resolve(cred.user);
                  }
                })
                .catch((err) => {
                  if (!settled) {
                    settled = true;
                    unsub();
                    reject(err);
                  }
                });
            }
          },
          (err) => {
            if (!settled) {
              settled = true;
              unsub();
              reject(err);
            }
          }
        );
      });

      myUid = user.uid;

      // Sync clock offset with Firebase RTDB server
      try {
        const offsetRef = dbMod.ref(db, ".info/serverTimeOffset");
        offsetUnsub = dbMod.onValue(offsetRef, (snap) => {
          const val = snap.val();
          if (typeof val === "number" && Number.isFinite(val)) {
            serverOffsetMs = val;
          }
        });
      } catch (_) {
        /* ignore offset listener issues */
      }

      fb = { app, auth, db, appMod, authMod, dbMod };
      return fb;
    })().catch((err) => {
      fbPromise = null;
      throw err;
    });

    return fbPromise;
  }

  function overallTransport() {
    if (!roomCode) return "offline";
    const remoteUids = Object.keys(playersMap).filter((u) => u !== myUid);
    if (remoteUids.length === 0) return "ready";
    let anyRelay = false;
    let allP2p = true;
    for (const u of remoteUids) {
      const p = peers.get(u);
      if (!p || p.status !== "p2p") {
        allP2p = false;
        anyRelay = true;
      }
    }
    if (allP2p) return "p2p";
    if (anyRelay) return "relay";
    return "connecting";
  }

  function buildPublicState() {
    const hostUid = roomMeta ? roomMeta.hostUid : null;
    const isHost = !!(myUid && hostUid && myUid === hostUid);
    const list = Object.values(playersMap || {})
      .filter((p) => p && p.uid)
      .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99))
      .map((p) => {
        const peer = peers.get(p.uid);
        const transport =
          p.uid === myUid ? "local" : peer && peer.status === "p2p" ? "p2p" : "relay";
        return {
          uid: p.uid,
          name: p.name || "Racer",
          carId: p.carId || "jelly_gt",
          slot: typeof p.slot === "number" ? p.slot : 0,
          ready: !!p.ready,
          isHost: p.uid === hostUid,
          isMe: p.uid === myUid,
          transport,
          finishedAtMs: typeof p.finishedAtMs === "number" ? p.finishedAtMs : 0,
          driftScore: typeof p.driftScore === "number" ? p.driftScore : 0,
          bestLapSec: typeof p.bestLapSec === "number" ? p.bestLapSec : 0,
        };
      });

    return {
      open,
      inRoom: !!roomCode,
      connected: !!roomCode,
      connecting,
      statusText,
      errorText,
      roomCode: roomCode || "",
      isHost,
      isPublic: isPublicRoom,
      collisions: !!(roomMeta && roomMeta.collisions),
      roomStatus: (roomMeta && roomMeta.status) || "LOBBY",
      trackId: (roomMeta && roomMeta.trackId) || "sunny_coast",
      mode: (roomMeta && roomMeta.mode) || "GRAND_PRIX",
      totalLaps: (roomMeta && roomMeta.totalLaps) || 3,
      raceSeq: (roomMeta && roomMeta.raceSeq) || 0,
      startAtMs: (roomMeta && roomMeta.startAtMs) || 0,
      myUid: myUid || "",
      callsign,
      transport: overallTransport(),
      players: list,
    };
  }

  function emitState() {
    try {
      onStateChange(buildPublicState());
    } catch (_) {
      /* ignore UI callback errors */
    }
  }

  function closePeer(peerUid) {
    const entry = peers.get(peerUid);
    if (!entry) return;
    try {
      if (entry.dc) entry.dc.close();
    } catch (_) {
      /* ignore */
    }
    try {
      if (entry.pc) entry.pc.close();
    } catch (_) {
      /* ignore */
    }
    peers.delete(peerUid);
  }

  function closeAllPeers() {
    for (const uid of Array.from(peers.keys())) {
      closePeer(uid);
    }
    lastRelayTelemetrySeq.clear();
  }

  function attachDataChannel(peerUid, entry, dc) {
    entry.dc = dc;
    dc.onopen = () => {
      entry.status = "p2p";
      emitState();
    };
    dc.onclose = () => {
      if (entry.dc === dc) {
        entry.status = "relay";
        emitState();
      }
    };
    dc.onerror = () => {
      if (entry.dc === dc) {
        entry.status = "relay";
        emitState();
      }
    };
    dc.onmessage = (evt) => {
      try {
        const pkt = typeof evt.data === "string" ? JSON.parse(evt.data) : null;
        if (pkt && typeof pkt.x === "number") {
          onRemoteTelemetry(peerUid, pkt, "p2p");
        }
      } catch (_) {
        /* ignore malformed packet */
      }
    };
  }

  function ensurePeerConnection(peerUid) {
    if (!fb || !roomCode || !myUid || peerUid === myUid) return null;
    if (peers.has(peerUid)) return peers.get(peerUid);
    if (typeof RTCPeerConnection === "undefined") {
      const relayOnly = {
        pc: null,
        dc: null,
        status: "relay",
        pendingIce: [],
        remoteDescSet: false,
        seenOfferSdp: null,
        seenAnswerSdp: null,
        seenCandKeys: new Set(),
      };
      peers.set(peerUid, relayOnly);
      return relayOnly;
    }

    const { db, dbMod } = fb;
    const isInitiator = myUid < peerUid;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    const entry = {
      pc,
      dc: null,
      status: "relay",
      pendingIce: [],
      remoteDescSet: false,
      seenOfferSdp: null,
      seenAnswerSdp: null,
      seenCandKeys: new Set(),
    };
    peers.set(peerUid, entry);

    pc.onicecandidate = (evt) => {
      if (!evt.candidate || !roomCode || !fb) return;
      const candRef = dbMod.ref(
        db,
        `jellydrift/rooms/${roomCode}/signals/${peerUid}/${myUid}/candidates`
      );
      dbMod.push(candRef, evt.candidate.toJSON()).catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      if (!peers.has(peerUid)) return;
      const st = pc.connectionState;
      if (st === "failed" || st === "disconnected" || st === "closed") {
        entry.status = "relay";
        emitState();
      }
    };

    pc.ondatachannel = (evt) => {
      if (evt.channel) {
        attachDataChannel(peerUid, entry, evt.channel);
      }
    };

    if (isInitiator) {
      try {
        const dc = pc.createDataChannel("jd-telemetry", {
          ordered: false,
          maxRetransmits: 0,
        });
        attachDataChannel(peerUid, entry, dc);
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer).then(() => offer))
          .then((offer) => {
            if (!roomCode || !peers.has(peerUid)) return;
            return dbMod.set(
              dbMod.ref(db, `jellydrift/rooms/${roomCode}/signals/${peerUid}/${myUid}/offer`),
              { type: offer.type, sdp: offer.sdp, ts: Date.now() }
            );
          })
          .catch(() => {});
      } catch (_) {
        /* fallback remains relay */
      }
    }

    return entry;
  }

  async function handleSignalSnapshot(sigMap) {
    if (!fb || !roomCode || !myUid || !sigMap) return;
    const { db, dbMod } = fb;

    for (const [fromUid, payload] of Object.entries(sigMap)) {
      if (!fromUid || fromUid === myUid || !playersMap[fromUid] || !payload) continue;
      const entry = ensurePeerConnection(fromUid);
      if (!entry || !entry.pc) continue;
      const pc = entry.pc;

      // Incoming offer (for responder: myUid > fromUid)
      if (payload.offer && payload.offer.sdp && payload.offer.sdp !== entry.seenOfferSdp) {
        entry.seenOfferSdp = payload.offer.sdp;
        try {
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: payload.offer.type, sdp: payload.offer.sdp })
          );
          entry.remoteDescSet = true;
          for (const c of entry.pendingIce) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          entry.pendingIce = [];
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await dbMod.set(
            dbMod.ref(db, `jellydrift/rooms/${roomCode}/signals/${fromUid}/${myUid}/answer`),
            { type: answer.type, sdp: answer.sdp, ts: Date.now() }
          );
        } catch (_) {
          /* ignore signaling race */
        }
      }

      // Incoming answer (for initiator: myUid < fromUid)
      if (payload.answer && payload.answer.sdp && payload.answer.sdp !== entry.seenAnswerSdp) {
        entry.seenAnswerSdp = payload.answer.sdp;
        try {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(
              new RTCSessionDescription({ type: payload.answer.type, sdp: payload.answer.sdp })
            );
            entry.remoteDescSet = true;
            for (const c of entry.pendingIce) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            entry.pendingIce = [];
          }
        } catch (_) {
          /* ignore */
        }
      }

      // Incoming ICE candidates
      if (payload.candidates && typeof payload.candidates === "object") {
        for (const [ckey, cand] of Object.entries(payload.candidates)) {
          if (entry.seenCandKeys.has(ckey) || !cand) continue;
          entry.seenCandKeys.add(ckey);
          if (entry.remoteDescSet) {
            pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          } else {
            entry.pendingIce.push(cand);
          }
        }
      }
    }
  }

  function syncPeersWithPlayers() {
    if (!roomCode || !myUid) return;
    const remoteUids = new Set(Object.keys(playersMap).filter((u) => u !== myUid));
    for (const existingUid of Array.from(peers.keys())) {
      if (!remoteUids.has(existingUid)) {
        closePeer(existingUid);
      }
    }
    for (const remoteUid of remoteUids) {
      ensurePeerConnection(remoteUid);
    }
  }

  async function maybeMigrateHost() {
    if (!fb || !roomCode || !roomMeta || !myUid) return;
    const currentHost = roomMeta.hostUid;
    if (currentHost && playersMap[currentHost]) return;

    const remaining = Object.values(playersMap)
      .filter((p) => p && p.uid)
      .sort((a, b) => {
        const ja = typeof a.joinedAt === "number" ? a.joinedAt : Number.MAX_SAFE_INTEGER;
        const jb = typeof b.joinedAt === "number" ? b.joinedAt : Number.MAX_SAFE_INTEGER;
        if (ja !== jb) return ja - jb;
        return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
      });

    if (remaining.length > 0 && remaining[0].uid === myUid) {
      const { db, dbMod } = fb;
      try {
        await dbMod.update(dbMod.ref(db, `jellydrift/rooms/${roomCode}/meta`), {
          hostUid: myUid,
        });
        if (isPublicRoom) {
          const mmRef = dbMod.ref(db, `jellydrift/matchmaking/${roomCode}`);
          await dbMod.set(mmRef, {
            roomCode,
            hostUid: myUid,
            status: roomMeta.status === "LOBBY" ? "OPEN" : "RACING",
            trackId: roomMeta.trackId || "sunny_coast",
            mode: roomMeta.mode || "GRAND_PRIX",
            playerCount: remaining.length,
            updatedAt: dbMod.serverTimestamp(),
          });
          dbMod.onDisconnect(mmRef).remove().catch(() => {});
        }
      } catch (_) {
        /* ignore concurrent migration */
      }
    }
  }

  function syncPublicListing() {
    if (!fb || !roomCode || !roomMeta || !isPublicRoom || roomMeta.hostUid !== myUid) return;
    const { db, dbMod } = fb;
    const count = clamp(Object.keys(playersMap).length, 1, 4);
    const mmRef = dbMod.ref(db, `jellydrift/matchmaking/${roomCode}`);
    dbMod
      .set(mmRef, {
        roomCode,
        hostUid: myUid,
        status: roomMeta.status === "LOBBY" ? "OPEN" : "RACING",
        trackId: roomMeta.trackId || "sunny_coast",
        mode: roomMeta.mode || "GRAND_PRIX",
        playerCount: count,
        updatedAt: dbMod.serverTimestamp(),
      })
      .catch(() => {});
  }

  function subscribeToRoom(code) {
    const { db, dbMod } = fb;
    for (const u of roomUnsubs) {
      try {
        u();
      } catch (_) {
        /* ignore */
      }
    }
    roomUnsubs = [];

    const metaRef = dbMod.ref(db, `jellydrift/rooms/${code}/meta`);
    const playersRef = dbMod.ref(db, `jellydrift/rooms/${code}/players`);
    const telemetryRef = dbMod.ref(db, `jellydrift/rooms/${code}/telemetry`);
    const signalsRef = dbMod.ref(db, `jellydrift/rooms/${code}/signals/${myUid}`);

    roomUnsubs.push(
      dbMod.onValue(metaRef, (snap) => {
        const val = snap.val();
        if (!val) {
          // Room deleted externally
          cleanupRoomLocal();
          errorText = "Room closed.";
          emitState();
          return;
        }
        roomMeta = val;
        isPublicRoom = !!val.isPublic;
        maybeMigrateHost();
        emitState();
      })
    );

    roomUnsubs.push(
      dbMod.onValue(playersRef, (snap) => {
        playersMap = snap.val() || {};
        syncPeersWithPlayers();
        maybeMigrateHost();
        syncPublicListing();
        emitState();
      })
    );

    roomUnsubs.push(
      dbMod.onValue(telemetryRef, (snap) => {
        const allTel = snap.val();
        if (!allTel || typeof allTel !== "object") return;
        for (const [uid, pkt] of Object.entries(allTel)) {
          if (!uid || uid === myUid || !pkt || typeof pkt.x !== "number") continue;
          const peer = peers.get(uid);
          // Prefer WebRTC P2P when open; only ingest relay packet if peer is not on P2P
          if (peer && peer.status === "p2p") continue;
          const prevT = lastRelayTelemetrySeq.get(uid) || 0;
          if (typeof pkt.t === "number" && pkt.t <= prevT) continue;
          if (typeof pkt.t === "number") lastRelayTelemetrySeq.set(uid, pkt.t);
          onRemoteTelemetry(uid, pkt, "relay");
        }
      })
    );

    roomUnsubs.push(
      dbMod.onValue(signalsRef, (snap) => {
        const val = snap.val();
        if (val) handleSignalSnapshot(val);
      })
    );

    if (matchmakingHeartbeatTimer) clearInterval(matchmakingHeartbeatTimer);
    matchmakingHeartbeatTimer = setInterval(() => {
      syncPublicListing();
    }, 15000);
  }

  function cleanupRoomLocal() {
    for (const u of roomUnsubs) {
      try {
        u();
      } catch (_) {
        /* ignore */
      }
    }
    roomUnsubs = [];
    if (matchmakingHeartbeatTimer) {
      clearInterval(matchmakingHeartbeatTimer);
      matchmakingHeartbeatTimer = null;
    }
    closeAllPeers();
    roomCode = null;
    roomMeta = null;
    playersMap = {};
    isPublicRoom = false;
  }

  async function leaveRoom() {
    const prevCode = roomCode;
    const wasHost = !!(roomMeta && roomMeta.hostUid === myUid);
    const wasPublic = isPublicRoom;
    const otherCount = Object.keys(playersMap).filter((u) => u !== myUid).length;

    cleanupRoomLocal();
    statusText = "";
    errorText = "";
    emitState();

    if (fb && prevCode && myUid) {
      const { db, dbMod } = fb;
      try {
        await Promise.allSettled([
          dbMod.remove(dbMod.ref(db, `jellydrift/rooms/${prevCode}/players/${myUid}`)),
          dbMod.remove(dbMod.ref(db, `jellydrift/rooms/${prevCode}/telemetry/${myUid}`)),
          dbMod.remove(dbMod.ref(db, `jellydrift/rooms/${prevCode}/signals/${myUid}`)),
        ]);
        if (wasHost && otherCount === 0) {
          if (wasPublic) {
            await dbMod.remove(dbMod.ref(db, `jellydrift/matchmaking/${prevCode}`)).catch(() => {});
          }
          await dbMod.remove(dbMod.ref(db, `jellydrift/rooms/${prevCode}/meta`)).catch(() => {});
        }
      } catch (_) {
        /* ignore */
      }
    }
  }

  async function createRoom(opts = {}) {
    if (connecting) return null;
    connecting = true;
    errorText = "";
    statusText = opts.isPublic ? "Creating public lobby..." : "Creating private room...";
    emitState();

    try {
      await ensureFirebase();
      if (roomCode) await leaveRoom();
      const { db, dbMod } = fb;

      let chosenCode = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const candidate = generateRoomCode();
        const snap = await dbMod.get(dbMod.ref(db, `jellydrift/rooms/${candidate}/meta`));
        if (!snap.exists()) {
          chosenCode = candidate;
          break;
        }
      }
      if (!chosenCode) throw new Error("Could not allocate room code. Please try again.");

      const trackId = typeof opts.trackId === "string" ? opts.trackId : "sunny_coast";
      const mode = opts.mode === "DRIFT_RUSH" ? "DRIFT_RUSH" : "GRAND_PRIX";
      const carId = typeof opts.carId === "string" ? opts.carId : "jelly_gt";
      const collisions = !!opts.collisions;
      const isPublic = !!opts.isPublic;

      const metaData = {
        hostUid: myUid,
        trackId,
        mode,
        status: "LOBBY",
        collisions,
        isPublic,
        totalLaps: 3,
        raceSeq: 0,
        startAtMs: 0,
        createdAt: dbMod.serverTimestamp(),
      };

      const playerData = {
        uid: myUid,
        name: callsign || "Racer",
        carId,
        slot: 0,
        ready: true,
        joinedAt: dbMod.serverTimestamp(),
        finishedAtMs: 0,
        driftScore: 0,
        bestLapSec: 0,
      };

      const playerRef = dbMod.ref(db, `jellydrift/rooms/${chosenCode}/players/${myUid}`);
      const telRef = dbMod.ref(db, `jellydrift/rooms/${chosenCode}/telemetry/${myUid}`);

      await dbMod.set(dbMod.ref(db, `jellydrift/rooms/${chosenCode}/meta`), metaData);
      await dbMod.set(playerRef, playerData);
      await dbMod.onDisconnect(playerRef).remove();
      await dbMod.onDisconnect(telRef).remove();

      if (isPublic) {
        const mmRef = dbMod.ref(db, `jellydrift/matchmaking/${chosenCode}`);
        await dbMod.set(mmRef, {
          roomCode: chosenCode,
          hostUid: myUid,
          status: "OPEN",
          trackId,
          mode,
          playerCount: 1,
          updatedAt: dbMod.serverTimestamp(),
        });
        await dbMod.onDisconnect(mmRef).remove();
      }

      roomCode = chosenCode;
      roomMeta = metaData;
      playersMap = { [myUid]: playerData };
      isPublicRoom = isPublic;
      open = true;
      connecting = false;
      statusText = `Room ${chosenCode} ready`;
      subscribeToRoom(chosenCode);
      emitState();
      return chosenCode;
    } catch (err) {
      connecting = false;
      statusText = "";
      errorText = (err && err.message) || "Failed to create room.";
      emitState();
      return null;
    }
  }

  async function joinRoom(rawCode, opts = {}) {
    if (connecting) return false;
    const code = normalizeRoomCode(rawCode);
    if (code.length < 4) {
      errorText = "Enter a valid 4-character room code.";
      emitState();
      return false;
    }

    connecting = true;
    errorText = "";
    statusText = `Joining room ${code}...`;
    emitState();

    try {
      await ensureFirebase();
      if (roomCode && roomCode !== code) await leaveRoom();
      const { db, dbMod } = fb;

      const metaSnap = await dbMod.get(dbMod.ref(db, `jellydrift/rooms/${code}/meta`));
      if (!metaSnap.exists()) {
        throw new Error(`Room ${code} was not found.`);
      }
      const meta = metaSnap.val();
      if (meta.status && meta.status !== "LOBBY") {
        throw new Error(`Room ${code} is already racing.`);
      }

      const playersSnap = await dbMod.get(dbMod.ref(db, `jellydrift/rooms/${code}/players`));
      const curPlayers = playersSnap.val() || {};
      const takenSlots = new Set(
        Object.values(curPlayers)
          .filter((p) => p && p.uid !== myUid && typeof p.slot === "number")
          .map((p) => p.slot)
      );

      let freeSlot = -1;
      for (let s = 0; s < 4; s++) {
        if (!takenSlots.has(s)) {
          freeSlot = s;
          break;
        }
      }
      if (freeSlot === -1) {
        throw new Error(`Room ${code} is full (4/4).`);
      }

      const carId = typeof opts.carId === "string" ? opts.carId : "jelly_gt";
      const playerData = {
        uid: myUid,
        name: callsign || "Racer",
        carId,
        slot: freeSlot,
        ready: true,
        joinedAt: dbMod.serverTimestamp(),
        finishedAtMs: 0,
        driftScore: 0,
        bestLapSec: 0,
      };

      const playerRef = dbMod.ref(db, `jellydrift/rooms/${code}/players/${myUid}`);
      const telRef = dbMod.ref(db, `jellydrift/rooms/${code}/telemetry/${myUid}`);
      await dbMod.set(playerRef, playerData);
      await dbMod.onDisconnect(playerRef).remove();
      await dbMod.onDisconnect(telRef).remove();

      roomCode = code;
      roomMeta = meta;
      playersMap = { ...curPlayers, [myUid]: playerData };
      isPublicRoom = !!meta.isPublic;
      open = true;
      connecting = false;
      statusText = `Joined room ${code}`;
      subscribeToRoom(code);
      emitState();
      return true;
    } catch (err) {
      connecting = false;
      statusText = "";
      errorText = (err && err.message) || "Failed to join room.";
      emitState();
      return false;
    }
  }

  async function quickMatch(opts = {}) {
    if (connecting) return null;
    connecting = true;
    errorText = "";
    statusText = "Searching for open touge lobbies...";
    emitState();

    try {
      await ensureFirebase();
      if (roomCode) await leaveRoom();
      const { db, dbMod } = fb;

      const mmRef = dbMod.ref(db, "jellydrift/matchmaking");
      const q = dbMod.query(mmRef, dbMod.orderByChild("status"), dbMod.equalTo("OPEN"));
      const snap = await dbMod.get(q);
      const val = snap.val() || {};
      const now = serverNow();

      const candidates = Object.values(val)
        .filter((entry) => {
          if (!entry || !entry.roomCode || entry.status !== "OPEN") return false;
          if ((entry.playerCount || 1) >= 4) return false;
          const age = typeof entry.updatedAt === "number" ? now - entry.updatedAt : 0;
          return age < 60000;
        })
        .sort((a, b) => (b.playerCount || 0) - (a.playerCount || 0));

      connecting = false;
      for (const c of candidates) {
        const ok = await joinRoom(c.roomCode, opts);
        if (ok) return c.roomCode;
      }

      return await createRoom({ ...opts, isPublic: true });
    } catch (err) {
      connecting = false;
      statusText = "";
      errorText = (err && err.message) || "Quick match failed.";
      emitState();
      return null;
    }
  }

  function setOpen(nextOpen) {
    open = !!nextOpen;
    if (!open) errorText = "";
    emitState();
  }

  function setCallsign(name) {
    const clean = sanitizeCallsign(name);
    if (!clean) return;
    callsign = clean;
    saveCallsign(clean);
    if (fb && roomCode && myUid) {
      const { db, dbMod } = fb;
      dbMod
        .update(dbMod.ref(db, `jellydrift/rooms/${roomCode}/players/${myUid}`), { name: clean })
        .catch(() => {});
    }
    emitState();
  }

  function setReady(ready) {
    if (!fb || !roomCode || !myUid) return;
    const { db, dbMod } = fb;
    dbMod
      .update(dbMod.ref(db, `jellydrift/rooms/${roomCode}/players/${myUid}`), { ready: !!ready })
      .catch(() => {});
  }

  function updateLocalCar(carId) {
    if (!fb || !roomCode || !myUid || typeof carId !== "string") return;
    const { db, dbMod } = fb;
    dbMod
      .update(dbMod.ref(db, `jellydrift/rooms/${roomCode}/players/${myUid}`), { carId })
      .catch(() => {});
  }

  function updateRoomSettings(patch = {}) {
    if (!fb || !roomCode || !roomMeta || roomMeta.hostUid !== myUid) return;
    const { db, dbMod } = fb;
    const updates = {};
    if (typeof patch.trackId === "string") updates.trackId = patch.trackId;
    if (patch.mode === "GRAND_PRIX" || patch.mode === "DRIFT_RUSH") updates.mode = patch.mode;
    if (typeof patch.collisions === "boolean") updates.collisions = patch.collisions;
    if (Object.keys(updates).length === 0) return;
    dbMod.update(dbMod.ref(db, `jellydrift/rooms/${roomCode}/meta`), updates).catch(() => {});
  }

  async function startOnlineRace() {
    if (!fb || !roomCode || !roomMeta || roomMeta.hostUid !== myUid) return false;
    const count = Object.keys(playersMap).length;
    if (count < 2) {
      errorText = "Wait for at least 2 racers to join before starting.";
      emitState();
      return false;
    }
    const { db, dbMod } = fb;
    errorText = "";
    const nextSeq = (roomMeta.raceSeq || 0) + 1;
    const startAtMs = Math.round(serverNow() + 2600);
    await dbMod.update(dbMod.ref(db, `jellydrift/rooms/${roomCode}/meta`), {
      status: "COUNTDOWN",
      raceSeq: nextSeq,
      startAtMs,
    });
    if (isPublicRoom) {
      dbMod
        .update(dbMod.ref(db, `jellydrift/matchmaking/${roomCode}`), {
          status: "RACING",
          updatedAt: dbMod.serverTimestamp(),
        })
        .catch(() => {});
    }
    return true;
  }

  async function returnRoomToLobby() {
    if (!fb || !roomCode || !roomMeta) return;
    const { db, dbMod } = fb;
    if (roomMeta.hostUid === myUid) {
      await dbMod.update(dbMod.ref(db, `jellydrift/rooms/${roomCode}/meta`), {
        status: "LOBBY",
        startAtMs: 0,
      });
      if (isPublicRoom) {
        dbMod
          .update(dbMod.ref(db, `jellydrift/matchmaking/${roomCode}`), {
            status: "OPEN",
            updatedAt: dbMod.serverTimestamp(),
          })
          .catch(() => {});
      }
    }
    await dbMod
      .update(dbMod.ref(db, `jellydrift/rooms/${roomCode}/players/${myUid}`), {
        finishedAtMs: 0,
        driftScore: 0,
        bestLapSec: 0,
        ready: true,
      })
      .catch(() => {});
  }

  function reportRaceFinish({ driftScore = 0, bestLapSec = 0 } = {}) {
    if (!fb || !roomCode || !myUid) return;
    const { db, dbMod } = fb;
    dbMod
      .update(dbMod.ref(db, `jellydrift/rooms/${roomCode}/players/${myUid}`), {
        finishedAtMs: Math.round(serverNow()),
        driftScore: Math.round(driftScore || 0),
        bestLapSec: Number.isFinite(bestLapSec) ? Math.round(bestLapSec * 1000) / 1000 : 0,
      })
      .catch(() => {});
  }

  function sendTelemetry(pkt) {
    if (!roomCode || !myUid || !pkt) return;
    const nowLocal = typeof performance !== "undefined" ? performance.now() : Date.now();
    const stamped = { ...pkt, t: Math.round(serverNow()) };

    let needRelay = false;
    const remoteUids = Object.keys(playersMap).filter((u) => u !== myUid);

    if (nowLocal - lastP2pSendMs >= P2P_INTERVAL_MS) {
      lastP2pSendMs = nowLocal;
      let serialized = null;
      for (const uid of remoteUids) {
        const entry = peers.get(uid);
        if (entry && entry.dc && entry.dc.readyState === "open") {
          try {
            if (!serialized) serialized = JSON.stringify(stamped);
            entry.dc.send(serialized);
          } catch (_) {
            needRelay = true;
          }
        } else {
          needRelay = true;
        }
      }
    } else {
      for (const uid of remoteUids) {
        const entry = peers.get(uid);
        if (!entry || !entry.dc || entry.dc.readyState !== "open") {
          needRelay = true;
          break;
        }
      }
    }

    if (needRelay && fb && remoteUids.length > 0 && nowLocal - lastRelaySendMs >= RELAY_INTERVAL_MS) {
      lastRelaySendMs = nowLocal;
      const { db, dbMod } = fb;
      dbMod
        .set(dbMod.ref(db, `jellydrift/rooms/${roomCode}/telemetry/${myUid}`), stamped)
        .catch(() => {});
    }
  }

  function dispose() {
    leaveRoom();
    if (offsetUnsub) {
      try {
        offsetUnsub();
      } catch (_) {
        /* ignore */
      }
      offsetUnsub = null;
    }
  }

  return {
    getState: buildPublicState,
    serverNow,
    setOpen,
    setCallsign,
    createRoom,
    joinRoom,
    quickMatch,
    leaveRoom,
    setReady,
    updateLocalCar,
    updateRoomSettings,
    startOnlineRace,
    returnRoomToLobby,
    reportRaceFinish,
    sendTelemetry,
    dispose,
  };
}
