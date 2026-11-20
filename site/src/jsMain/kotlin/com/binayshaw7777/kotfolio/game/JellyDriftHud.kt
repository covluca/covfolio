package com.binayshaw7777.kotfolio.game

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import com.binayshaw7777.kotfolio.utils.Res
import com.varabyte.kobweb.compose.css.Cursor
import com.varabyte.kobweb.compose.css.FontWeight
import com.varabyte.kobweb.compose.css.PointerEvents
import com.varabyte.kobweb.compose.css.TextAlign
import com.varabyte.kobweb.compose.foundation.layout.Row
import com.varabyte.kobweb.compose.ui.Alignment
import com.varabyte.kobweb.compose.ui.Modifier
import com.varabyte.kobweb.compose.ui.graphics.Color
import com.varabyte.kobweb.compose.ui.graphics.Colors
import com.varabyte.kobweb.compose.ui.modifiers.*
import com.varabyte.kobweb.compose.ui.styleModifier
import com.varabyte.kobweb.compose.ui.toAttrs
import com.varabyte.kobweb.silk.components.text.SpanText
import kotlinx.browser.window
import org.jetbrains.compose.web.css.LineStyle
import org.jetbrains.compose.web.css.Position
import org.jetbrains.compose.web.css.cssRem
import org.jetbrains.compose.web.css.px
import org.jetbrains.compose.web.css.rgba
import org.jetbrains.compose.web.dom.Div
import org.w3c.dom.events.EventListener

private val ACCENT = Color.rgb(0xF3DB5B)

internal fun formatSeconds(seconds: Double): String {
    val safe = if (seconds.isFinite() && seconds > 0.0) seconds else 0.0
    val whole = safe.toInt()
    val minutes = whole / 60
    val rest = whole % 60
    return "$minutes:${if (rest < 10) "0$rest" else "$rest"}"
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
                SpanText(
                    "LAP ${snapshot.lap}/${snapshot.totalLaps}",
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
            SpanText(
                "GRAND PRIX",
                modifier = Modifier
                    .fontFamily(Res.Fonts.Space_Grotesk)
                    .fontSize(0.92.cssRem)
                    .fontWeight(FontWeight.Bold)
                    .color(ACCENT)
                    .styleModifier { property("text-shadow", "0 2px 10px rgba(0,0,0,0.65)") }
            )
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

    // Speed readout, bottom-left.
    Div(
        Modifier
            .position(Position.Absolute)
            .left(20.px)
            .bottom(18.px)
            .styleModifier {
                property("pointer-events", "none")
                property("text-shadow", "0 3px 18px rgba(0,0,0,0.7)")
            }
            .toAttrs()
    ) {
        SpanText(
            snapshot.speedKmh.coerceAtLeast(0.0).toInt().toString(),
            modifier = Modifier
                .fontFamily(Res.Fonts.Space_Grotesk)
                .fontSize(2.6.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(Colors.White)
        )
        SpanText(
            "KM/H",
            modifier = Modifier
                .margin(left = 6.px)
                .fontFamily(Res.Fonts.Space_Grotesk)
                .fontSize(0.85.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(ACCENT)
        )
    }

    // Drift / boost status, bottom-right above the touch pad.
    val tier = snapshot.boostTier.coerceIn(0, 3)
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
        SpanText(
            "${"●".repeat(tier)}${"○".repeat(3 - tier)} BOOST",
            modifier = Modifier
                .fontFamily(Res.Fonts.Space_Grotesk)
                .fontSize(0.75.cssRem)
                .fontWeight(FontWeight.Bold)
                .color(if (tier > 0) ACCENT else Colors.LightGray)
        )
        Div(Modifier.toAttrs()) {
            SpanText(
                "SCORE ${snapshot.driftScore}",
                modifier = Modifier
                    .fontFamily(Res.Fonts.Space_Grotesk)
                    .fontSize(0.8.cssRem)
                    .fontWeight(FontWeight.Bold)
                    .color(Colors.White)
            )
        }
    }

    TouchControls(snapshot)
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
    padButton("touch-boost", "BST", Modifier.position(Position.Absolute).right(80.px).bottom(84.px)) { pad.boost = it }
}

internal object TouchBridgeHolder {
    var bridge: JellyDriftBridge? = null
}
