package com.binayshaw7777.kotfolio.game

import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import com.binayshaw7777.kotfolio.utils.Res
import com.varabyte.kobweb.compose.css.Cursor
import com.varabyte.kobweb.compose.css.FontWeight
import com.varabyte.kobweb.compose.css.PointerEvents
import com.varabyte.kobweb.compose.css.TextAlign
import com.varabyte.kobweb.compose.foundation.layout.Column
import com.varabyte.kobweb.compose.foundation.layout.Row
import com.varabyte.kobweb.compose.ui.Alignment
import com.varabyte.kobweb.compose.ui.Modifier
import com.varabyte.kobweb.compose.ui.graphics.Color
import com.varabyte.kobweb.compose.ui.graphics.Colors
import com.varabyte.kobweb.compose.ui.modifiers.*
import com.varabyte.kobweb.compose.ui.styleModifier
import com.varabyte.kobweb.compose.ui.toAttrs
import com.varabyte.kobweb.silk.components.text.SpanText
import kotlinx.browser.document
import kotlinx.browser.window
import org.jetbrains.compose.web.css.LineStyle
import org.jetbrains.compose.web.css.Position
import org.jetbrains.compose.web.css.cssRem
import org.jetbrains.compose.web.css.px
import org.jetbrains.compose.web.css.rgba
import org.jetbrains.compose.web.dom.Div
import org.w3c.dom.Element
import org.w3c.dom.events.EventListener
import kotlin.math.abs

private val ACCENT = Color.rgb(0xF3DB5B)
private val GAP_AHEAD = Color.rgb(0x4ADE80)
private val GAP_BEHIND = Color.rgb(0xFF6B6B)

internal fun formatSeconds(seconds: Double): String {
    val safe = if (seconds.isFinite() && seconds > 0.0) seconds else 0.0
    val whole = safe.toInt()
    val minutes = whole / 60
    val rest = whole % 60
    return "$minutes:${if (rest < 10) "0$rest" else "$rest"}"
}

internal fun formatLapTime(seconds: Double): String {
    val safe = if (seconds.isFinite() && seconds > 0.0) seconds else 0.0
    val tenthsTotal = (safe * 10.0).toInt()
    val mins = tenthsTotal / 600
    val secs = (tenthsTotal / 10) % 60
    val tenths = tenthsTotal % 10
    return "$mins:${if (secs < 10) "0$secs" else "$secs"}.$tenths"
}

@Composable
private fun HudIconButton(
    testId: String,
    label: String,
    ariaLabel: String,
    onClick: () -> Unit,
) {
    val currentOnClick = rememberUpdatedState(onClick)
    Div(
        Modifier
            .width(42.px)
            .height(42.px)
            .borderRadius(999.px)
            .backgroundColor(rgba(16, 22, 32, 0.85f))
            .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.22f))
            .pointerEvents(PointerEvents.Auto)
            .cursor(Cursor.Pointer)
            .styleModifier {
                property("display", "flex")
                property("align-items", "center")
                property("justify-content", "center")
                property("user-select", "none")
                property("touch-action", "none")
            }
            .toAttrs {
                attr("data-testid", testId)
                attr("role", "button")
                attr("aria-label", ariaLabel)
                attr("title", ariaLabel)
                ref { el ->
                    var lastTouchEndMs = -1000.0
                    val touchEndListener = EventListener { evt ->
                        runCatching { evt.preventDefault() }
                        lastTouchEndMs = window.performance.now()
                        currentOnClick.value.invoke()
                    }
                    val clickListener = EventListener {
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
                .fontFamily(Res.Fonts.Space_Grotesk)
                .fontSize(0.76.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(Colors.White)
        )
    }
}

@Composable
fun JellyDriftHud(
    snapshot: JellyDriftSnapshot,
    onPause: () -> Unit,
    onToggleCamera: () -> Unit,
    onToggleMute: () -> Unit,
) {
    val racing = snapshot.phase == GamePhase.COUNTDOWN ||
        snapshot.phase == GamePhase.RACING ||
        snapshot.phase == GamePhase.PAUSED ||
        snapshot.phase == GamePhase.CONTINUE_OFFER

    if (!racing) return

    Row(
        modifier = Modifier
            .position(Position.Absolute)
            .top(14.px)
            .left(14.px)
            .right(14.px)
            .styleModifier { property("justify-content", "space-between") },
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Div(
                Modifier
                    .padding(topBottom = 7.px, leftRight = 12.px)
                    .borderRadius(999.px)
                    .backgroundColor(rgba(16, 22, 32, 0.85f))
                    .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.16f))
                    .toAttrs()
            ) {
                val lapLabel = if (snapshot.mode == GameMode.DRIFT_RUSH) {
                    "LAP ${snapshot.lap}"
                } else {
                    "LAP ${snapshot.lap.coerceAtMost(snapshot.totalLaps)}/${snapshot.totalLaps}"
                }
                SpanText(
                    lapLabel,
                    modifier = Modifier
                        .fontFamily(Res.Fonts.Space_Grotesk)
                        .fontSize(0.88.cssRem)
                        .fontWeight(FontWeight.Bold)
                        .color(Colors.White)
                )
            }
            Div(
                Modifier
                    .margin(left = 8.px)
                    .padding(topBottom = 7.px, leftRight = 12.px)
                    .borderRadius(999.px)
                    .backgroundColor(rgba(16, 22, 32, 0.85f))
                    .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.16f))
                    .toAttrs()
            ) {
                SpanText(
                    "P${snapshot.position}/${snapshot.aiCount + 1}",
                    modifier = Modifier
                        .fontFamily(Res.Fonts.Space_Grotesk)
                        .fontSize(0.88.cssRem)
                        .fontWeight(FontWeight.Bold)
                        .color(ACCENT)
                )
            }
            val gap = snapshot.rivalGapMeters.toInt()
            val gapText = "VS ${snapshot.rivalName} (${snapshot.difficulty.name}) ${if (gap >= 0) "+$gap" else "$gap"}m"
            Div(
                Modifier
                    .margin(left = 8.px)
                    .padding(topBottom = 7.px, leftRight = 10.px)
                    .borderRadius(999.px)
                    .backgroundColor(rgba(16, 22, 32, 0.85f))
                    .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.14f))
                    .toAttrs()
            ) {
                SpanText(
                    gapText,
                    modifier = Modifier
                        .fontFamily(Res.Fonts.Space_Grotesk)
                        .fontSize(0.76.cssRem)
                        .fontWeight(FontWeight.Bold)
                        .color(if (gap >= 0) GAP_AHEAD else GAP_BEHIND)
                )
            }
        }

        if (snapshot.mode == GameMode.DRIFT_RUSH) {
            SpanText(
                formatSeconds(snapshot.timeRemainingSec),
                modifier = Modifier
                    .fontFamily(Res.Fonts.Space_Grotesk)
                    .fontSize(1.45.cssRem)
                    .fontWeight(FontWeight.Bold)
                    .color(if (snapshot.timeRemainingSec <= 10.0) Color.rgb(0xFF6B6B) else Colors.White)
                    .styleModifier { property("text-shadow", "0 2px 10px rgba(0,0,0,0.65)") }
            )
        } else {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                SpanText(
                    "GRAND PRIX",
                    modifier = Modifier
                        .fontFamily(Res.Fonts.Space_Grotesk)
                        .fontSize(0.92.cssRem)
                        .fontWeight(FontWeight.Bold)
                        .color(ACCENT)
                        .styleModifier { property("text-shadow", "0 2px 10px rgba(0,0,0,0.65)") }
                )
                val bestSuffix = if (snapshot.bestLapSec > 0.0) " · BEST ${formatLapTime(snapshot.bestLapSec)}" else ""
                SpanText(
                    "${formatLapTime(snapshot.lapTimeSec)}$bestSuffix",
                    modifier = Modifier
                        .fontFamily(Res.Fonts.Space_Grotesk)
                        .fontSize(0.76.cssRem)
                        .fontWeight(FontWeight.SemiBold)
                        .color(Colors.White)
                        .styleModifier { property("text-shadow", "0 2px 8px rgba(0,0,0,0.7)") }
                )
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            HudIconButton(
                testId = "camera-toggle-btn",
                label = if (snapshot.cameraMode == CameraMode.DRIVER) "DRV" else "CAM",
                ariaLabel = "Toggle Camera",
                onClick = onToggleCamera
            )
            Div(Modifier.width(8.px).height(1.px).toAttrs())
            HudIconButton(
                testId = "mute-btn",
                label = "AUD",
                ariaLabel = "Mute Audio",
                onClick = onToggleMute
            )
            Div(Modifier.width(8.px).height(1.px).toAttrs())
            HudIconButton(
                testId = "pause-btn",
                label = "II",
                ariaLabel = "Pause",
                onClick = onPause
            )
        }
    }

    // Live touge minimap (top-right)
    if (snapshot.minimapPath.isNotEmpty()) {
        MinimapOverlay(snapshot)
    }

    // Motorsport tachometer, gear badge & speed readout, bottom-left.
    val gearText = if (snapshot.gear < 0) "R" else snapshot.gear.coerceIn(1, 5).toString()
    val litSegments = (snapshot.rpmNorm * 12.0).toInt().coerceIn(0, 12)
    Div(
        Modifier
            .position(Position.Absolute)
            .left(16.px)
            .bottom(16.px)
            .padding(topBottom = 8.px, leftRight = 12.px)
            .borderRadius(12.px)
            .backgroundColor(rgba(12, 17, 25, 0.80f))
            .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.16f))
            .styleModifier { property("pointer-events", "none") }
            .toAttrs()
    ) {
        Column(horizontalAlignment = Alignment.Start) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Div(
                    Modifier
                        .width(26.px)
                        .height(26.px)
                        .borderRadius(6.px)
                        .backgroundColor(if (snapshot.gear < 0) Color.rgb(0xFF6B6B) else ACCENT)
                        .styleModifier {
                            property("display", "flex")
                            property("align-items", "center")
                            property("justify-content", "center")
                        }
                        .toAttrs()
                ) {
                    SpanText(
                        gearText,
                        modifier = Modifier
                            .fontFamily(Res.Fonts.Space_Grotesk)
                            .fontSize(0.92.cssRem)
                            .fontWeight(FontWeight.Bold)
                            .color(Colors.Black)
                    )
                }
                Div(Modifier.width(10.px).height(1.px).toAttrs())
                SpanText(
                    snapshot.speedKmh.coerceAtLeast(0.0).toInt().toString(),
                    modifier = Modifier
                        .fontFamily(Res.Fonts.Space_Grotesk)
                        .fontSize(2.1.cssRem)
                        .fontWeight(FontWeight.Bold)
                        .color(Colors.White)
                )
                SpanText(
                    "KM/H",
                    modifier = Modifier
                        .margin(left = 5.px)
                        .fontFamily(Res.Fonts.Space_Grotesk)
                        .fontSize(0.75.cssRem)
                        .fontWeight(FontWeight.Bold)
                        .color(ACCENT)
                )
            }
            Row(
                modifier = Modifier.margin(top = 5.px).gap(3.px),
                verticalAlignment = Alignment.CenterVertically
            ) {
                for (seg in 0 until 12) {
                    val segColor = when {
                        seg >= litSegments -> rgba(255, 255, 255, 0.12f)
                        seg >= 10 -> Color.rgb(0xFF2B48)
                        seg >= 7 -> ACCENT
                        else -> Color.rgb(0x22C55E)
                    }
                    Div(
                        Modifier
                            .width(9.px)
                            .height(5.px)
                            .borderRadius(2.px)
                            .backgroundColor(segColor)
                            .toAttrs()
                    )
                }
            }
        }
    }

    // Drift angle, live combo & banked score, bottom-right above the touch pad.
    Div(
        Modifier
            .position(Position.Absolute)
            .right(20.px)
            .bottom(154.px)
            .styleModifier {
                property("pointer-events", "none")
                property("text-align", "right")
            }
            .toAttrs()
    ) {
        if (snapshot.isDrifting || snapshot.driftCombo > 0) {
            val angleInt = abs(snapshot.driftAngleDeg).toInt()
            SpanText(
                "${angleInt}° · +${snapshot.driftCombo} ×${snapshot.driftMultiplier}",
                modifier = Modifier
                    .fontFamily(Res.Fonts.Space_Grotesk)
                    .fontSize(0.84.cssRem)
                    .fontWeight(FontWeight.Bold)
                    .color(ACCENT)
                    .styleModifier { property("text-shadow", "0 2px 10px rgba(0,0,0,0.75)") }
            )
        }
        Div(Modifier.toAttrs()) {
            SpanText(
                "SCORE ${snapshot.driftScore}",
                modifier = Modifier
                    .fontFamily(Res.Fonts.Space_Grotesk)
                    .fontSize(0.84.cssRem)
                    .fontWeight(FontWeight.Bold)
                    .color(Colors.White)
                    .styleModifier { property("text-shadow", "0 2px 10px rgba(0,0,0,0.75)") }
            )
        }
    }

    TouchControls(snapshot)
}

@Composable
private fun MinimapOverlay(snapshot: JellyDriftSnapshot) {
    var pathEl by remember { mutableStateOf<Element?>(null) }
    var rivalDot by remember { mutableStateOf<Element?>(null) }
    var playerDot by remember { mutableStateOf<Element?>(null) }

    SideEffect {
        pathEl?.setAttribute("d", snapshot.minimapPath)
        rivalDot?.setAttribute("cx", snapshot.rivalMapX.toString())
        rivalDot?.setAttribute("cy", snapshot.rivalMapY.toString())
        playerDot?.setAttribute("cx", snapshot.playerMapX.toString())
        playerDot?.setAttribute("cy", snapshot.playerMapY.toString())
    }

    Div(
        Modifier
            .position(Position.Absolute)
            .top(66.px)
            .right(14.px)
            .width(104.px)
            .height(104.px)
            .borderRadius(12.px)
            .backgroundColor(rgba(12, 17, 25, 0.78f))
            .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.16f))
            .styleModifier {
                property("pointer-events", "none")
                property("padding", "4px")
                property("box-sizing", "border-box")
            }
            .toAttrs {
                attr("data-testid", "touge-minimap")
                ref { host ->
                    val svgNs = "http://www.w3.org/2000/svg"
                    val svg = document.createElementNS(svgNs, "svg")
                    svg.setAttribute("viewBox", "0 0 100 100")
                    svg.setAttribute("width", "100%")
                    svg.setAttribute("height", "100%")

                    val trackOutline = document.createElementNS(svgNs, "path")
                    trackOutline.setAttribute("fill", "none")
                    trackOutline.setAttribute("stroke", "rgba(255,255,255,0.45)")
                    trackOutline.setAttribute("stroke-width", "5")
                    trackOutline.setAttribute("stroke-linecap", "round")
                    trackOutline.setAttribute("stroke-linejoin", "round")

                    val rival = document.createElementNS(svgNs, "circle")
                    rival.setAttribute("r", "4.8")
                    rival.setAttribute("fill", "#38BDF8")
                    rival.setAttribute("stroke", "#0F172A")
                    rival.setAttribute("stroke-width", "1.5")

                    val player = document.createElementNS(svgNs, "circle")
                    player.setAttribute("r", "5.5")
                    player.setAttribute("fill", "#F3DB5B")
                    player.setAttribute("stroke", "#FFFFFF")
                    player.setAttribute("stroke-width", "1.6")

                    svg.appendChild(trackOutline)
                    svg.appendChild(rival)
                    svg.appendChild(player)
                    host.appendChild(svg)

                    pathEl = trackOutline
                    rivalDot = rival
                    playerDot = player

                    onDispose {
                        pathEl = null
                        rivalDot = null
                        playerDot = null
                        if (svg.parentNode === host) {
                            host.removeChild(svg)
                        }
                    }
                }
            }
    )
}

private class TouchPad {
    var throttle = false
    var brake = false
    var left = false
    var right = false
    var drift = false
    var boost = false

    fun push(bridge: JellyDriftBridge?) {
        bridge?.setTouchInput(throttle, brake, left, right, drift, boost)
    }
}

@Composable
private fun TouchControls(snapshot: JellyDriftSnapshot) {
    if (snapshot.cameraMode == CameraMode.DRIVER) return

    val pad = remember { TouchPad() }

    @Composable
    fun padButton(
        testId: String,
        label: String,
        modifier: Modifier,
        set: (Boolean) -> Unit,
    ) {
        val currentSet = rememberUpdatedState(set)
        Div(
            modifier
                .width(58.px)
                .height(58.px)
                .borderRadius(999.px)
                .backgroundColor(rgba(18, 24, 35, 0.72f))
                .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.24f))
                .pointerEvents(PointerEvents.Auto)
                .cursor(Cursor.Pointer)
                .styleModifier {
                    property("display", "flex")
                    property("align-items", "center")
                    property("justify-content", "center")
                    property("user-select", "none")
                    property("touch-action", "none")
                }
                .toAttrs {
                    attr("data-testid", testId)
                    attr("role", "button")
                    attr("aria-label", label)
                    ref { el ->
                        val downListener = EventListener { evt ->
                            runCatching { evt.preventDefault() }
                            currentSet.value.invoke(true)
                            pad.push(TouchBridgeHolder.bridge)
                        }
                        val upListener = EventListener { evt ->
                            runCatching { evt.preventDefault() }
                            currentSet.value.invoke(false)
                            pad.push(TouchBridgeHolder.bridge)
                        }
                        el.addEventListener("touchstart", downListener)
                        el.addEventListener("touchend", upListener)
                        el.addEventListener("touchcancel", upListener)
                        el.addEventListener("pointerdown", downListener)
                        el.addEventListener("pointerup", upListener)
                        el.addEventListener("pointercancel", upListener)
                        el.addEventListener("pointerleave", upListener)
                        el.addEventListener("mousedown", downListener)
                        el.addEventListener("mouseup", upListener)
                        el.addEventListener("mouseleave", upListener)
                        onDispose {
                            currentSet.value.invoke(false)
                            pad.push(TouchBridgeHolder.bridge)
                            el.removeEventListener("touchstart", downListener)
                            el.removeEventListener("touchend", upListener)
                            el.removeEventListener("touchcancel", upListener)
                            el.removeEventListener("pointerdown", downListener)
                            el.removeEventListener("pointerup", upListener)
                            el.removeEventListener("pointercancel", upListener)
                            el.removeEventListener("pointerleave", upListener)
                            el.removeEventListener("mousedown", downListener)
                            el.removeEventListener("mouseup", upListener)
                            el.removeEventListener("mouseleave", upListener)
                        }
                    }
                }
        ) {
            SpanText(
                label,
                modifier = Modifier
                    .fontFamily(Res.Fonts.Space_Grotesk)
                    .fontSize(0.95.cssRem)
                    .fontWeight(FontWeight.Bold)
                    .color(Colors.White)
                    .textAlign(TextAlign.Center)
            )
        }
    }

    // Steering, bottom-left (above speedometer)
    padButton("touch-left", "◀", Modifier.position(Position.Absolute).left(14.px).bottom(76.px)) { pad.left = it }
    padButton("touch-right", "▶", Modifier.position(Position.Absolute).left(80.px).bottom(76.px)) { pad.right = it }

    // Pedals, bottom-right
    padButton("touch-brake", "BRK", Modifier.position(Position.Absolute).right(14.px).bottom(84.px)) { pad.brake = it }
    padButton("touch-throttle", "GAS", Modifier.position(Position.Absolute).right(14.px).bottom(18.px)) { pad.throttle = it }
    padButton("touch-drift", "DRFT", Modifier.position(Position.Absolute).right(80.px).bottom(18.px)) { pad.drift = it }
}

internal object TouchBridgeHolder {
    var bridge: JellyDriftBridge? = null
}
