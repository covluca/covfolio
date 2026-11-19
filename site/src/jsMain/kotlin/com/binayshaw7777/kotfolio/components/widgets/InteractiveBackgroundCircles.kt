package com.binayshaw7777.kotfolio.components.widgets

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import com.varabyte.kobweb.compose.css.PointerEvents
import com.varabyte.kobweb.compose.css.UserSelect
import com.varabyte.kobweb.compose.css.functions.clamp
import com.varabyte.kobweb.compose.dom.svg.Circle
import com.varabyte.kobweb.compose.dom.svg.SVGFillType
import com.varabyte.kobweb.compose.dom.svg.Svg
import com.varabyte.kobweb.compose.ui.Modifier
import com.varabyte.kobweb.compose.ui.graphics.Colors
import com.varabyte.kobweb.compose.ui.modifiers.opacity
import com.varabyte.kobweb.compose.ui.modifiers.pointerEvents
import com.varabyte.kobweb.compose.ui.modifiers.userSelect
import com.varabyte.kobweb.compose.ui.modifiers.width
import com.varabyte.kobweb.compose.ui.styleModifier
import com.varabyte.kobweb.compose.ui.toAttrs
import com.varabyte.kobweb.silk.components.style.ComponentStyle
import com.varabyte.kobweb.silk.components.style.breakpoint.Breakpoint
import com.varabyte.kobweb.silk.components.style.toModifier
import com.varabyte.kobweb.silk.theme.colors.ColorMode
import kotlinx.browser.document
import kotlinx.browser.window
import org.jetbrains.compose.web.css.px
import org.jetbrains.compose.web.css.vw
import org.w3c.dom.events.Event
import org.w3c.dom.events.EventListener
import org.w3c.dom.events.MouseEvent
import org.w3c.dom.svg.SVGCircleElement
import org.w3c.dom.svg.SVGSVGElement
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin

private const val VIEWBOX_MIN_X = -80.0
private const val VIEWBOX_MIN_Y = 0.0
private const val VIEWBOX_WIDTH = 663.0
private const val VIEWBOX_HEIGHT = 580.0

private const val BASE_BIG_CX = 473.5
private const val BASE_BIG_CY = -1.5
private const val BASE_BIG_R = 473.0
private const val SMALL_R = 72.0

private const val REST_ANGLE = 2.370
private const val MIN_ANGLE = 1.57
private const val MAX_ANGLE = 2.89
private const val MID_ANGLE = (MIN_ANGLE + MAX_ANGLE) / 2.0
private const val HALF_ARC_SPAN = (MAX_ANGLE - MIN_ANGLE) / 2.0

private const val PARALLAX_MAX = 12.0
private const val BREATHE_AMPLITUDE = 4.5
private const val IDLE_TIMEOUT_MS = 2500.0

val InteractiveBackgroundCirclesStyle by ComponentStyle {
    base {
        Modifier
            .width(clamp(280.px, 68.vw, 460.px))
            .opacity(0.65)
            .pointerEvents(PointerEvents.None)
            .userSelect(UserSelect.None)
            .styleModifier {
                property("display", "block")
                property("height", "auto")
            }
    }
    Breakpoint.MD {
        Modifier
            .width(clamp(440.px, 56.vw, 660.px))
            .opacity(1.0)
    }
    Breakpoint.LG {
        Modifier
            .width(clamp(560.px, 56.vw, 860.px))
            .opacity(1.0)
    }
}

private class CircleDomRefs {
    var svg: SVGSVGElement? = null
    var bigCircle: SVGCircleElement? = null
    var smallCircle: SVGCircleElement? = null
}

private class CircleAnimationState {
    var currentAngle: Double = REST_ANGLE
    var currentPx: Double = 0.0
    var currentPy: Double = 0.0
    var bigCx: Double = BASE_BIG_CX
    var bigCy: Double = BASE_BIG_CY
    var bigR: Double = BASE_BIG_R
    var smallCx: Double = BASE_BIG_CX + BASE_BIG_R * cos(REST_ANGLE)
    var smallCy: Double = BASE_BIG_CY + BASE_BIG_R * sin(REST_ANGLE)

    var pointerTargetAngle: Double = REST_ANGLE
    var pointerParallaxX: Double = 0.0
    var pointerParallaxY: Double = 0.0
    var pointerActive: Boolean = false
    var lastPointerMoveMs: Double = 0.0
    var idleWeight: Double = 1.0
    var inView: Boolean = true

    fun resetToRest() {
        currentAngle = REST_ANGLE
        currentPx = 0.0
        currentPy = 0.0
        bigCx = BASE_BIG_CX
        bigCy = BASE_BIG_CY
        bigR = BASE_BIG_R
        smallCx = BASE_BIG_CX + BASE_BIG_R * cos(REST_ANGLE)
        smallCy = BASE_BIG_CY + BASE_BIG_R * sin(REST_ANGLE)
        pointerTargetAngle = REST_ANGLE
        pointerParallaxX = 0.0
        pointerParallaxY = 0.0
        pointerActive = false
        idleWeight = 1.0
    }
}

private fun clampToVisibleArc(rawAngle: Double): Double {
    var delta = rawAngle - MID_ANGLE
    while (delta > PI) delta -= 2.0 * PI
    while (delta <= -PI) delta += 2.0 * PI
    return MID_ANGLE + delta.coerceIn(-HALF_ARC_SPAN, HALF_ARC_SPAN)
}

private fun applyDomAttributes(refs: CircleDomRefs, state: CircleAnimationState) {
    refs.bigCircle?.apply {
        setAttribute("cx", state.bigCx.toString())
        setAttribute("cy", state.bigCy.toString())
        setAttribute("r", state.bigR.toString())
    }
    refs.smallCircle?.apply {
        setAttribute("cx", state.smallCx.toString())
        setAttribute("cy", state.smallCy.toString())
    }
}

@Composable
fun InteractiveBackgroundCircles(modifier: Modifier = Modifier) {
    val strokeColor = if (ColorMode.current.isDark) Colors.White else Colors.Black
    val refs = remember { CircleDomRefs() }
    val animState = remember { CircleAnimationState() }

    Svg(
        attrs = InteractiveBackgroundCirclesStyle
            .toModifier()
            .then(modifier)
            .toAttrs {
                viewBox(VIEWBOX_MIN_X, VIEWBOX_MIN_Y, VIEWBOX_WIDTH, VIEWBOX_HEIGHT)
                attr("aria-hidden", "true")
                attr("focusable", "false")
                ref { element ->
                    refs.svg = element
                    onDispose {
                        if (refs.svg === element) refs.svg = null
                    }
                }
            }
    ) {
        Circle {
            cx(animState.bigCx)
            cy(animState.bigCy)
            r(animState.bigR)
            fill(SVGFillType.None)
            stroke(strokeColor)
            strokeOpacity(0.4)
            strokeWidth(1)
            attr("vector-effect", "non-scaling-stroke")
            ref { element ->
                refs.bigCircle = element
                onDispose {
                    if (refs.bigCircle === element) refs.bigCircle = null
                }
            }
        }

        Circle {
            cx(animState.smallCx)
            cy(animState.smallCy)
            r(SMALL_R)
            fill(SVGFillType.None)
            stroke(strokeColor)
            strokeOpacity(0.92)
            strokeWidth(1)
            attr("vector-effect", "non-scaling-stroke")
            ref { element ->
                refs.smallCircle = element
                onDispose {
                    if (refs.smallCircle === element) refs.smallCircle = null
                }
            }
        }
    }

    DisposableEffect(Unit) {
        val motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
        var reducedMotion = motionQuery.matches
        var rafId: Int? = null
        var lastFrameMs: Double? = null

        fun updateInView() {
            val rect = refs.svg?.getBoundingClientRect()
            animState.inView = rect != null && rect.bottom > -50.0
        }

        fun stopLoop() {
            rafId?.let { window.cancelAnimationFrame(it) }
            rafId = null
            lastFrameMs = null
        }

        fun isDocumentHidden(): Boolean {
            return (document.asDynamic().hidden as? Boolean) == true
        }

        fun scheduleNextFrame() {
            if (rafId != null || reducedMotion || isDocumentHidden()) return
            rafId = window.requestAnimationFrame { nowMs ->
                rafId = null
                if (reducedMotion || isDocumentHidden()) return@requestAnimationFrame

                val prevMs = lastFrameMs ?: nowMs
                lastFrameMs = nowMs
                val dt = ((nowMs - prevMs) / 1000.0).coerceIn(0.0, 0.05)
                val t = nowMs / 1000.0

                animState.idleWeight = when {
                    !animState.pointerActive -> (animState.idleWeight + dt * 0.6).coerceAtMost(1.0)
                    (nowMs - animState.lastPointerMoveMs) > IDLE_TIMEOUT_MS ->
                        (animState.idleWeight + dt * 0.45).coerceAtMost(1.0)
                    else -> (animState.idleWeight - dt * 2.5).coerceAtLeast(0.0)
                }

                val ambientAngle = REST_ANGLE + sin(t * 0.45) * 0.22
                val ambientPx = cos(t * 0.35) * 5.0
                val ambientPy = sin(t * 0.50) * 5.0
                val breatheR = sin(t * 0.70) * BREATHE_AMPLITUDE

                val w = animState.idleWeight
                val targetAngle = animState.pointerTargetAngle + (ambientAngle - animState.pointerTargetAngle) * w
                val targetPx = animState.pointerParallaxX + (ambientPx - animState.pointerParallaxX) * w
                val targetPy = animState.pointerParallaxY + (ambientPy - animState.pointerParallaxY) * w

                val angleAlpha = 1.0 - exp(-6.5 * dt)
                val parallaxAlpha = 1.0 - exp(-4.0 * dt)

                animState.currentAngle += (targetAngle - animState.currentAngle) * angleAlpha
                animState.currentPx += (targetPx - animState.currentPx) * parallaxAlpha
                animState.currentPy += (targetPy - animState.currentPy) * parallaxAlpha

                animState.bigCx = BASE_BIG_CX + animState.currentPx
                animState.bigCy = BASE_BIG_CY + animState.currentPy
                animState.bigR = BASE_BIG_R + breatheR
                animState.smallCx = animState.bigCx + animState.bigR * cos(animState.currentAngle)
                animState.smallCy = animState.bigCy + animState.bigR * sin(animState.currentAngle)

                if (animState.inView) {
                    applyDomAttributes(refs, animState)
                }

                scheduleNextFrame()
            }
        }

        val pointerMoveListener = EventListener { event ->
            val mouseEvent = event as? MouseEvent ?: return@EventListener
            val pointerType = event.asDynamic().pointerType as? String
            if (pointerType == "touch") return@EventListener

            val svgEl = refs.svg ?: return@EventListener
            val rect = svgEl.getBoundingClientRect()
            if (rect.width <= 0.0 || rect.height <= 0.0) return@EventListener

            val clientX = mouseEvent.clientX.toDouble()
            val clientY = mouseEvent.clientY.toDouble()
            val svgX = VIEWBOX_MIN_X + ((clientX - rect.left) / rect.width) * VIEWBOX_WIDTH
            val svgY = VIEWBOX_MIN_Y + ((clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT

            val rawAngle = atan2(svgY - BASE_BIG_CY, svgX - BASE_BIG_CX)
            animState.pointerTargetAngle = clampToVisibleArc(rawAngle)

            val vw = window.innerWidth.toDouble().coerceAtLeast(1.0)
            val vh = window.innerHeight.toDouble().coerceAtLeast(1.0)
            val nx = ((clientX / vw) - 0.5) * 2.0
            val ny = ((clientY / vh) - 0.5) * 2.0
            animState.pointerParallaxX = nx.coerceIn(-1.0, 1.0) * PARALLAX_MAX
            animState.pointerParallaxY = ny.coerceIn(-1.0, 1.0) * PARALLAX_MAX

            animState.pointerActive = true
            animState.lastPointerMoveMs = window.performance.now()
        }

        val mouseLeaveListener = EventListener {
            animState.pointerActive = false
        }

        val visibilityListener = EventListener {
            if (isDocumentHidden()) {
                stopLoop()
            } else if (!reducedMotion) {
                updateInView()
                scheduleNextFrame()
            }
        }

        val scrollOrResizeListener = EventListener {
            updateInView()
        }

        val reducedMotionListener = EventListener { _: Event ->
            reducedMotion = motionQuery.matches
            if (reducedMotion) {
                stopLoop()
                animState.resetToRest()
                applyDomAttributes(refs, animState)
            } else {
                updateInView()
                scheduleNextFrame()
            }
        }

        val passiveOptions = js("({ passive: true })")
        window.addEventListener("pointermove", pointerMoveListener, passiveOptions)
        window.addEventListener("scroll", scrollOrResizeListener, passiveOptions)
        window.addEventListener("resize", scrollOrResizeListener, passiveOptions)
        document.addEventListener("mouseleave", mouseLeaveListener)
        document.addEventListener("visibilitychange", visibilityListener)
        motionQuery.addEventListener("change", reducedMotionListener)

        updateInView()
        if (reducedMotion) {
            animState.resetToRest()
            applyDomAttributes(refs, animState)
        } else {
            scheduleNextFrame()
        }

        onDispose {
            stopLoop()
            window.removeEventListener("pointermove", pointerMoveListener)
            window.removeEventListener("scroll", scrollOrResizeListener)
            window.removeEventListener("resize", scrollOrResizeListener)
            document.removeEventListener("mouseleave", mouseLeaveListener)
            document.removeEventListener("visibilitychange", visibilityListener)
            motionQuery.removeEventListener("change", reducedMotionListener)
        }
    }
}
