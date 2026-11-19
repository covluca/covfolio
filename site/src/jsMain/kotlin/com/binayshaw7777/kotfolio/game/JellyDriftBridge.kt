package com.binayshaw7777.kotfolio.game

import kotlinx.browser.window
import org.w3c.dom.HTMLElement
import kotlin.js.Promise

enum class EngineLoadStatus {
    INITIALIZING,
    VENDOR_READY_AWAITING_ENGINE,
    READY,
    ERROR
}

enum class GamePhase {
    GARAGE,
    COUNTDOWN,
    RACING,
    PAUSED,
    CONTINUE_OFFER,
    AD_WATCHING,
    FINISHED
}

enum class GameMode {
    DRIFT_RUSH,
    GRAND_PRIX
}

enum class CameraMode {
    CHASE,
    DRIVER,
    HOOD
}

data class Vec3Dto(
    val x: Double = 0.0,
    val y: Double = 0.0,
    val z: Double = 0.0
)

data class PlayerWorldPosDto(
    val x: Double = 0.0,
    val y: Double = 0.0,
    val z: Double = 0.0,
    val yawDeg: Double = 0.0
)

data class JellySpringDto(
    val pitchDeg: Double = 0.0,
    val rollDeg: Double = 0.0,
    val squash: Double = 0.0,
    val bounceY: Double = 0.0
)

data class DomRectDto(
    val left: Double = 0.0,
    val top: Double = 0.0,
    val width: Double = 0.0,
    val height: Double = 0.0
)

data class AdSlotStatusDto(
    val mounted: Boolean = false,
    val visible: Boolean = false,
    val rect: DomRectDto? = null,
    val status: String = "idle",
    val open: Boolean = false
)

data class AdSlotsSnapshotDto(
    val publisherId: String = AdConfig.PUBLISHER_ID,
    val adsenseBlocked: Boolean = false,
    val roof: AdSlotStatusDto = AdSlotStatusDto(),
    val console: AdSlotStatusDto = AdSlotStatusDto(),
    val continueModal: AdSlotStatusDto = AdSlotStatusDto(),
    val garage: AdSlotStatusDto = AdSlotStatusDto(),
    val podium: AdSlotStatusDto = AdSlotStatusDto(),
    val tracksideCount: Int = 0
)

data class JellyDriftSnapshot(
    val ready: Boolean = false,
    val phase: GamePhase = GamePhase.GARAGE,
    val mode: GameMode = GameMode.DRIFT_RUSH,
    val trackId: String = "sunny_coast",
    val carId: String = "jelly_gt",
    val cameraMode: CameraMode = CameraMode.CHASE,
    val speedKmh: Double = 0.0,
    val isDrifting: Boolean = false,
    val driftAngleDeg: Double = 0.0,
    val driftScore: Int = 0,
    val boostCharge: Double = 0.0,
    val boostTier: Int = 0,
    val lap: Int = 1,
    val totalLaps: Int = 3,
    val checkpointIndex: Int = 0,
    val nextCheckpointPos: Vec3Dto = Vec3Dto(),
    val nextCheckpointDirDeg: Double = 0.0,
    val timeRemainingSec: Double = 0.0,
    val continuesUsed: Int = 0,
    val position: Int = 1,
    val aiCount: Int = 4,
    val playerWorldPos: PlayerWorldPosDto = PlayerWorldPosDto(),
    val jellySpring: JellySpringDto = JellySpringDto(),
    val adSlots: AdSlotsSnapshotDto = AdSlotsSnapshotDto(),
    val fps: Double = 0.0,
    val fatalErrors: List<String> = emptyList()
)

private inline fun <reified T : Enum<T>> enumValueOrDefault(raw: dynamic, defaultValue: T): T {
    val name = raw as? String ?: return defaultValue
    return enumValues<T>().firstOrNull { it.name.equals(name, ignoreCase = true) } ?: defaultValue
}

private fun asDoubleOr(raw: dynamic, defaultValue: Double = 0.0): Double {
    val num = raw as? Number
    return num?.toDouble() ?: defaultValue
}

private fun asIntOr(raw: dynamic, defaultValue: Int = 0): Int {
    val num = raw as? Number
    return num?.toInt() ?: defaultValue
}

private fun asBoolOr(raw: dynamic, defaultValue: Boolean = false): Boolean {
    return (raw as? Boolean) ?: defaultValue
}

private fun asStringOr(raw: dynamic, defaultValue: String = ""): String {
    return (raw as? String) ?: defaultValue
}

private fun parseRect(raw: dynamic): DomRectDto? {
    if (raw == null || raw == undefined) return null
    return DomRectDto(
        left = asDoubleOr(raw.left, 0.0),
        top = asDoubleOr(raw.top, 0.0),
        width = asDoubleOr(raw.width, 0.0),
        height = asDoubleOr(raw.height, 0.0)
    )
}

private fun parseSlotStatus(raw: dynamic): AdSlotStatusDto {
    if (raw == null || raw == undefined) return AdSlotStatusDto()
    return AdSlotStatusDto(
        mounted = asBoolOr(raw.mounted, false),
        visible = asBoolOr(raw.visible, false),
        rect = parseRect(raw.rect),
        status = asStringOr(raw.status, "idle"),
        open = asBoolOr(raw.open, false)
    )
}

fun parseSnapshot(raw: dynamic): JellyDriftSnapshot {
    if (raw == null || raw == undefined) return JellyDriftSnapshot()

    val pos = raw.playerWorldPos
    val spring = raw.jellySpring
    val nextCp = raw.nextCheckpointPos
    val slots = raw.adSlots

    val errorsList = mutableListOf<String>()
    val rawErrors = raw.fatalErrors
    if (rawErrors != null && rawErrors != undefined) {
        val len = (rawErrors.length as? Number)?.toInt() ?: 0
        for (i in 0 until len) {
            val item = rawErrors[i] as? String
            if (item != null) errorsList.add(item)
        }
    }

    return JellyDriftSnapshot(
        ready = asBoolOr(raw.ready, false),
        phase = enumValueOrDefault(raw.phase, GamePhase.GARAGE),
        mode = enumValueOrDefault(raw.mode, GameMode.DRIFT_RUSH),
        trackId = asStringOr(raw.trackId, "sunny_coast"),
        carId = asStringOr(raw.carId, "jelly_gt"),
        cameraMode = enumValueOrDefault(raw.cameraMode, CameraMode.CHASE),
        speedKmh = asDoubleOr(raw.speedKmh, 0.0),
        isDrifting = asBoolOr(raw.isDrifting, false),
        driftAngleDeg = asDoubleOr(raw.driftAngleDeg, 0.0),
        driftScore = asIntOr(raw.driftScore, 0),
        boostCharge = asDoubleOr(raw.boostCharge, 0.0),
        boostTier = asIntOr(raw.boostTier, 0),
        lap = asIntOr(raw.lap, 1),
        totalLaps = asIntOr(raw.totalLaps, 3),
        checkpointIndex = asIntOr(raw.checkpointIndex, 0),
        nextCheckpointPos = if (nextCp != null && nextCp != undefined) {
            Vec3Dto(
                x = asDoubleOr(nextCp.x, 0.0),
                y = asDoubleOr(nextCp.y, 0.0),
                z = asDoubleOr(nextCp.z, 0.0)
            )
        } else {
            Vec3Dto()
        },
        nextCheckpointDirDeg = asDoubleOr(raw.nextCheckpointDirDeg, 0.0),
        timeRemainingSec = asDoubleOr(raw.timeRemainingSec, 0.0),
        continuesUsed = asIntOr(raw.continuesUsed, 0),
        position = asIntOr(raw.position, 1),
        aiCount = asIntOr(raw.aiCount, 4),
        playerWorldPos = if (pos != null && pos != undefined) {
            PlayerWorldPosDto(
                x = asDoubleOr(pos.x, 0.0),
                y = asDoubleOr(pos.y, 0.0),
                z = asDoubleOr(pos.z, 0.0),
                yawDeg = asDoubleOr(pos.yawDeg, 0.0)
            )
        } else {
            PlayerWorldPosDto()
        },
        jellySpring = if (spring != null && spring != undefined) {
            JellySpringDto(
                pitchDeg = asDoubleOr(spring.pitchDeg, 0.0),
                rollDeg = asDoubleOr(spring.rollDeg, 0.0),
                squash = asDoubleOr(spring.squash, 0.0),
                bounceY = asDoubleOr(spring.bounceY, 0.0)
            )
        } else {
            JellySpringDto()
        },
        adSlots = if (slots != null && slots != undefined) {
            AdSlotsSnapshotDto(
                publisherId = asStringOr(slots.publisherId, AdConfig.PUBLISHER_ID),
                adsenseBlocked = asBoolOr(slots.adsenseBlocked, AdConfig.isBlocked()),
                roof = parseSlotStatus(slots.roof),
                console = parseSlotStatus(slots.console),
                continueModal = parseSlotStatus(slots.continueModal),
                garage = parseSlotStatus(slots.garage),
                podium = parseSlotStatus(slots.podium),
                tracksideCount = asIntOr(slots.tracksideCount, 0)
            )
        } else {
            AdSlotsSnapshotDto()
        },
        fps = asDoubleOr(raw.fps, 0.0),
        fatalErrors = errorsList
    )
}

class JellyDriftBridge {
    private val dynamicImport: (String) -> Promise<dynamic> =
        js("(function(p) { return import(/* webpackIgnore: true */ p); })").unsafeCast<(String) -> Promise<dynamic>>()

    private fun resolvedPromise(value: Any?): Promise<dynamic> = Promise { resolve, _ ->
        resolve(value)
    }

    private var controller: dynamic = null
    var loadStatus: EngineLoadStatus = EngineLoadStatus.INITIALIZING
        private set
    var threeRevision: String? = null
        private set
    var statusMessage: String? = null
        private set

    fun mount(
        webglContainer: HTMLElement,
        ad3dContainer: HTMLElement,
        consoleSlotEl: HTMLElement?,
        roofSlotEl: HTMLElement?,
        onSnapshot: (JellyDriftSnapshot) -> Unit,
        onLoadStateChange: (EngineLoadStatus, String?, String?) -> Unit,
        isDisposed: () -> Boolean
    ) {
        loadStatus = EngineLoadStatus.INITIALIZING
        statusMessage = "Loading Three.js & AdSense runtime..."
        onLoadStateChange(loadStatus, threeRevision, statusMessage)

        val ensureAdsPromise: Promise<dynamic> = if (AdConfig.managerOrNull() != null) {
            resolvedPromise(window.asDynamic().__COVFOLIO_ADS__)
        } else {
            dynamicImport("/jellydrift/adsense.js").then<dynamic>(
                onFulfilled = { res: dynamic -> res },
                onRejected = { _: Throwable -> null }
            )
        }

        ensureAdsPromise.then<dynamic> { _: dynamic ->
            if (isDisposed()) return@then resolvedPromise(null)
            dynamicImport("/jellydrift/vendor/three.module.min.js")
        }.then<dynamic>(
            onFulfilled = { threeMod: dynamic ->
                if (isDisposed() || threeMod == null) return@then resolvedPromise(null)
                threeRevision = threeMod.REVISION as? String
                dynamicImport("/jellydrift/engine.js").then<dynamic>(
                    onFulfilled = { engineMod: dynamic ->
                        if (!isDisposed()) {
                            val factory = engineMod?.createJellyDriftEngine
                            if (factory == null || factory == undefined) {
                                loadStatus = EngineLoadStatus.VENDOR_READY_AWAITING_ENGINE
                                statusMessage = "Three.js r${threeRevision ?: "?"} & AdSense ready — awaiting M3 engine.js"
                                onLoadStateChange(loadStatus, threeRevision, statusMessage)
                            } else {
                                val cfg = js("({})")
                                cfg.webglContainer = webglContainer
                                cfg.ad3dContainer = ad3dContainer
                                cfg.consoleSlotEl = consoleSlotEl
                                cfg.roofSlotEl = roofSlotEl
                                cfg.adManager = AdConfig.managerOrNull()
                                cfg.onSnapshot = { raw: dynamic ->
                                    if (!isDisposed()) {
                                        onSnapshot(parseSnapshot(raw))
                                    }
                                }
                                controller = engineMod.createJellyDriftEngine(cfg)
                                loadStatus = EngineLoadStatus.READY
                                statusMessage = null
                                onLoadStateChange(loadStatus, threeRevision, statusMessage)
                            }
                        }
                        null
                    },
                    onRejected = { _: Throwable ->
                        if (!isDisposed()) {
                            loadStatus = EngineLoadStatus.VENDOR_READY_AWAITING_ENGINE
                            statusMessage = "Three.js r${threeRevision ?: "?"} & AdSense ready — awaiting M3 engine.js"
                            onLoadStateChange(loadStatus, threeRevision, statusMessage)
                        }
                        null
                    }
                )
            },
            onRejected = { err: Throwable ->
                if (!isDisposed()) {
                    loadStatus = EngineLoadStatus.ERROR
                    statusMessage = "Failed to initialize Three.js vendor module: ${err.message ?: err}"
                    onLoadStateChange(loadStatus, threeRevision, statusMessage)
                }
                null
            }
        )
    }

    fun startRace(trackId: String, carId: String, mode: GameMode) {
        runCatching {
            val opts = js("({})")
            opts.trackId = trackId
            opts.carId = carId
            opts.mode = mode.name
            controller?.startRace(opts)
        }
    }

    fun setCameraMode(mode: CameraMode) {
        runCatching { controller?.setCameraMode(mode.name) }
    }

    fun toggleCamera() {
        runCatching { controller?.toggleCamera() }
    }

    fun pause() {
        runCatching { controller?.pause() }
    }

    fun resume() {
        runCatching { controller?.resume() }
    }

    fun restartRace() {
        runCatching { controller?.restartRace() }
    }

    fun returnToGarage() {
        runCatching { controller?.returnToGarage() }
    }

    fun grantContinue() {
        runCatching { controller?.grantContinue() }
    }

    fun setMuted(muted: Boolean) {
        runCatching { controller?.setMuted(muted) }
    }

    fun setTouchInput(
        throttle: Boolean,
        brake: Boolean,
        left: Boolean,
        right: Boolean,
        drift: Boolean,
        boost: Boolean
    ) {
        runCatching {
            val input = js("({})")
            input.throttle = throttle
            input.brake = brake
            input.left = left
            input.right = right
            input.drift = drift
            input.boost = boost
            controller?.setTouchInput(input)
        }
    }

    fun getSnapshot(): JellyDriftSnapshot? = runCatching {
        val raw = controller?.getSnapshot()
        if (raw == null || raw == undefined) null else parseSnapshot(raw)
    }.getOrNull()

    fun dispose() {
        runCatching { controller?.dispose() }
        controller = null
        js("try { delete window.__JELLY_DRIFT__; } catch(_) {}")
    }
}
