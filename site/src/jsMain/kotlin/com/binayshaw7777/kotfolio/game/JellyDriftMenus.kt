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
import org.jetbrains.compose.web.attributes.InputType
import org.jetbrains.compose.web.attributes.maxLength
import org.jetbrains.compose.web.css.LineStyle
import org.jetbrains.compose.web.css.Position
import org.jetbrains.compose.web.css.cssRem
import org.jetbrains.compose.web.css.px
import org.jetbrains.compose.web.css.rgba
import org.jetbrains.compose.web.dom.Div
import org.jetbrains.compose.web.dom.Input
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
    "akina_forest" to "Mt. Akina",
)

private val TRACK_SUBTITLES = mapOf(
    "sunny_coast" to "Coastal GP circuit",
    "canyon_loop" to "Red-rock GP circuit",
    "neon_circuit" to "Midnight expressway",
    "akina_forest" to "Forest mountain touge",
)

private val DIFFICULTIES = listOf(
    Triple(Difficulty.EASY, "Easy", "Street"),
    Triple(Difficulty.MEDIUM, "Medium", "Touge"),
    Triple(Difficulty.HARD, "Hard", "Akina Legend"),
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
            .padding(topBottom = 0.65.cssRem, leftRight = 1.1.cssRem)
            .borderRadius(12.px)
            .backgroundColor(if (accent) ACCENT_YELLOW else CARD_BG)
            .border(1.px, LineStyle.Solid, if (accent) ACCENT_YELLOW else rgba(255, 255, 255, 0.18f))
            .pointerEvents(PointerEvents.Auto)
            .cursor(if (enabled) Cursor.Pointer else Cursor.NotAllowed)
            .styleModifier {
                property("box-sizing", "border-box")
                property("letter-spacing", "0.04em")
                if (accent && enabled) property("box-shadow", "0 8px 24px rgba(243,219,91,0.28)")
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
    fill: Boolean = false,
) {
    val currentOnSelect = rememberUpdatedState(onSelect)
    Div(
        (if (fill) Modifier.fillMaxWidth() else Modifier.width(widthPx.px))
            .padding(topBottom = 9.px, leftRight = 10.px)
            .borderRadius(12.px)
            .backgroundColor(if (selected) rgba(243, 219, 91, 0.13f) else CARD_BG)
            .border(1.5.px, LineStyle.Solid, if (selected) ACCENT_YELLOW else rgba(255, 255, 255, 0.10f))
            .pointerEvents(PointerEvents.Auto)
            .cursor(Cursor.Pointer)
            .styleModifier {
                property("display", "flex")
                property("flex-direction", "column")
                property("justify-content", "center")
                property("align-items", "center")
                property("gap", "2px")
                property("min-height", "38px")
                property("box-sizing", "border-box")
                property("text-align", "center")
                property("user-select", "none")
                property("touch-action", "none")
                property("transition", "background 120ms, border-color 120ms, transform 120ms")
                if (selected) property("box-shadow", "0 0 0 3px rgba(243,219,91,0.12), 0 6px 18px rgba(243,219,91,0.10)")
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
        Div(Modifier.toAttrs()) {
            SpanText(
                label,
                modifier = Modifier
                    .fontFamily(Fonts.Space_Grotesk)
                    .fontSize(0.86.cssRem)
                    .fontWeight(FontWeight.Bold)
                    .color(if (selected) ACCENT_YELLOW else Colors.White)
                    .textAlign(TextAlign.Center)
            )
        }
        if (subtitle != null) {
            Div(Modifier.toAttrs()) {
                SpanText(
                    subtitle,
                    modifier = Modifier
                        .fontFamily(Fonts.DM_SANS)
                        .fontSize(0.68.cssRem)
                        .color(Color.rgb(0x9AA6B8))
                        .textAlign(TextAlign.Center)
                )
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Div(
        Modifier
            .margin(bottom = 2.px)
            .toAttrs()
    ) {
        SpanText(
            text,
            modifier = Modifier
                .fontFamily(Fonts.Space_Grotesk)
                .fontSize(0.70.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(Color.rgb(0x8793A6))
                .styleModifier { property("letter-spacing", "0.18em") }
        )
    }
}

@Composable
private fun CardGrid(cols: Int, content: @Composable () -> Unit) {
    Div(
        Modifier
            .fillMaxWidth()
            .styleModifier {
                property("display", "grid")
                property("grid-template-columns", "repeat($cols, minmax(0, 1fr))")
                property("gap", "8px")
            }
            .toAttrs()
    ) {
        content()
    }
}

@Composable
private fun StatBar(label: String, value: Double) {
    val fillPct = ((value / 10.0) * 100.0).toInt().coerceIn(0, 100)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .gap(8.px),
        verticalAlignment = Alignment.CenterVertically
    ) {
        SpanText(
            label,
            modifier = Modifier
                .width(58.px)
                .fontFamily(Fonts.DM_SANS)
                .fontSize(0.70.cssRem)
                .color(Color.rgb(0x9AA6B8))
        )
        Div(
            Modifier
                .height(6.px)
                .borderRadius(3.px)
                .backgroundColor(rgba(255, 255, 255, 0.10f))
                .overflow(Overflow.Hidden)
                .styleModifier { property("flex", "1") }
                .toAttrs()
        ) {
            Div(
                Modifier
                    .height(6.px)
                    .borderRadius(3.px)
                    .styleModifier {
                        property("width", "$fillPct%")
                        property("background", "linear-gradient(90deg, #F3DB5B, #FFB020)")
                    }
                    .toAttrs()
            )
        }
    }
}

@Composable
private fun CarStatsPanel(carId: String) {
    val stats = CAR_STATS[carId] ?: return
    Div(
        Modifier
            .fillMaxWidth()
            .padding(topBottom = 10.px, leftRight = 12.px)
            .borderRadius(12.px)
            .backgroundColor(rgba(255, 255, 255, 0.04f))
            .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.08f))
            .styleModifier {
                property("display", "grid")
                property("grid-template-columns", "repeat(2, minmax(0, 1fr))")
                property("gap", "8px 16px")
                property("box-sizing", "border-box")
            }
            .toAttrs()
    ) {
        for (i in STAT_LABELS.indices) {
            StatBar(STAT_LABELS[i], stats[i])
        }
    }
}

@Composable
private fun ControlsHint() {
    Div(Modifier.fillMaxWidth().toAttrs()) {
        SpanText(
            "WASD / Arrows drive  ·  Space handbrake  ·  C camera  ·  Esc pause",
            modifier = Modifier
                .fontFamily(Fonts.DM_SANS)
                .fontSize(0.66.cssRem)
                .color(Color.rgb(0x7C8799))
                .textAlign(TextAlign.Center)
        )
    }
}

@Composable
fun GarageMenu(
    snapshot: JellyDriftSnapshot,
    bridge: JellyDriftBridge,
) {
    Div(
        Modifier
            .position(Position.Absolute)
            .top(52.px)
            .left(16.px)
            .bottom(118.px)
            .width(380.px)
            .borderRadius(20.px)
            .backgroundColor(rgba(9, 13, 21, 0.80f))
            .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.14f))
            .pointerEvents(PointerEvents.Auto)
            .styleModifier {
                property("max-width", "calc(100vw - 32px)")
                property("display", "flex")
                property("flex-direction", "column")
                property("overflow", "hidden")
                property("box-sizing", "border-box")
                property("backdrop-filter", "blur(16px)")
                property("-webkit-backdrop-filter", "blur(16px)")
                property("box-shadow", "0 22px 70px rgba(0,0,0,0.55)")
            }
            .toAttrs { attr("data-testid", "garage-panel") }
    ) {
        // Scrollable body
        Div(
            Modifier
                .padding(topBottom = 16.px, leftRight = 16.px)
                .styleModifier {
                    property("flex", "1 1 auto")
                    property("min-height", "0")
                    property("overflow-y", "auto")
                    property("display", "flex")
                    property("flex-direction", "column")
                    property("gap", "14px")
                    property("scrollbar-width", "thin")
                    property("scrollbar-color", "rgba(255,255,255,0.25) transparent")
                }
                .toAttrs()
        ) {
            Div(Modifier.toAttrs()) {
                Div(Modifier.toAttrs()) {
                    SpanText(
                        "JELLY DRIFT 3D",
                        modifier = Modifier
                            .fontFamily(Fonts.Space_Grotesk)
                            .fontSize(1.55.cssRem)
                            .fontWeight(FontWeight.Bold)
                            .color(ACCENT_YELLOW)
                            .styleModifier {
                                property("letter-spacing", "0.04em")
                                property("text-shadow", "0 4px 24px rgba(243,219,91,0.30)")
                            }
                    )
                }
                Div(Modifier.margin(top = 3.px).toAttrs()) {
                    SpanText(
                        "Mountain-pass touge. Handbrake into hairpins, chain drifts to multiply your score.",
                        modifier = Modifier
                            .fontFamily(Fonts.DM_SANS)
                            .fontSize(0.76.cssRem)
                            .color(Color.rgb(0xA3AEC0))
                    )
                }
            }

            Div(Modifier.toAttrs()) {
                SectionLabel("CIRCUIT")
                CardGrid(2) {
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
                            fill = true,
                        )
                    }
                }
            }

            Div(Modifier.toAttrs()) {
                SectionLabel("JELLY CAR")
                CardGrid(2) {
                    for ((id, label) in CARS) {
                        SelectCard(
                            testId = "car-$id",
                            attrName = "data-car-id",
                            value = id,
                            label = label,
                            selected = snapshot.carId == id,
                            onSelect = { bridge.selectCar(id) },
                            widthPx = 104,
                            fill = true,
                        )
                    }
                }
                Div(Modifier.height(8.px).toAttrs())
                CarStatsPanel(snapshot.carId)
            }

            Div(Modifier.toAttrs()) {
                SectionLabel("MODE")
                CardGrid(2) {
                    for ((mode, label) in MODES) {
                        SelectCard(
                            testId = "mode-${mode.name}",
                            attrName = "data-mode-id",
                            value = mode.name,
                            label = label,
                            selected = snapshot.mode == mode,
                            onSelect = { bridge.selectMode(mode) },
                            widthPx = 112,
                            fill = true,
                        )
                    }
                }
            }

            Div(Modifier.toAttrs()) {
                SectionLabel("DIFFICULTY")
                CardGrid(3) {
                    for ((diff, label, sub) in DIFFICULTIES) {
                        SelectCard(
                            testId = "diff-${diff.name}",
                            attrName = "data-difficulty-id",
                            value = diff.name,
                            label = label,
                            selected = snapshot.difficulty == diff,
                            onSelect = { bridge.selectDifficulty(diff) },
                            widthPx = 94,
                            subtitle = sub,
                            fill = true,
                        )
                    }
                }
            }
        }

        // Pinned footer with primary actions
        Div(
            Modifier
                .padding(topBottom = 12.px, leftRight = 16.px)
                .backgroundColor(rgba(6, 9, 15, 0.55f))
                .styleModifier {
                    property("flex", "0 0 auto")
                    property("border-top", "1px solid rgba(255,255,255,0.10)")
                    property("display", "flex")
                    property("flex-direction", "column")
                    property("gap", "8px")
                }
                .toAttrs()
        ) {
            GameButton(
                testId = "start-race-btn",
                label = "START RACE",
                onClick = { bridge.startRace(snapshot.trackId, snapshot.carId, snapshot.mode, snapshot.difficulty) },
                accent = true,
                fontSizeRem = 1.0,
                modifier = Modifier.fillMaxWidth().padding(topBottom = 4.px),
            )
            GameButton(
                testId = "open-mp-btn",
                label = if (snapshot.mp.inRoom) "ROOM ${snapshot.mp.roomCode}" else "MULTIPLAYER  (2-4 PLAYERS)",
                onClick = { bridge.mpOpenLobby() },
                accent = false,
                fontSizeRem = 0.84,
                modifier = Modifier.fillMaxWidth(),
            )
            ControlsHint()
        }
    }
}

@Composable
fun MultiplayerLobbyModal(
    snapshot: JellyDriftSnapshot,
    bridge: JellyDriftBridge,
) {
    val mp = snapshot.mp
    var callsignDraft by remember { mutableStateOf(mp.callsign.ifBlank { "Racer" }) }
    var joinCodeDraft by remember { mutableStateOf("") }
    var copied by remember { mutableStateOf(false) }

    LaunchedEffect(mp.open) {
        if (mp.open && mp.callsign.isNotBlank()) {
            callsignDraft = mp.callsign
        }
    }

    LaunchedEffect(copied) {
        if (copied) {
            delay(1800)
            copied = false
        }
    }

    Div(
        Modifier
            .position(Position.Absolute)
            .top(0.px).left(0.px).right(0.px).bottom(0.px)
            .backgroundColor(rgba(6, 10, 16, 0.72f))
            .pointerEvents(PointerEvents.Auto)
            .styleModifier {
                property("display", "flex")
                property("align-items", "center")
                property("justify-content", "center")
                property("padding", "14px")
            }
            .toAttrs { attr("data-testid", "mp-lobby-modal") }
    ) {
        Column(
            modifier = Modifier
                .width(540.px)
                .padding(18.px)
                .gap(10.px)
                .borderRadius(16.px)
                .backgroundColor(MODAL_BG)
                .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.2f))
                .styleModifier {
                    property("max-width", "calc(100vw - 24px)")
                    property("max-height", "calc(100vh - 28px)")
                    property("overflow-y", "auto")
                    property("box-shadow", "0 24px 80px rgba(0,0,0,0.65)")
                },
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (!mp.inRoom) {
                SpanText(
                    "ONLINE TOUGE MULTIPLAYER",
                    modifier = Modifier
                        .fontFamily(Fonts.Space_Grotesk)
                        .fontSize(1.35.cssRem)
                        .fontWeight(FontWeight.Bold)
                        .color(ACCENT_YELLOW)
                )
                SpanText(
                    "Race 2–4 players live via WebRTC P2P + Firebase.",
                    modifier = Modifier
                        .fontFamily(Fonts.DM_SANS)
                        .fontSize(0.78.cssRem)
                        .color(Colors.LightGray)
                        .textAlign(TextAlign.Center)
                )

                SectionLabel("DRIVER CALLSIGN")
                Row(
                    modifier = Modifier.gap(8.px).fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Input(
                        type = InputType.Text,
                        attrs = Modifier
                            .width(210.px)
                            .padding(topBottom = 8.px, leftRight = 10.px)
                            .borderRadius(8.px)
                            .backgroundColor(CARD_BG)
                            .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.22f))
                            .color(Colors.White)
                            .fontFamily(Fonts.Space_Grotesk)
                            .fontSize(0.86.cssRem)
                            .toAttrs {
                                attr("data-testid", "mp-callsign-input")
                                maxLength(16)
                                value(callsignDraft)
                                onInput { evt ->
                                    callsignDraft = evt.value
                                }
                                onChange { evt ->
                                    val v = evt.value
                                    callsignDraft = v
                                    if (v.trim().isNotEmpty()) bridge.mpSetCallsign(v)
                                }
                            }
                    )
                }

                Div(Modifier.height(2.px).toAttrs())
                Row(
                    modifier = Modifier.gap(8.px).styleModifier {
                        property("flex-wrap", "wrap")
                        property("justify-content", "center")
                    },
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    GameButton(
                        testId = "mp-quick-match-btn",
                        label = if (mp.connecting) "CONNECTING..." else "QUICK MATCH (PUBLIC)",
                        onClick = {
                            if (callsignDraft.isNotBlank()) bridge.mpSetCallsign(callsignDraft)
                            bridge.mpQuickMatch()
                        },
                        accent = true,
                        enabled = !mp.connecting,
                        modifier = Modifier.width(220.px)
                    )
                    GameButton(
                        testId = "mp-create-room-btn",
                        label = "HOST PRIVATE ROOM",
                        onClick = {
                            if (callsignDraft.isNotBlank()) bridge.mpSetCallsign(callsignDraft)
                            bridge.mpCreateRoom()
                        },
                        accent = false,
                        enabled = !mp.connecting,
                        modifier = Modifier.width(210.px)
                    )
                }

                Div(Modifier.height(2.px).toAttrs())
                SectionLabel("JOIN BY ROOM CODE")
                Row(
                    modifier = Modifier.gap(8.px),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Input(
                        type = InputType.Text,
                        attrs = Modifier
                            .width(128.px)
                            .padding(topBottom = 8.px, leftRight = 10.px)
                            .borderRadius(8.px)
                            .backgroundColor(CARD_BG)
                            .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.22f))
                            .color(ACCENT_YELLOW)
                            .fontFamily(Fonts.Space_Grotesk)
                            .fontSize(0.95.cssRem)
                            .fontWeight(FontWeight.Bold)
                            .textAlign(TextAlign.Center)
                            .styleModifier { property("letter-spacing", "0.18em") }
                            .toAttrs {
                                attr("data-testid", "mp-room-code-input")
                                attr("placeholder", "ABCD")
                                maxLength(8)
                                value(joinCodeDraft)
                                onInput { evt ->
                                    joinCodeDraft = evt.value.uppercase().filter { it.isLetterOrDigit() }.take(8)
                                }
                            }
                    )
                    GameButton(
                        testId = "mp-join-room-btn",
                        label = "JOIN ROOM",
                        onClick = {
                            if (callsignDraft.isNotBlank()) bridge.mpSetCallsign(callsignDraft)
                            bridge.mpJoinRoom(joinCodeDraft)
                        },
                        accent = false,
                        enabled = !mp.connecting && joinCodeDraft.length >= 4,
                        modifier = Modifier.width(136.px)
                    )
                }

                if (mp.errorText.isNotBlank()) {
                    SpanText(
                        mp.errorText,
                        modifier = Modifier
                            .fontFamily(Fonts.DM_SANS)
                            .fontSize(0.76.cssRem)
                            .color(Color.rgb(0xFF6B6B))
                            .textAlign(TextAlign.Center)
                    )
                } else if (mp.statusText.isNotBlank()) {
                    SpanText(
                        mp.statusText,
                        modifier = Modifier
                            .fontFamily(Fonts.DM_SANS)
                            .fontSize(0.76.cssRem)
                            .color(Color.rgb(0x38BDF8))
                            .textAlign(TextAlign.Center)
                    )
                }

                GameButton(
                    testId = "mp-close-btn",
                    label = "BACK TO SOLO GARAGE",
                    onClick = { bridge.mpCloseLobby() },
                    fontSizeRem = 0.78,
                    modifier = Modifier.width(220.px)
                )
            } else {
                // Active Room Lobby
                Row(
                    modifier = Modifier.fillMaxWidth().styleModifier {
                        property("justify-content", "space-between")
                        property("align-items", "center")
                        property("flex-wrap", "wrap")
                    },
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(horizontalAlignment = Alignment.Start) {
                        SpanText(
                            "ROOM ${mp.roomCode}",
                            modifier = Modifier
                                .fontFamily(Fonts.Space_Grotesk)
                                .fontSize(1.25.cssRem)
                                .fontWeight(FontWeight.Bold)
                                .color(ACCENT_YELLOW)
                                .styleModifier { property("letter-spacing", "0.1em") }
                        )
                        SpanText(
                            "${if (mp.isPublic) "Public" else "Private"} · ${mp.players.size}/4 Racers · ${mp.transport.uppercase()}",
                            modifier = Modifier
                                .fontFamily(Fonts.DM_SANS)
                                .fontSize(0.72.cssRem)
                                .color(Colors.LightGray)
                        )
                    }
                    GameButton(
                        testId = "mp-copy-link-btn",
                        label = if (copied) "LINK COPIED!" else "COPY INVITE LINK",
                        onClick = {
                            val url = "${window.location.origin}/drift?room=${mp.roomCode}"
                            runCatching {
                                window.navigator.asDynamic().clipboard?.writeText(url)
                            }
                            copied = true
                        },
                        fontSizeRem = 0.72,
                        modifier = Modifier.width(156.px)
                    )
                }

                // 4 Grid Slots
                Column(
                    modifier = Modifier.fillMaxWidth().gap(5.px),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    for (slotIdx in 0 until 4) {
                        val player = mp.players.firstOrNull { it.slot == slotIdx }
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(topBottom = 6.px, leftRight = 10.px)
                                .borderRadius(8.px)
                                .backgroundColor(if (player?.isMe == true) Color.rgb(0x1E293B) else CARD_BG)
                                .border(
                                    1.px,
                                    LineStyle.Solid,
                                    if (player?.isMe == true) ACCENT_YELLOW else rgba(255, 255, 255, 0.12f)
                                )
                                .styleModifier {
                                    property("justify-content", "space-between")
                                    property("align-items", "center")
                                },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (player != null) {
                                val carName = CARS.firstOrNull { it.first == player.carId }?.second ?: player.carId
                                val tags = buildList {
                                    if (player.isHost) add("HOST")
                                    if (player.isMe) add("YOU")
                                }.joinToString(" · ")
                                val prefix = if (tags.isNotEmpty()) " [$tags]" else ""
                                SpanText(
                                    "P${slotIdx + 1} · ${player.name}$prefix",
                                    modifier = Modifier
                                        .fontFamily(Fonts.Space_Grotesk)
                                        .fontSize(0.78.cssRem)
                                        .fontWeight(FontWeight.Bold)
                                        .color(Colors.White)
                                )
                                SpanText(
                                    "$carName · ${player.transport.uppercase()} · ${if (player.ready) "READY" else "WAIT"}",
                                    modifier = Modifier
                                        .fontFamily(Fonts.DM_SANS)
                                        .fontSize(0.70.cssRem)
                                        .color(if (player.ready) Color.rgb(0x4ADE80) else ACCENT_YELLOW)
                                )
                            } else {
                                SpanText(
                                    "P${slotIdx + 1} · Open Grid Slot",
                                    modifier = Modifier
                                        .fontFamily(Fonts.DM_SANS)
                                        .fontSize(0.74.cssRem)
                                        .color(rgba(255, 255, 255, 0.35f))
                                )
                            }
                        }
                    }
                }

                SectionLabel("YOUR CAR")
                Row(
                    modifier = Modifier.gap(6.px).styleModifier {
                        property("flex-wrap", "wrap")
                        property("justify-content", "center")
                    },
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    for ((id, label) in CARS) {
                        SelectCard(
                            testId = "mp-car-$id",
                            attrName = "data-mp-car-id",
                            value = id,
                            label = label,
                            selected = snapshot.carId == id,
                            onSelect = { bridge.selectCar(id) },
                            widthPx = 104,
                        )
                    }
                }

                SectionLabel(if (mp.isHost) "ROOM SETTINGS (HOST)" else "ROOM SETTINGS")
                if (mp.isHost) {
                    Row(
                        modifier = Modifier.gap(6.px).styleModifier {
                            property("flex-wrap", "wrap")
                            property("justify-content", "center")
                        },
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        for ((id, label) in TRACKS) {
                            SelectCard(
                                testId = "mp-track-$id",
                                attrName = "data-mp-track-id",
                                value = id,
                                label = label,
                                selected = mp.trackId == id,
                                onSelect = { bridge.selectTrack(id) },
                                widthPx = 104,
                            )
                        }
                    }
                    Row(
                        modifier = Modifier.gap(8.px).styleModifier {
                            property("flex-wrap", "wrap")
                            property("justify-content", "center")
                        },
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        for ((mode, label) in MODES) {
                            SelectCard(
                                testId = "mp-mode-${mode.name}",
                                attrName = "data-mp-mode-id",
                                value = mode.name,
                                label = if (mode == GameMode.DRIFT_RUSH) "$label (60s)" else "$label (3L)",
                                selected = mp.mode == mode.name,
                                onSelect = { bridge.selectMode(mode) },
                                widthPx = 132,
                            )
                        }
                        GameButton(
                            testId = "mp-collisions-btn",
                            label = if (mp.collisions) "COLLISIONS: CONTACT" else "COLLISIONS: GHOST",
                            onClick = { bridge.mpToggleCollisions() },
                            accent = mp.collisions,
                            fontSizeRem = 0.74,
                            modifier = Modifier.width(188.px)
                        )
                    }
                } else {
                    val trackName = TRACKS.firstOrNull { it.first == mp.trackId }?.second ?: mp.trackId
                    val modeName = if (mp.mode == "DRIFT_RUSH") "Drift Rush (60s)" else "Grand Prix (3 Laps)"
                    val colText = if (mp.collisions) "Contact (OBB)" else "Ghost (No Contact)"
                    SpanText(
                        "$trackName · $modeName · $colText",
                        modifier = Modifier
                            .fontFamily(Fonts.Space_Grotesk)
                            .fontSize(0.78.cssRem)
                            .color(Colors.White)
                            .textAlign(TextAlign.Center)
                    )
                }

                if (mp.errorText.isNotBlank()) {
                    SpanText(
                        mp.errorText,
                        modifier = Modifier
                            .fontFamily(Fonts.DM_SANS)
                            .fontSize(0.75.cssRem)
                            .color(Color.rgb(0xFF6B6B))
                            .textAlign(TextAlign.Center)
                    )
                }

                Row(
                    modifier = Modifier.gap(10.px),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (mp.isHost) {
                        GameButton(
                            testId = "mp-start-race-btn",
                            label = if (mp.players.size >= 2) "START ONLINE RACE" else "WAITING FOR RACERS...",
                            onClick = { bridge.mpStartRace() },
                            accent = true,
                            enabled = mp.players.size >= 2,
                            fontSizeRem = 0.85,
                            modifier = Modifier.width(220.px)
                        )
                    } else {
                        val meReady = mp.players.firstOrNull { it.isMe }?.ready ?: true
                        GameButton(
                            testId = "mp-ready-btn",
                            label = if (meReady) "READY ✓" else "MARK READY",
                            onClick = { bridge.mpSetReady(!meReady) },
                            accent = meReady,
                            fontSizeRem = 0.85,
                            modifier = Modifier.width(180.px)
                        )
                    }
                    GameButton(
                        testId = "mp-leave-btn",
                        label = "LEAVE ROOM",
                        onClick = { bridge.mpLeaveRoom() },
                        fontSizeRem = 0.80,
                        modifier = Modifier.width(146.px)
                    )
                }
            }
        }
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
            .borderRadius(20.px)
            .backgroundColor(rgba(9, 13, 21, 0.86f))
            .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.16f))
            .pointerEvents(PointerEvents.Auto)
            .styleModifier {
                property("backdrop-filter", "blur(16px)")
                property("box-shadow", "0 24px 80px rgba(0,0,0,0.55)")
            },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        content()
    }
}

@Composable
fun PauseMenu(
    snapshot: JellyDriftSnapshot,
    bridge: JellyDriftBridge,
) {
    val isOnline = snapshot.mp.inRoom
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
            if (isOnline) "Live online race in progress — remote cars keep moving!" else "Take a breath. The clock is frozen.",
            modifier = Modifier
                .fontFamily(Fonts.DM_SANS)
                .fontSize(0.85.cssRem)
                .color(Colors.LightGray)
                .textAlign(TextAlign.Center)
        )
        GameButton("resume-btn", "RESUME", { bridge.resume() }, accent = true, modifier = Modifier.width(240.px))
        if (!isOnline) {
            GameButton("restart-race-btn", "RESTART RACE", { bridge.restartRace() }, modifier = Modifier.width(240.px))
            GameButton("back-garage-btn", "BACK TO GARAGE", { bridge.returnToGarage() }, modifier = Modifier.width(240.px))
        } else {
            GameButton("mp-leave-btn", "LEAVE ONLINE ROOM", { bridge.mpLeaveRoom() }, modifier = Modifier.width(240.px))
        }
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
                title = "TOUGE PIT SERVICE",
                body = "+20s Bonus Clock & Fresh Touge Tires",
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
        val isOnline = snapshot.mp.inRoom
        SpanText(
            if (isOnline) {
                if (snapshot.position <= 1) "ONLINE VICTORY!" else "P${snapshot.position} FINISH"
            } else {
                if (snapshot.position <= 1) "1V1 VICTORY" else "RIVAL WINS"
            },
            modifier = Modifier
                .fontFamily(Fonts.Space_Grotesk)
                .fontSize(1.55.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(ACCENT_YELLOW)
        )
        if (isOnline) {
            Column(
                modifier = Modifier.fillMaxWidth().gap(4.px),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                for (p in snapshot.mp.players.sortedBy { it.position }) {
                    val carName = CARS.firstOrNull { it.first == p.carId }?.second ?: p.carId
                    val statusTag = when {
                        snapshot.mode == GameMode.DRIFT_RUSH -> "${p.driftScore} pts"
                        p.finishedAtMs > 0L -> "FINISHED"
                        else -> "RACING"
                    }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(topBottom = 5.px, leftRight = 8.px)
                            .borderRadius(6.px)
                            .backgroundColor(if (p.isMe) Color.rgb(0x1E293B) else CARD_BG)
                            .styleModifier { property("justify-content", "space-between") },
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        SpanText(
                            "#${p.position} ${p.name}",
                            modifier = Modifier
                                .fontFamily(Fonts.Space_Grotesk)
                                .fontSize(0.76.cssRem)
                                .fontWeight(FontWeight.Bold)
                                .color(if (p.isMe) ACCENT_YELLOW else Colors.White)
                        )
                        SpanText(
                            "$carName · $statusTag",
                            modifier = Modifier
                                .fontFamily(Fonts.DM_SANS)
                                .fontSize(0.70.cssRem)
                                .color(Colors.LightGray)
                        )
                    }
                }
            }
            Div(Modifier.height(4.px).toAttrs())
            GameButton(
                "mp-lobby-return-btn",
                if (snapshot.mp.isHost) "BACK TO ROOM LOBBY" else "WAIT FOR HOST / LOBBY",
                { bridge.mpReturnToLobby() },
                accent = true,
                modifier = Modifier.width(240.px)
            )
            GameButton("mp-leave-btn", "LEAVE ROOM", { bridge.mpLeaveRoom() }, modifier = Modifier.width(240.px))
        } else {
            val gap = snapshot.rivalGapMeters.toInt()
            val gapStr = "${if (gap >= 0) "+$gap" else "$gap"}m"
            SpanText(
                "Position ${snapshot.position} of ${snapshot.aiCount + 1} ($gapStr vs ${snapshot.rivalName})",
                modifier = Modifier
                    .fontFamily(Fonts.Space_Grotesk)
                    .fontSize(1.0.cssRem)
                    .fontWeight(FontWeight.Bold)
                    .color(Colors.White)
            )
            val bestPart = if (snapshot.bestLapSec > 0.0) " · Best ${formatLapTime(snapshot.bestLapSec)}" else ""
            SpanText(
                "Drift score ${snapshot.driftScore}$bestPart · ${snapshot.difficulty.name.lowercase().replaceFirstChar { it.uppercase() }} · ${snapshot.totalLaps} laps · ${snapshot.trackId.replace('_', ' ')}",
                modifier = Modifier
                    .fontFamily(Fonts.DM_SANS)
                    .fontSize(0.8.cssRem)
                    .color(Colors.LightGray)
                    .textAlign(TextAlign.Center)
            )
            Div(Modifier.height(4.px).toAttrs())
            GameButton("restart-race-btn", "REMATCH", { bridge.restartRace() }, accent = true, modifier = Modifier.width(240.px))
            GameButton("back-garage-btn", "BACK TO GARAGE", { bridge.returnToGarage() }, modifier = Modifier.width(240.px))
        }
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
