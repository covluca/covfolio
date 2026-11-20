package com.binayshaw7777.kotfolio.game

import androidx.compose.runtime.*
import com.binayshaw7777.kotfolio.utils.Res.Fonts
import com.varabyte.kobweb.compose.css.Cursor
import com.varabyte.kobweb.compose.css.FontWeight
import com.varabyte.kobweb.compose.css.Overflow
import com.varabyte.kobweb.compose.css.PointerEvents
import com.varabyte.kobweb.compose.css.TextAlign
import com.varabyte.kobweb.compose.foundation.layout.Arrangement
import com.varabyte.kobweb.compose.foundation.layout.Column
import com.varabyte.kobweb.compose.foundation.layout.Row
import com.varabyte.kobweb.compose.ui.Alignment
import com.varabyte.kobweb.compose.ui.Modifier
import com.varabyte.kobweb.compose.ui.attrsModifier
import com.varabyte.kobweb.compose.ui.graphics.Color
import com.varabyte.kobweb.compose.ui.graphics.Colors
import com.varabyte.kobweb.compose.ui.modifiers.*
import com.varabyte.kobweb.compose.ui.styleModifier
import com.varabyte.kobweb.compose.ui.toAttrs
import com.varabyte.kobweb.silk.components.navigation.Link
import com.varabyte.kobweb.silk.components.navigation.UncoloredLinkVariant
import com.varabyte.kobweb.silk.components.navigation.UndecoratedLinkVariant
import com.varabyte.kobweb.silk.components.text.SpanText
import kotlinx.browser.window
import kotlinx.coroutines.delay
import org.jetbrains.compose.web.css.LineStyle
import org.jetbrains.compose.web.css.Position
import org.jetbrains.compose.web.css.cssRem
import org.jetbrains.compose.web.css.px
import org.jetbrains.compose.web.css.rgba
import org.jetbrains.compose.web.dom.Div
import org.jetbrains.compose.web.dom.TagElement
import org.w3c.dom.HTMLElement
import org.w3c.dom.events.EventListener
import kotlin.math.ceil

internal val ACCENT_YELLOW = Color.rgb(0xF3DB5B)
internal val CARD_BG = Color.rgb(0x161D2A)
internal val MODAL_BG = Color.rgb(0x0C1119)

private val TRACKS = listOf(
    "sunny_coast" to "Sunny Coast",
    "canyon_loop" to "Canyon Loop",
    "neon_circuit" to "Neon Circuit",
)

private val TRACK_SUBTITLES = mapOf(
    "sunny_coast" to "Cliffside switchback touge",
    "canyon_loop" to "Red-rock mountain pass",
    "neon_circuit" to "Midnight expressway touge",
)

private val CARS = listOf(
    "jelly_gt" to "Jelly GT",
    "tofu_86" to "Tofu 86",
    "bumble_buggy" to "Bumble Buggy",
    "cobalt_hyper" to "Cobalt Hyper",
)

private val MODES = listOf(
    GameMode.DRIFT_RUSH to "Drift Rush",
    GameMode.GRAND_PRIX to "Grand Prix",
)

// Car stats: Top Speed, Accel, Drift, Bounce (0-10 scale)
private val CAR_STATS = mapOf(
    "jelly_gt" to listOf(7.0, 7.0, 7.0, 7.0),
    "tofu_86" to listOf(6.0, 7.0, 10.0, 6.0),
    "bumble_buggy" to listOf(6.0, 9.0, 6.0, 10.0),
    "cobalt_hyper" to listOf(10.0, 8.0, 8.0, 5.0),
)

private val STAT_LABELS = listOf("Top Speed", "Accel", "Drift", "Bounce")

@Composable
internal fun GameButton(
    testId: String,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    accent: Boolean = false,
    enabled: Boolean = true,
    fontSizeRem: Double = 0.88,
) {
    val currentOnClick = rememberUpdatedState(onClick)
    val currentEnabled = rememberUpdatedState(enabled)
    Div(
        modifier
            .padding(topBottom = 0.55.cssRem, leftRight = 1.05.cssRem)
            .borderRadius(10.px)
            .backgroundColor(if (accent) ACCENT_YELLOW else CARD_BG)
            .border(1.px, LineStyle.Solid, if (accent) ACCENT_YELLOW else rgba(255, 255, 255, 0.2f))
            .pointerEvents(PointerEvents.Auto)
            .cursor(if (enabled) Cursor.Pointer else Cursor.NotAllowed)
            .styleModifier {
                property("text-align", "center")
                property("user-select", "none")
                property("touch-action", "none")
                if (!enabled) property("opacity", "0.45")
            }
            .toAttrs {
                attr("data-testid", testId)
                attr("role", "button")
                attr("aria-disabled", if (enabled) "false" else "true")
                ref { el ->
                    var lastTouchEndMs = -1000.0
                    val touchEndListener = EventListener { evt ->
                        if (!currentEnabled.value) return@EventListener
                        runCatching { evt.preventDefault() }
                        lastTouchEndMs = window.performance.now()
                        currentOnClick.value.invoke()
                    }
                    val clickListener = EventListener {
                        if (!currentEnabled.value) return@EventListener
                        if (window.performance.now() - lastTouchEndMs >= 380.0) {
                            currentOnClick.value.invoke()
                        }
                    }
                    el.addEventListener("touchend", touchEndListener)
                    el.addEventListener("click", clickListener)
                    onDispose {
                        el.removeEventListener("touchend", touchEndListener)
                        el.removeEventListener("click", clickListener)
                    }
                }
            }
    ) {
        SpanText(
            label,
            modifier = Modifier
                .fontFamily(Fonts.Space_Grotesk)
                .fontSize(fontSizeRem.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(if (accent) Colors.Black else Colors.White)
                .textAlign(TextAlign.Center)
        )
    }
}

@Composable
private fun SelectCard(
    testId: String,
    attrName: String,
    value: String,
    label: String,
    selected: Boolean,
    onSelect: () -> Unit,
    widthPx: Int,
    subtitle: String? = null,
) {
    val currentOnSelect = rememberUpdatedState(onSelect)
    Div(
        Modifier
            .width(widthPx.px)
            .padding(topBottom = 8.px, leftRight = 8.px)
            .borderRadius(10.px)
            .backgroundColor(if (selected) Color.rgb(0x24304A) else CARD_BG)
            .border(2.px, LineStyle.Solid, if (selected) ACCENT_YELLOW else rgba(255, 255, 255, 0.14f))
            .pointerEvents(PointerEvents.Auto)
            .cursor(Cursor.Pointer)
            .styleModifier {
                property("text-align", "center")
                property("user-select", "none")
                property("touch-action", "none")
            }
            .toAttrs {
                attr("data-testid", testId)
                attr(attrName, value)
                attr("role", "button")
                attr("aria-pressed", if (selected) "true" else "false")
                ref { el ->
                    var lastTouchEndMs = -1000.0
                    val touchEndListener = EventListener { evt ->
                        runCatching { evt.preventDefault() }
                        lastTouchEndMs = window.performance.now()
                        currentOnSelect.value.invoke()
                    }
                    val clickListener = EventListener {
                        if (window.performance.now() - lastTouchEndMs >= 380.0) {
                            currentOnSelect.value.invoke()
                        }
                    }
                    el.addEventListener("touchend", touchEndListener)
                    el.addEventListener("click", clickListener)
                    onDispose {
                        el.removeEventListener("touchend", touchEndListener)
                        el.removeEventListener("click", clickListener)
                    }
                }
            }
    ) {
        SpanText(
            label,
            modifier = Modifier
                .fontFamily(Fonts.Space_Grotesk)
                .fontSize(0.76.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(if (selected) ACCENT_YELLOW else Colors.White)
                .textAlign(TextAlign.Center)
        )
        if (subtitle != null) {
            SpanText(
                subtitle,
                modifier = Modifier
                    .margin(top = 2.px)
                    .fontFamily(Fonts.DM_SANS)
                    .fontSize(0.60.cssRem)
                    .color(Colors.LightGray)
                    .textAlign(TextAlign.Center)
            )
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    SpanText(
        text,
        modifier = Modifier
            .margin(bottom = 4.px)
            .fontFamily(Fonts.Space_Grotesk)
            .fontSize(0.68.cssRem)
            .fontWeight(FontWeight.Bold)
            .color(Colors.LightGray)
            .styleModifier { property("letter-spacing", "0.16em") }
    )
}

@Composable
private fun StatBar(label: String, value: Double) {
    val fillPct = ((value / 10.0) * 100.0).toInt().coerceIn(0, 100)
    Row(
        modifier = Modifier
            .width(148.px)
            .gap(6.px),
        verticalAlignment = Alignment.CenterVertically
    ) {
        SpanText(
            label,
            modifier = Modifier
                .width(56.px)
                .fontFamily(Fonts.DM_SANS)
                .fontSize(0.62.cssRem)
                .color(Colors.LightGray)
        )
        Div(
            Modifier
                .height(5.px)
                .borderRadius(3.px)
                .backgroundColor(rgba(255, 255, 255, 0.14f))
                .overflow(Overflow.Hidden)
                .styleModifier { property("flex", "1") }
                .toAttrs()
        ) {
            Div(
                Modifier
                    .height(5.px)
                    .borderRadius(3.px)
                    .backgroundColor(ACCENT_YELLOW)
                    .styleModifier { property("width", "$fillPct%") }
                    .toAttrs()
            )
        }
    }
}

@Composable
private fun CarStatsPanel(carId: String) {
    val stats = CAR_STATS[carId] ?: return
    Column(
        modifier = Modifier
            .padding(topBottom = 6.px, leftRight = 10.px)
            .gap(4.px)
            .borderRadius(10.px)
            .backgroundColor(rgba(12, 17, 25, 0.72f))
            .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.12f)),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(
            modifier = Modifier.gap(10.px),
            verticalAlignment = Alignment.CenterVertically
        ) {
            StatBar(STAT_LABELS[0], stats[0])
            StatBar(STAT_LABELS[1], stats[1])
        }
        Row(
            modifier = Modifier.gap(10.px),
            verticalAlignment = Alignment.CenterVertically
        ) {
            StatBar(STAT_LABELS[2], stats[2])
            StatBar(STAT_LABELS[3], stats[3])
        }
    }
}

@Composable
private fun ControlsHint() {
    SpanText(
        "WASD/Arrows · Space Drift · C Camera · V Hood · Esc Pause",
        modifier = Modifier
            .fontFamily(Fonts.DM_SANS)
            .fontSize(0.6.cssRem)
            .color(Colors.LightGray)
            .textAlign(TextAlign.Center)
    )
}

@Composable
fun GarageMenu(
    snapshot: JellyDriftSnapshot,
    bridge: JellyDriftBridge,
) {
    Column(
        modifier = Modifier
            .position(Position.Absolute)
            .top(44.px)
            .left(0.px)
            .right(0.px)
            .padding(leftRight = 10.px)
            .pointerEvents(PointerEvents.None)
            .styleModifier { property("align-items", "center") },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        SpanText(
            "JELLY DRIFT 3D",
            modifier = Modifier
                .fontFamily(Fonts.Space_Grotesk)
                .fontSize(1.65.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(ACCENT_YELLOW)
                .styleModifier { property("text-shadow", "0 4px 24px rgba(243,219,91,0.25)") }
        )
        SpanText(
            "Pick a circuit, a jelly car and a mode. Drift to charge your boost.",
            modifier = Modifier
                .margin(top = 2.px, bottom = 8.px)
                .fontFamily(Fonts.DM_SANS)
                .fontSize(0.75.cssRem)
                .color(Colors.LightGray)
                .textAlign(TextAlign.Center)
        )

        SectionLabel("CIRCUIT")
        Row(
            modifier = Modifier
                .gap(6.px)
                .styleModifier {
                    property("flex-wrap", "wrap")
                    property("justify-content", "center")
                },
            verticalAlignment = Alignment.CenterVertically
        ) {
            for ((id, label) in TRACKS) {
                SelectCard(
                    testId = "track-$id",
                    attrName = "data-track-id",
                    value = id,
                    label = label,
                    selected = snapshot.trackId == id,
                    onSelect = { bridge.selectTrack(id) },
                    widthPx = 110,
                    subtitle = TRACK_SUBTITLES[id],
                )
            }
        }

        Div(Modifier.height(8.px).toAttrs())
        SectionLabel("JELLY CAR")
        Row(
            modifier = Modifier
                .gap(6.px)
                .styleModifier {
                    property("flex-wrap", "wrap")
                    property("justify-content", "center")
                },
            verticalAlignment = Alignment.CenterVertically
        ) {
            for ((id, label) in CARS) {
                SelectCard(
                    testId = "car-$id",
                    attrName = "data-car-id",
                    value = id,
                    label = label,
                    selected = snapshot.carId == id,
                    onSelect = { bridge.selectCar(id) },
                    widthPx = 104,
                )
            }
        }

        Div(Modifier.height(8.px).toAttrs())
        SectionLabel("MODE")
        Row(
            modifier = Modifier
                .gap(8.px)
                .styleModifier { property("justify-content", "center") },
            verticalAlignment = Alignment.CenterVertically
        ) {
            for ((mode, label) in MODES) {
                SelectCard(
                    testId = "mode-${mode.name}",
                    attrName = "data-mode-id",
                    value = mode.name,
                    label = label,
                    selected = snapshot.mode == mode,
                    onSelect = { bridge.selectMode(mode) },
                    widthPx = 136,
                )
            }
        }

        Div(Modifier.height(8.px).toAttrs())
        CarStatsPanel(snapshot.carId)

        Div(Modifier.height(6.px).toAttrs())
        ControlsHint()

        Div(Modifier.height(10.px).toAttrs())
        GameButton(
            testId = "start-race-btn",
            label = "START RACE",
            onClick = { bridge.startRace(snapshot.trackId, snapshot.carId, snapshot.mode) },
            accent = true,
            fontSizeRem = 0.95,
            modifier = Modifier.width(240.px),
        )
    }
}

@Composable
fun CountdownOverlay(snapshot: JellyDriftSnapshot) {
    if (snapshot.phase != GamePhase.COUNTDOWN) return
    val digit = maxOf(1, ceil(snapshot.countdown * 2.0).toInt())
    Div(
        Modifier
            .position(Position.Absolute)
            .top(0.px)
            .left(0.px)
            .right(0.px)
            .bottom(0.px)
            .pointerEvents(PointerEvents.None)
            .styleModifier {
                property("display", "flex")
                property("align-items", "center")
                property("justify-content", "center")
            }
            .toAttrs()
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            SpanText(
                "GET READY",
                modifier = Modifier
                    .fontFamily(Fonts.Space_Grotesk)
                    .fontSize(1.5.cssRem)
                    .fontWeight(FontWeight.Bold)
                    .color(Colors.White)
            )
            SpanText(
                digit.toString(),
                modifier = Modifier
                    .fontFamily(Fonts.Space_Grotesk)
                    .fontSize(5.0.cssRem)
                    .fontWeight(FontWeight.Bold)
                    .color(ACCENT_YELLOW)
            )
        }
    }
}

@Composable
internal fun MenuCard(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .maxWidth(420.px)
            .margin(12.px)
            .padding(20.px)
            .gap(10.px)
            .borderRadius(16.px)
            .backgroundColor(MODAL_BG)
            .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.18f))
            .pointerEvents(PointerEvents.Auto)
            .styleModifier { property("box-shadow", "0 24px 80px rgba(0,0,0,0.55)") },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        content()
    }
}

@Composable
fun PauseMenu(
    bridge: JellyDriftBridge,
) {
    MenuCard {
        SpanText(
            "PAUSED",
            modifier = Modifier
                .fontFamily(Fonts.Space_Grotesk)
                .fontSize(1.65.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(ACCENT_YELLOW)
        )
        SpanText(
            "Take a breath. The clock is frozen.",
            modifier = Modifier
                .fontFamily(Fonts.DM_SANS)
                .fontSize(0.85.cssRem)
                .color(Colors.LightGray)
                .textAlign(TextAlign.Center)
        )
        GameButton("resume-btn", "RESUME", { bridge.resume() }, accent = true, modifier = Modifier.width(240.px))
        GameButton("restart-race-btn", "RESTART RACE", { bridge.restartRace() }, modifier = Modifier.width(240.px))
        GameButton("back-garage-btn", "BACK TO GARAGE", { bridge.returnToGarage() }, modifier = Modifier.width(240.px))
        Link(
            path = "/",
            text = "RETIRE TO PORTFOLIO",
            modifier = Modifier
                .margin(top = 4.px)
                .padding(topBottom = 0.5.cssRem, leftRight = 0.8.cssRem)
                .fontFamily(Fonts.Space_Grotesk)
                .fontSize(0.75.cssRem)
                .color(Colors.LightGray)
                .pointerEvents(PointerEvents.Auto)
                .attrsModifier { attr("data-testid", "retire-btn") },
            variant = UndecoratedLinkVariant.then(UncoloredLinkVariant)
        )
    }
}

@Composable
fun ContinueOfferMenu(
    snapshot: JellyDriftSnapshot,
    bridge: JellyDriftBridge,
) {
    MenuCard {
        SpanText(
            "TIME'S UP",
            modifier = Modifier
                .fontFamily(Fonts.Space_Grotesk)
                .fontSize(1.65.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(ACCENT_YELLOW)
        )
        SpanText(
            "Watch a short sponsor break to keep this drift run alive (${snapshot.continuesUsed}/2 continues used).",
            modifier = Modifier
                .fontFamily(Fonts.DM_SANS)
                .fontSize(0.84.cssRem)
                .color(Colors.LightGray)
                .textAlign(TextAlign.Center)
        )
        GameButton(
            "watch-ad-continue-btn",
            if (snapshot.continuesUsed >= 2) "CONTINUE LIMIT REACHED" else "WATCH AD & CONTINUE",
            { bridge.requestContinue() },
            accent = snapshot.continuesUsed < 2,
            enabled = snapshot.continuesUsed < 2,
            modifier = Modifier.width(280.px),
        )
        GameButton("restart-race-btn", "RESTART RACE", { bridge.restartRace() }, modifier = Modifier.width(280.px))
        GameButton("back-garage-btn", "BACK TO GARAGE", { bridge.returnToGarage() }, modifier = Modifier.width(280.px))
    }
}

@Composable
fun AdWatchingOverlayModal(
    snapshot: JellyDriftSnapshot,
    bridge: JellyDriftBridge,
    adConfig: AdRuntimeConfig,
    isExporting: Boolean,
    onContinueIns: (HTMLElement?) -> Unit,
) {
    val visible = snapshot.phase == GamePhase.AD_WATCHING
    var unlocked by remember { mutableStateOf(false) }

    LaunchedEffect(visible) {
        if (visible) {
            unlocked = false
            delay(650)
            unlocked = true
        } else {
            unlocked = false
        }
    }

    Div(
        Modifier
            .position(Position.Absolute)
            .top(0.px)
            .left(0.px)
            .right(0.px)
            .bottom(0.px)
            .pointerEvents(if (visible) PointerEvents.Auto else PointerEvents.None)
            .styleModifier {
                property("display", "flex")
                property("align-items", "center")
                property("justify-content", "center")
                property("visibility", if (visible) "visible" else "hidden")
                property("opacity", if (visible) "1" else "0")
            }
            .toAttrs()
    ) {
        Column(
            modifier = Modifier
                .maxWidth(360.px)
                .margin(12.px)
                .padding(16.px)
                .gap(8.px)
                .borderRadius(16.px)
                .backgroundColor(MODAL_BG)
                .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.2f))
                .pointerEvents(if (visible) PointerEvents.Auto else PointerEvents.None)
                .styleModifier { property("box-shadow", "0 24px 80px rgba(0,0,0,0.65)") },
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            SpanText(
                "SPONSORED PIT STOP",
                modifier = Modifier
                    .fontFamily(Fonts.Space_Grotesk)
                    .fontSize(1.1.cssRem)
                    .fontWeight(FontWeight.Bold)
                    .color(ACCENT_YELLOW)
            )
            StaticAdOverlay(
                id = "continue-ad-overlay",
                slotKey = AdSlotKey.CONTINUE,
                adConfig = adConfig,
                isExporting = isExporting,
                visible = visible,
                modifier = Modifier
                    .width(300.px)
                    .height(210.px)
                    .borderRadius(10.px)
                    .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.16f)),
                badge = "SPONSORED REWARD",
                title = "JELLY TURBO NITRO",
                body = "+20s Bonus Clock & Full Tier-3 Boost Refill",
                onIns = onContinueIns
            )
            GameButton(
                testId = "confirm-continue-btn",
                label = if (unlocked) "CONTINUE RACE (+20s)" else "WATCHING SPONSOR...",
                onClick = { bridge.grantContinue() },
                accent = unlocked,
                enabled = unlocked,
                modifier = Modifier.width(260.px)
            )
            GameButton(
                testId = "cancel-continue-btn",
                label = "CANCEL",
                onClick = { bridge.cancelContinue() },
                accent = false,
                enabled = true,
                fontSizeRem = 0.78,
                modifier = Modifier.width(260.px)
            )
        }
    }
}

@Composable
fun PodiumMenu(
    snapshot: JellyDriftSnapshot,
    bridge: JellyDriftBridge,
) {
    Column(
        modifier = Modifier
            .position(Position.Absolute)
            .left(24.px)
            .top(70.px)
            .width(360.px)
            .padding(20.px)
            .gap(10.px)
            .borderRadius(16.px)
            .backgroundColor(MODAL_BG)
            .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.18f))
            .pointerEvents(PointerEvents.Auto)
            .overflow(Overflow.Hidden)
            .styleModifier {
                property("max-width", "calc(100vw - 48px)")
                property("box-shadow", "0 24px 80px rgba(0,0,0,0.55)")
            },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        SpanText(
            "PODIUM FINISH",
            modifier = Modifier
                .fontFamily(Fonts.Space_Grotesk)
                .fontSize(1.55.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(ACCENT_YELLOW)
        )
        SpanText(
            "Position ${snapshot.position} of ${snapshot.aiCount + 1}",
            modifier = Modifier
                .fontFamily(Fonts.Space_Grotesk)
                .fontSize(1.0.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(Colors.White)
        )
        SpanText(
            "Drift score ${snapshot.driftScore} · ${snapshot.totalLaps} laps · ${snapshot.trackId.replace('_', ' ')}",
            modifier = Modifier
                .fontFamily(Fonts.DM_SANS)
                .fontSize(0.8.cssRem)
                .color(Colors.LightGray)
                .textAlign(TextAlign.Center)
        )
        Div(Modifier.height(4.px).toAttrs())
        GameButton("restart-race-btn", "REMATCH", { bridge.restartRace() }, accent = true, modifier = Modifier.width(240.px))
        GameButton("back-garage-btn", "BACK TO GARAGE", { bridge.returnToGarage() }, modifier = Modifier.width(240.px))
        Link(
            path = "/",
            text = "BACK TO PORTFOLIO",
            modifier = Modifier
                .margin(top = 4.px)
                .padding(topBottom = 0.55.cssRem, leftRight = 0.9.cssRem)
                .borderRadius(10.px)
                .backgroundColor(CARD_BG)
                .color(Colors.White)
                .fontFamily(Fonts.Space_Grotesk)
                .fontSize(0.8.cssRem)
                .pointerEvents(PointerEvents.Auto)
                .attrsModifier { attr("data-testid", "back-portfolio-btn") },
            variant = UndecoratedLinkVariant.then(UncoloredLinkVariant)
        )
    }
}

@Composable
fun SponsoredFallbackCard(
    badge: String,
    title: String,
    body: String,
    compact: Boolean = false,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(if (compact) 6.px else 10.px)
            .pointerEvents(PointerEvents.None)
            .styleModifier {
                property("box-sizing", "border-box")
                property(
                    "background",
                    "linear-gradient(135deg, #131A26 0%, #1D2A3F 55%, #2A1F38 100%)"
                )
                property("justify-content", "center")
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        SpanText(
            badge,
            modifier = Modifier
                .fontFamily(Fonts.Space_Grotesk)
                .fontSize(if (compact) 0.55.cssRem else 0.6.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(ACCENT_YELLOW)
                .styleModifier { property("letter-spacing", "0.18em") }
        )
        SpanText(
            title,
            modifier = Modifier
                .fontFamily(Fonts.Space_Grotesk)
                .fontSize(if (compact) 0.82.cssRem else 0.92.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(Colors.White)
                .textAlign(TextAlign.Center)
        )
        SpanText(
            body,
            modifier = Modifier
                .fontFamily(Fonts.DM_SANS)
                .fontSize(if (compact) 0.65.cssRem else 0.72.cssRem)
                .color(Colors.LightGray)
                .textAlign(TextAlign.Center)
        )
    }
}

@Composable
fun StaticAdOverlay(
    id: String,
    slotKey: AdSlotKey,
    adConfig: AdRuntimeConfig,
    isExporting: Boolean,
    visible: Boolean,
    modifier: Modifier,
    badge: String,
    title: String,
    body: String,
    onIns: (HTMLElement?) -> Unit,
) {
    var host by remember { mutableStateOf<HTMLElement?>(null) }
    var insEl by remember { mutableStateOf<HTMLElement?>(null) }

    fun applyState(el: HTMLElement?, show: Boolean) {
        if (el == null) return
        el.style.setProperty("visibility", if (show) "visible" else "hidden")
        el.style.setProperty("opacity", if (show) "1" else "0")
        el.style.setProperty(
            "pointer-events",
            if (show && id == "continue-ad-overlay") "auto" else "none"
        )
    }

    LaunchedEffect(host, visible) {
        applyState(host, visible)
    }

    LaunchedEffect(insEl, visible) {
        val el = insEl ?: return@LaunchedEffect
        val liveCfg = AdConfig.currentConfig()
        el.setAttribute("data-ad-client", liveCfg.publisherId)
        el.setAttribute("data-ad-slot", liveCfg.slotIdFor(slotKey))
        el.setAttribute("data-ad-placement", slotKey.placementName)
        if (liveCfg.testMode && !isExporting) {
            el.setAttribute("data-adtest", "on")
        } else {
            el.removeAttribute("data-adtest")
        }
        if (visible) {
            AdConfig.pushSlotOnce(el, slotKey)
        }
    }

    Div(
        modifier
            .id(id)
            .pointerEvents(if (visible && id == "continue-ad-overlay") PointerEvents.Auto else PointerEvents.None)
            .overflow(Overflow.Hidden)
            .styleModifier {
                property("position", if (id == "continue-ad-overlay") "relative" else "absolute")
                property("visibility", if (visible) "visible" else "hidden")
                property("opacity", if (visible) "1" else "0")
                if (!visible) property("pointer-events", "none")
            }
            .toAttrs {
                ref { el ->
                    host = el
                    applyState(el, visible)
                    onDispose {
                        if (host === el) host = null
                    }
                }
            }
    ) {
        SponsoredFallbackCard(badge = badge, title = title, body = body, compact = id == "garage-ad-overlay")

        TagElement<HTMLElement>(
            tagName = "ins",
            applyAttrs = Modifier
                .fillMaxSize()
                .styleModifier {
                    property("display", "block")
                    property("position", "absolute")
                    property("top", "0px")
                    property("left", "0px")
                    property("width", "100%")
                    property("height", "100%")
                    property("background", "transparent")
                }
                .toAttrs {
                    classes("adsbygoogle")
                    attr("data-ad-client", adConfig.publisherId)
                    attr("data-ad-slot", adConfig.slotIdFor(slotKey))
                    attr("data-ad-placement", slotKey.placementName)
                    if (adConfig.testMode && !isExporting) attr("data-adtest", "on")
                    ref { el ->
                        insEl = el
                        onIns(el)
                        val liveCfg = AdConfig.currentConfig()
                        el.setAttribute("data-ad-client", liveCfg.publisherId)
                        el.setAttribute("data-ad-slot", liveCfg.slotIdFor(slotKey))
                        el.setAttribute("data-ad-placement", slotKey.placementName)
                        if (liveCfg.testMode && !isExporting) {
                            el.setAttribute("data-adtest", "on")
                        } else {
                            el.removeAttribute("data-adtest")
                        }
                        onDispose {
                            if (insEl === el) insEl = null
                            onIns(null)
                        }
                    }
                },
            content = null
        )
    }
}
