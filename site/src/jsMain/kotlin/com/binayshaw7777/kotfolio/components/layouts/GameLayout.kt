package com.binayshaw7777.kotfolio.components.layouts

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import com.binayshaw7777.kotfolio.utils.Res
import com.varabyte.kobweb.compose.css.Overflow
import com.varabyte.kobweb.compose.foundation.layout.Box
import com.varabyte.kobweb.compose.foundation.layout.BoxScope
import com.varabyte.kobweb.compose.ui.Modifier
import com.varabyte.kobweb.compose.ui.graphics.Color
import com.varabyte.kobweb.compose.ui.graphics.Colors
import com.varabyte.kobweb.compose.ui.modifiers.*
import com.varabyte.kobweb.compose.ui.styleModifier
import kotlinx.browser.document
import org.jetbrains.compose.web.css.Position
import org.jetbrains.compose.web.css.px
import org.jetbrains.compose.web.css.vh
import org.jetbrains.compose.web.css.vw
import org.w3c.dom.HTMLElement

@Composable
fun GameLayout(
    title: String,
    content: @Composable BoxScope.() -> Unit
) {
    LaunchedEffect(title) {
        document.title = "Barbu Luca - $title"
    }

    DisposableEffect(Unit) {
        val htmlStyle = (document.documentElement as? HTMLElement)?.style
        val bodyStyle = document.body?.style
        val prevHtmlOverflow = (htmlStyle?.getPropertyValue("overflow") ?: "").let { if (it == "hidden") "" else it }
        val prevBodyOverflow = (bodyStyle?.getPropertyValue("overflow") ?: "").let { if (it == "hidden") "" else it }
        val prevBodyMargin = bodyStyle?.margin ?: ""

        htmlStyle?.setProperty("overflow", "hidden")
        bodyStyle?.setProperty("overflow", "hidden")
        bodyStyle?.margin = "0"

        onDispose {
            if (prevHtmlOverflow.isEmpty()) {
                htmlStyle?.removeProperty("overflow")
            } else {
                htmlStyle?.setProperty("overflow", prevHtmlOverflow)
            }
            if (prevBodyOverflow.isEmpty()) {
                bodyStyle?.removeProperty("overflow")
            } else {
                bodyStyle?.setProperty("overflow", prevBodyOverflow)
            }
            bodyStyle?.margin = prevBodyMargin
        }
    }

    Box(
        modifier = Modifier
            .position(Position.Fixed)
            .top(0.px)
            .left(0.px)
            .width(100.vw)
            .height(100.vh)
            .overflow(Overflow.Hidden)
            .backgroundColor(Color.rgb(0x06080B))
            .color(Colors.White)
            .fontFamily(Res.Fonts.DM_SANS)
            .styleModifier {
                property("user-select", "none")
                property("touch-action", "none")
                property("overscroll-behavior", "none")
            }
    ) {
        content()
    }
}
