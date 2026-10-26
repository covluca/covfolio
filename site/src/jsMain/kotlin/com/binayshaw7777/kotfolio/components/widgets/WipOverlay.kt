package com.binayshaw7777.kotfolio.components.widgets

import androidx.compose.runtime.Composable
import com.binayshaw7777.kotfolio.utils.Res
import com.varabyte.kobweb.compose.css.FontWeight
import com.varabyte.kobweb.compose.css.PointerEvents
import com.varabyte.kobweb.compose.css.TextAlign
import com.varabyte.kobweb.compose.dom.svg.Line
import com.varabyte.kobweb.compose.dom.svg.Svg
import com.varabyte.kobweb.compose.ui.Modifier
import com.varabyte.kobweb.compose.ui.graphics.Color
import com.varabyte.kobweb.compose.ui.modifiers.*
import com.varabyte.kobweb.compose.ui.styleModifier
import com.varabyte.kobweb.compose.ui.toAttrs
import com.varabyte.kobweb.silk.components.text.SpanText
import com.varabyte.kobweb.silk.theme.colors.ColorMode
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.Div
import org.jetbrains.compose.web.css.Color as CssColor

private val WIP_RED = Color.rgb(0xE5, 0x48, 0x4D)
private val WIP_RED_CSS = CssColor("#E5484D")

@Composable
fun WipOverlay(
    modifier: Modifier = Modifier,
    fillWidth: Boolean = true,
    compact: Boolean = false,
    content: @Composable () -> Unit
) {
    val isDark = ColorMode.current.isDark
    val badgeBg = if (isDark) CssColor("rgba(18, 18, 18, 0.9)") else CssColor("rgba(255, 255, 255, 0.92)")

    Div(
        attrs = modifier
            .then(if (fillWidth) Modifier.fillMaxWidth() else Modifier)
            .position(Position.Relative)
            .toAttrs()
    ) {
        Div(
            attrs = Modifier
                .then(if (fillWidth) Modifier.fillMaxWidth() else Modifier)
                .opacity(0.35)
                .pointerEvents(PointerEvents.None)
                .toAttrs()
        ) {
            content()
        }

        // Corner-to-corner red X overlay
        Svg(
            attrs = Modifier
                .fillMaxSize()
                .position(Position.Absolute)
                .top(0.px)
                .left(0.px)
                .pointerEvents(PointerEvents.None)
                .styleModifier {
                    property("width", "100%")
                    property("height", "100%")
                    property("border", "1.5px dashed rgba(229, 72, 77, 0.55)")
                    property("border-radius", "8px")
                }
                .toAttrs {
                    attr("viewBox", "0 0 100 100")
                    attr("preserveAspectRatio", "none")
                }
        ) {
            Line {
                x1(0)
                y1(0)
                x2(100)
                y2(100)
                stroke(WIP_RED)
                strokeWidth(if (compact) 2 else 3)
                attr("vector-effect", "non-scaling-stroke")
            }
            Line {
                x1(100)
                y1(0)
                x2(0)
                y2(100)
                stroke(WIP_RED)
                strokeWidth(if (compact) 2 else 3)
                attr("vector-effect", "non-scaling-stroke")
            }
        }

        // Centered "Work in progress" label
        Div(
            Modifier
                .position(Position.Absolute)
                .top(0.px)
                .left(0.px)
                .fillMaxSize()
                .pointerEvents(PointerEvents.None)
                .styleModifier {
                    property("display", "flex")
                    property("align-items", "center")
                    property("justify-content", "center")
                }
                .toAttrs()
        ) {
            Div(
                Modifier
                    .backgroundColor(badgeBg)
                    .border(1.5.px, LineStyle.Solid, WIP_RED_CSS)
                    .borderRadius(6.px)
                    .padding(
                        topBottom = if (compact) 0.2.cssRem else 0.45.cssRem,
                        leftRight = if (compact) 0.55.cssRem else 1.cssRem
                    )
                    .styleModifier {
                        property("user-select", "none")
                        property("letter-spacing", "0.08em")
                    }
                    .toAttrs()
            ) {
                SpanText(
                    text = "WORK IN PROGRESS",
                    modifier = Modifier
                        .fontFamily(Res.Fonts.Space_Grotesk)
                        .fontWeight(FontWeight.Bold)
                        .fontSize(if (compact) 0.72.cssRem else 1.05.cssRem)
                        .color(WIP_RED_CSS)
                        .textAlign(TextAlign.Center)
                )
            }
        }
    }
}
