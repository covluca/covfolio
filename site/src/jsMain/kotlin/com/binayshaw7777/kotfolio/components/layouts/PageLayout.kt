package com.binayshaw7777.kotfolio.components.layouts

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.varabyte.kobweb.compose.dom.svg.*
import com.varabyte.kobweb.compose.foundation.layout.Box
import com.varabyte.kobweb.compose.foundation.layout.Column
import com.varabyte.kobweb.compose.foundation.layout.ColumnScope
import com.varabyte.kobweb.compose.ui.Alignment
import com.varabyte.kobweb.compose.ui.Modifier
import com.varabyte.kobweb.compose.ui.modifiers.*
import com.varabyte.kobweb.compose.ui.toAttrs
import com.varabyte.kobweb.silk.components.style.ComponentStyle
import com.varabyte.kobweb.silk.components.style.breakpoint.Breakpoint
import com.varabyte.kobweb.silk.components.style.toModifier
import com.varabyte.kobweb.silk.theme.colors.ColorMode
import kotlinx.browser.document
import kotlinx.browser.window
import org.jetbrains.compose.web.css.cssRem
import org.jetbrains.compose.web.css.fr
import org.jetbrains.compose.web.css.percent
import com.binayshaw7777.kotfolio.components.sections.Footer
import com.binayshaw7777.kotfolio.components.sections.NavHeader
import com.binayshaw7777.kotfolio.components.widgets.AppearanceAwareImage
import com.binayshaw7777.kotfolio.components.widgets.BackToTopButton
import com.binayshaw7777.kotfolio.utils.Res
import com.binayshaw7777.kotfolio.toSitePalette
import com.binayshaw7777.kotfolio.utils.meth.Point
import com.binayshaw7777.kotfolio.utils.meth.Pose2d
import com.varabyte.kobweb.compose.css.AnimationIterationCount
import com.varabyte.kobweb.compose.css.PointerEvents
import com.varabyte.kobweb.compose.dom.ElementRefScope
import com.varabyte.kobweb.compose.dom.ref
import com.varabyte.kobweb.compose.ui.graphics.Colors
import com.varabyte.kobweb.compose.ui.styleModifier
import com.varabyte.kobweb.silk.components.animation.Keyframes
import com.varabyte.kobweb.silk.components.animation.toAnimation
import com.varabyte.kobweb.silk.components.text.SpanText
import com.varabyte.kobweb.silk.theme.breakpoint.rememberBreakpoint
import org.jetbrains.compose.web.ExperimentalComposeWebApi
import org.jetbrains.compose.web.css.AnimationDirection
import org.jetbrains.compose.web.css.AnimationTimingFunction
import org.jetbrains.compose.web.css.CSSAngleValue
import org.jetbrains.compose.web.css.Color
import org.jetbrains.compose.web.css.Position
import org.jetbrains.compose.web.css.mm
import org.jetbrains.compose.web.css.px
import org.jetbrains.compose.web.css.rad
import org.jetbrains.compose.web.css.s
import org.jetbrains.compose.web.css.vw
import org.jetbrains.compose.web.dom.Div
import org.w3c.dom.HTMLDivElement
import org.w3c.dom.HTMLImageElement
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sin
import kotlin.time.Duration.Companion.seconds

val PageContentStyle by ComponentStyle {
    base { Modifier.fillMaxSize().padding(leftRight = 2.cssRem, top = 4.cssRem) }
    Breakpoint.MD { Modifier.maxWidth(60.cssRem) }
}

val ShiftRightKeyframes by Keyframes {
    from { Modifier.left(0.px) }
    to { Modifier.left(200.px) }
}

val MoveBeamKeyFrames by Keyframes {
    0.percent {
        Modifier
            .backgroundColor(Res.Colors.FOUR_D_PURPLE)
            .styleModifier {
                property("left", "var(--circle-x)")
                property("top", "var(--circle-y)")
                property("transform", "translate(-50%, -50%) rotate(var(--beam-angle))")
                property("box-shadow", "0 0 12px 3px #7B2CBF, 0 0 24px 6px rgba(123, 44, 191, 0.6)")
            }
    }
    100.percent {
        Modifier
            .backgroundColor(Res.Colors.FOUR_D_YELLOW)
            .styleModifier {
                property("left", "var(--cursor-x)")
                property("top", "var(--cursor-y)")
                property("transform", "translate(-50%, -50%) rotate(var(--beam-angle))")
                property("box-shadow", "0 0 12px 3px #FFD600, 0 0 24px 6px rgba(255, 214, 0, 0.6)")
            }
    }
}

val OrbitBeamKeyFrames by Keyframes {
    0.percent {
        Modifier
            .backgroundColor(Res.Colors.FOUR_D_PURPLE)
            .styleModifier {
                property("left", "var(--circle-x)")
                property("top", "var(--circle-y)")
                property("transform", "translate(-50%, -50%) rotate(0deg) translateY(calc(-1 * var(--orbit-radius)))")
                property("box-shadow", "0 0 12px 3px #7B2CBF, 0 0 24px 6px rgba(123, 44, 191, 0.6)")
            }
    }
    50.percent {
        Modifier
            .backgroundColor(Res.Colors.FOUR_D_YELLOW)
            .styleModifier {
                property("left", "var(--circle-x)")
                property("top", "var(--circle-y)")
                property("transform", "translate(-50%, -50%) rotate(180deg) translateY(calc(-1 * var(--orbit-radius)))")
                property("box-shadow", "0 0 12px 3px #FFD600, 0 0 24px 6px rgba(255, 214, 0, 0.6)")
            }
    }
    100.percent {
        Modifier
            .backgroundColor(Res.Colors.FOUR_D_PURPLE)
            .styleModifier {
                property("left", "var(--circle-x)")
                property("top", "var(--circle-y)")
                property("transform", "translate(-50%, -50%) rotate(360deg) translateY(calc(-1 * var(--orbit-radius)))")
                property("box-shadow", "0 0 12px 3px #7B2CBF, 0 0 24px 6px rgba(123, 44, 191, 0.6)")
            }
    }
}

// NOTE: This is a fun little graphic that showcases what you can do with SVG. However, this probably does not make
// sense in your own site, so feel free to delete it.
@Composable
private fun SvgCobweb(modifier: Modifier) {
    val color = ColorMode.current.toSitePalette().cobweb

    // On mobile, the SVG would cause scrolling, so clamp its max width
    Svg(attrs = modifier.maxWidth(100.percent).toAttrs {
        width(25.cssRem)
        height(20.cssRem)
    }) {
        val cobwebFadeOutId = SvgId("cobweb-fade-out")
        Defs {
            // Fade out the bottom right of the cobweb with a circular shape
            RadialGradient(cobwebFadeOutId, attrs = {
                cx(0)
                cy(0)
                r(120.percent)
            }) {
                Stop(50.percent, color)
                Stop(100.percent, color, stopOpacity = 0f)
            }
        }

//        Path {
//            // d { ... } is useful for type-safe, readable SVG path construction, but I got a complex path from a
//            // designer, so using d(...) directly in this case
//            d("M-19.5501 -131.516L37.5899-59.412C34.8649 -10.82 13.8419 26.38 -14.8001 60.62L-21.5161 58.86V78.18L-18.9591 78.852C-3.60911 123.917 -9.87111 169.679 -17.1391 217.146L-21.5151 219.193V239.823L-12.3351 235.529C-5.81911 246.236 1.32289 262.576 6.72489 276.859C10.0329 285.624 13.1183 294.472 15.9779 303.394L-21.5151 341.084V343.514H2.42689L30.9769 314.814C40.2469 314.451 72.7469 313.341 113.677 314.064C160.421 314.889 216.289 318.364 252.727 327.731L257.807 343.515H277.439L270.009 320.427C305.949 278.917 341.921 239.902 401.743 218.087L453.517 238.573V218.476L410.534 201.468C404.16 162.258 423.289 124.803 441.154 84.788L453.517 82.203V63.111L447.194 64.434L441.744 61.631C385.656 32.8 365.41 -16.36 348.444 -71.07L392.628 -131.516H369.478L330.878 -78.706C272.605 -77.452 218.403 -81.169 176.432 -116.496L174.158 -131.516H155.258L158.096 -112.766C130.96 -83.776 100.532 -64.812 53.5119 -69.41L4.29189 -131.516H-19.5521H-19.5501ZM180.367 -90.512C220.975 -64.208 268.865 -59.618 317.121 -59.882L283.981 -14.542C247.393 -14.146 214.125 -17.576 188.136 -39.18L180.367 -90.512ZM161.533 -90.072L169.823 -35.297C152.008 -16.681 132.529 -5.117 101.828 -8.443L68.7519 -50.18C107.345 -50.92 137.11 -67.324 161.532 -90.072H161.533ZM334.857 -52.48C350.393 -5.51302 371.907 40.21 419.407 70.242L367.639 81.062L366.823 80.645C329.553 61.5 316.378 29.005 304.888 -8.18501L304.172 -10.5L334.855 -52.48H334.857ZM54.1169 -38.562L88.5099 4.836C85.9869 34.419 73.1059 57.496 55.3699 79.043L4.96589 65.81C28.6799 36.036 47.6059 2.41699 54.1179 -38.563L54.1169 -38.562ZM191.965 -13.872C215.901 -0.177994 243.015 3.528 270.369 4.076L237.459 49.104C222.401 42.74 211.322 31.351 198.889 18.779L196.546 16.409L191.964 -13.871L191.965 -13.872ZM173.187 -13.062L178.779 23.893C167.603 31.393 154.343 36.043 139.733 39.385L116.831 10.488C139.541 9.093 157.926 -0.192001 173.187 -13.062ZM290.567 8.11099C300.313 37.266 313.713 66.128 341.147 86.601L285.219 98.291C272.222 87.109 265.242 73.557 258.063 58.401L256.393 54.871L290.567 8.11099ZM104.135 24.554L123.277 48.708L123.199 49.418C121.269 66.783 114.322 79.048 106.549 92.481L75.0129 84.201C88.2249 66.845 98.9529 47.373 104.133 24.554H104.135ZM181.809 43.907L187.821 83.649C184.26 84.3288 180.81 85.5 177.571 87.129L152.394 55.362C162.584 52.612 172.524 49.017 181.808 43.908L181.809 43.907ZM201.169 46.95C208.524 53.528 216.689 59.672 226.321 64.34L210.487 86.002C209.307 85.5035 208.103 85.0636 206.88 84.684L201.17 46.949L201.169 46.95ZM138.419 67.814L163.329 99.244C161.729 101.454 160.361 103.823 159.249 106.314L125.335 97.412C130.29 88.655 135.165 79.159 138.419 67.814ZM243.944 71.896C249.064 82.311 255.048 92.991 263.597 102.809L232.454 109.317C230.89 104.865 228.541 100.73 225.517 97.107L243.944 71.896ZM2.17189 84.4L51.0449 97.23C60.2719 125.445 56.8399 154.31 52.2449 184.678L3.17289 207.64C9.12289 167.493 13.4619 126.226 2.17189 84.4ZM418.314 89.562C403.381 122.197 388.2 156.295 390.881 193.692L347.141 176.385C343.541 151.369 355.917 126.94 367.866 100.107L418.316 89.563L418.314 89.562ZM71.7379 102.662L99.3519 109.91L99.9139 111.31C106.014 126.443 105.297 143.082 102.814 161.018L72.4959 175.203C75.7099 151.691 77.4719 127.39 71.7379 102.662ZM345.033 104.879C335.99 124.696 327.236 145.682 327.781 168.726L291.194 154.249C291.19 141.101 292.589 131.409 300.314 120.329L305.294 113.185L345.034 104.878L345.033 104.879ZM120.673 115.507L155.91 124.759C156.126 128.317 156.825 131.829 157.988 135.199L122.718 151.702C123.768 139.802 123.644 127.654 120.673 115.507ZM279.833 118.507C275.208 127.94 273.453 137.397 272.885 147.005L233.607 131.465C233.873 130.34 234.077 129.192 234.247 128.035L279.832 118.507H279.833ZM225.037 148.169L261.541 162.612C252.631 167.192 244.225 173.148 236.864 178.772C233.505 181.339 230.209 183.988 226.978 186.714L216.876 155.317C219.916 153.317 222.662 150.909 225.038 148.169H225.037ZM166.917 151.653L129.26 189.51C126.702 183.31 123.242 178.363 119.672 174.275L119.76 173.719L166.914 151.653H166.917ZM184.647 160.325C189.395 161.652 194.351 162.077 199.256 161.58L209.729 194.12C196.415 193.96 172.116 194.196 148.036 197.13L184.646 160.326L184.647 160.325ZM288.133 173.135L313.496 183.169C284.096 198.089 263.12 219.065 244.244 240.369L233.2 206.05C236.754 202.876 241.93 198.42 248.21 193.623C259.63 184.896 274.418 175.923 283.895 173.996L288.133 173.135ZM101.635 182.2L103.152 183.725C109 189.6 113.125 194.028 114.375 204.475L83.2319 235.783C82.8819 233.513 82.4939 231.153 82.0319 228.641C80.0219 217.691 77.5839 205.699 72.7069 195.737L101.635 182.202V182.2ZM337.563 192.693L376.781 208.211C327.358 230.711 293.866 264.895 263.331 299.681L250.896 261.034C274.999 233.196 298.569 207.418 337.564 192.694L337.563 192.693ZM55.5769 203.75C58.5789 210.587 61.7989 221.92 63.6529 232.016C65.2349 240.626 66.1529 248.096 66.6329 252.466L30.7509 288.541C28.6803 282.405 26.4966 276.307 24.2009 270.251C18.8269 256.035 12.2079 240.239 4.59089 227.611L55.5769 203.751V203.75ZM206.44 212.898C210.408 212.892 213.254 212.928 215.79 212.963L226.186 245.263C199.929 241.113 167.553 241.073 139.129 242.078C123.554 242.628 111.125 243.405 101.272 244.143L125.38 219.906L126.33 219.676C150.076 213.886 186.19 212.93 206.44 212.898ZM164.248 260.288C189.172 260.235 214.614 261.554 232.664 265.391L246.092 307.118C207.384 298.888 157.108 296.141 114.006 295.38C86.7839 294.898 64.7689 295.192 50.1359 295.553L80.9359 264.59C88.7009 263.833 111.646 261.748 139.789 260.754C147.689 260.474 155.939 260.304 164.247 260.287L164.248 260.288Z")
//            transform { scale(0.6) }
//            fill(cobwebFadeOutId)
//        }
    }
}

@OptIn(ExperimentalComposeWebApi::class)
@Composable
fun SVGBackroundCircle(
    modifier: Modifier,
    ref: ElementRefScope<HTMLImageElement>? = null
) {
    AppearanceAwareImage(
        src = Res.Images.BACKGROUND_CIRCLES,
        modifier = modifier,
        ref = ref
    )
}

@Composable
fun SVGAnima(
    modifier: Modifier,
    ref: ElementRefScope<HTMLImageElement>? = null,
    image: String
) {
    AppearanceAwareImage(
        src = image,
        modifier = modifier,
        ref = ref
    )
}

@Composable
fun PageLayout(title: String, content: @Composable ColumnScope.() -> Unit) {

    val breakpoint = rememberBreakpoint()

    var circleElement by remember { mutableStateOf<HTMLImageElement?>(null) }
    var beamElement by remember { mutableStateOf<HTMLDivElement?>(null) }
    var clientPos by remember { mutableStateOf(Point(0.0, 0.0)) }
    var scrollPos by remember { mutableStateOf(Point(0.0, 0.0)) }
    var isMouseDown by remember { mutableStateOf(false) }
    val cursorPos = Point(clientPos.x + scrollPos.x, clientPos.y + scrollPos.y)
    var centerPos = Point(30.0, 30.0)

    var circlePos = Point.polar(120.0, PI-centerPos.atan2(cursorPos))

    val cursor = if (ColorMode.current.isDark) {
        Res.Images.CUSTOM_CURSOR_DARK
    } else {
        Res.Images.CUSTOM_CURSOR_LIGHT
    }

    LaunchedEffect(title) {
        document.title = "Barbu Luca - $title"
    }

    LaunchedEffect(Unit) {
        window.addEventListener("scroll", {
            scrollPos = Point(window.scrollX, window.scrollY)
        })
        window.addEventListener("mousedown", {
            isMouseDown = true
        })
        window.addEventListener("mouseup", {
            isMouseDown = false
        })
        window.addEventListener("dragend", {
            isMouseDown = false
        })
        window.addEventListener("blur", {
            isMouseDown = false
        })

        val mmToPx = 3.7795275591
        var lastTimeMs: Double? = null
        var orbitAngle = 0.0
        var currentRadius: Double? = null
        var attackTime = 0.0
        var beamX = 0.0
        var beamY = 0.0
        var beamAngleRad = PI / 2.0
        var colorMix = 0.0
        var launchOriginX = 0.0
        var launchOriginY = 0.0
        var wasMouseDown = false

        fun step(timestampMs: Double) {
            val dt = if (lastTimeMs == null) 0.016 else ((timestampMs - lastTimeMs!!) / 1000.0).coerceIn(0.0, 0.1)
            lastTimeMs = timestampMs

            val liveCursor = Point(clientPos.x + scrollPos.x, clientPos.y + scrollPos.y)
            val liveCircle = Point.polar(120.0, PI - centerPos.atan2(liveCursor))
            val circleRadiusPx = max(5.0 * mmToPx, window.innerWidth * 0.05)
            val circleCenterX = liveCircle.y * mmToPx + circleRadiusPx
            val circleCenterY = -liveCircle.x * mmToPx + circleRadiusPx
            val orbitRadius = circleRadiusPx + 10.0

            if (currentRadius == null) {
                currentRadius = orbitRadius
                beamX = circleCenterX + orbitRadius
                beamY = circleCenterY
            }

            if (isMouseDown) {
                if (!wasMouseDown) {
                    wasMouseDown = true
                    attackTime = 0.0
                    launchOriginX = beamX
                    launchOriginY = beamY
                }
                attackTime += dt
                val p = (1.0 - cos(PI * attackTime)) / 2.0
                val aimAngle = atan2(liveCursor.y - circleCenterY, liveCursor.x - circleCenterX)
                val orbitEdgeX = circleCenterX + orbitRadius * cos(aimAngle)
                val orbitEdgeY = circleCenterY + orbitRadius * sin(aimAngle)
                val originBlend = (1.0 - cos(PI * attackTime.coerceIn(0.0, 1.0))) / 2.0
                val startX = launchOriginX + (orbitEdgeX - launchOriginX) * originBlend
                val startY = launchOriginY + (orbitEdgeY - launchOriginY) * originBlend

                beamX = startX + (liveCursor.x - startX) * p
                beamY = startY + (liveCursor.y - startY) * p

                val angleDiff = atan2(sin(aimAngle - beamAngleRad), cos(aimAngle - beamAngleRad))
                beamAngleRad += angleDiff * (1.0 - exp(-15.0 * dt))
                colorMix += (p - colorMix) * (1.0 - exp(-12.0 * dt))
            } else {
                if (wasMouseDown) {
                    wasMouseDown = false
                    orbitAngle = atan2(beamY - circleCenterY, beamX - circleCenterX)
                    currentRadius = hypot(beamX - circleCenterX, beamY - circleCenterY)
                }
                orbitAngle += PI * dt
                val r = currentRadius!! + (orbitRadius - currentRadius!!) * (1.0 - exp(-10.0 * dt))
                currentRadius = r
                beamX = circleCenterX + r * cos(orbitAngle)
                beamY = circleCenterY + r * sin(orbitAngle)

                val targetAngle = orbitAngle + PI / 2.0
                val angleDiff = atan2(sin(targetAngle - beamAngleRad), cos(targetAngle - beamAngleRad))
                beamAngleRad += angleDiff * (1.0 - exp(-12.0 * dt))

                val targetColorMix = (1.0 - cos(orbitAngle)) / 2.0
                colorMix += (targetColorMix - colorMix) * (1.0 - exp(-10.0 * dt))
            }

            beamElement?.style?.apply {
                setProperty("pointer-events", "none")
                left = "${beamX}px"
                top = "${beamY}px"
                transform = "translate(-50%, -50%) rotate(${beamAngleRad}rad)"
                val red = (123 + (255 - 123) * colorMix).toInt().coerceIn(0, 255)
                val green = (44 + (214 - 44) * colorMix).toInt().coerceIn(0, 255)
                val blue = (191 + (0 - 191) * colorMix).toInt().coerceIn(0, 255)
                backgroundColor = "rgb($red, $green, $blue)"
                boxShadow = "0 0 12px 3px rgb($red, $green, $blue), 0 0 24px 6px rgba($red, $green, $blue, 0.6)"
            }
            circleElement?.style?.setProperty("pointer-events", "none")

            window.requestAnimationFrame(::step)
        }

        window.requestAnimationFrame(::step)
    }

    Box(
        Modifier
            .fillMaxWidth()
            .minHeight(100.percent)
            .onMouseDown {
                isMouseDown = true
            }
            .onMouseUp {
                isMouseDown = false
            }
            .onMouseMove {
                clientPos = Point(it.clientX.toDouble(), it.clientY.toDouble())
                scrollPos = Point(window.scrollX, window.scrollY)
                /*circleElement?.getBoundingClientRect()?.let { rect ->
                    centerPos = Point(
                        x = rect.left + rect.width / 2.0,
                        y = rect.top + rect.height / 2.0
                    )
                }*/
            }
            .styleModifier {
                property("cursor", "url('$cursor'), auto")
            }
            // Create a box with two rows: the main content (fills as much space as it can) and the footer (which reserves
            // space at the bottom). "min-content" means the use the height of the row, which we use for the footer.
            // Since this box is set to *at least* 100%, the footer will always appear at least on the bottom but can be
            // pushed further down if the first row grows beyond the page.
            // Grids are powerful but have a bit of a learning curve. For more info, see:
            // https://css-tricks.com/snippets/css/complete-guide-grid/
            .gridTemplateRows { size(1.fr); size(minContent) },
        contentAlignment = Alignment.Center
    ) {


// Later
        Div(
            Modifier
                .width(48.px)
                .height(5.px)
                .borderRadius(999.px)
                .backgroundColor(Res.Colors.FOUR_D_PURPLE)
                .position(Position.Absolute)
                .pointerEvents(PointerEvents.None)
                .styleModifier { property("user-select", "none") }
                .toAttrs {
                    ref { element ->
                        element.style.setProperty("pointer-events", "none")
                        beamElement = element
                        onDispose { beamElement = null }
                    }
                }
        )

        SVGAnima(
            modifier = Modifier
                //.align(Alignment.TopEnd)
                .pointerEvents(PointerEvents.None)
                .width(10.mm)
                .minWidth(10.vw)
                .position(Position.Absolute)
                .left((circlePos.y).mm)
                .top((-circlePos.x).mm)
                //.translate((-circlePos.x).mm,(circlePos.y).mm)
                .styleModifier {
                    property("height", "auto")
                    property("user-select", "none")
                },
            ref = ref { element ->
                element.style.setProperty("pointer-events", "none")
                circleElement = element
                val rect = element.getBoundingClientRect()
                /*centerPos = Point(
                    x = rect.left + rect.width / 2.0,
                    y = rect.top + rect.height / 2.0
                )*/
            },
            image = Res.Images.ANIMA_CIRCLE
        )



        Column(
            // Isolate the content, because otherwise the absolute-positioned SVG above will render on top of it.
            // This is confusing but how browsers work. Read up on stacking contexts for more info.
            // https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_context
            // Some people might have used z-index instead, but best practice is to avoid that if possible, because
            // as a site gets complex, Z-fighting can be a huge pain to track down.
            Modifier.fillMaxSize().gridRow(1),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                PageContentStyle.toModifier(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                content()
            }
            BackToTopButton()
        }



        NavHeader(modifier = Modifier.position(Position.Fixed).top(0.px))

        /*
        //telemetry
        Column(modifier = Modifier.position(Position.Fixed).top(64.px)) {
            SpanText(cursorPos.toString())
            SpanText(centerPos.toString())
            SpanText(circlePos.toString())
        }*/
        // Associate the footer with the row that will get pushed off the bottom of the page if it can't fit.
        Footer(breakpoint, Modifier.fillMaxWidth().gridRow(2))
    }
}
