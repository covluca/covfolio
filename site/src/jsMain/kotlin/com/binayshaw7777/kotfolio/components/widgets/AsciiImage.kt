package com.binayshaw7777.kotfolio.components.widgets

import androidx.compose.runtime.*
import com.binayshaw7777.kotfolio.utils.AsciiArt
import com.varabyte.kobweb.compose.css.CSSLengthOrPercentageNumericValue
import com.varabyte.kobweb.compose.css.Overflow
import com.varabyte.kobweb.compose.foundation.layout.Box
import com.varabyte.kobweb.compose.ui.Alignment
import com.varabyte.kobweb.compose.ui.Modifier
import com.varabyte.kobweb.compose.ui.graphics.Colors
import com.varabyte.kobweb.compose.ui.modifiers.*
import com.varabyte.kobweb.compose.ui.styleModifier
import com.varabyte.kobweb.compose.ui.toAttrs
import com.varabyte.kobweb.silk.components.text.SpanText
import com.varabyte.kobweb.silk.theme.colors.ColorMode
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.Img
import org.jetbrains.compose.web.dom.Pre
import org.jetbrains.compose.web.dom.Span
import org.jetbrains.compose.web.dom.Text

/**
 * Renders any image URL or site asset (e.g. `Res.Images.IMAGE_1`) as ASCII art inside a Kobweb page.
 *
 * Automatically adapts character density inversion to [ColorMode.current] when [autoInvertForColorMode] is enabled.
 */
@Composable
fun AsciiImage(
    src: String,
    modifier: Modifier = Modifier,
    columns: Int = AsciiArt.DEFAULT_COLUMNS,
    map: String = AsciiArt.Maps.THIRTY,
    charAspectRatio: Double = AsciiArt.DEFAULT_CHAR_ASPECT_RATIO,
    luminanceMode: AsciiArt.LuminanceMode = AsciiArt.LuminanceMode.REC_709,
    colored: Boolean = false,
    renderAsCanvas: Boolean = false,
    autoInvertForColorMode: Boolean = true,
    invert: Boolean = false,
    spaced: Boolean = false,
    fontSize: CSSLengthOrPercentageNumericValue = 0.45.cssRem,
    lineHeight: Number = 1.0,
    alt: String = "",
    autoPrefix: Boolean = true,
    onLoaded: ((AsciiArt.AsciiGrid) -> Unit)? = null,
    onError: ((Throwable) -> Unit)? = null,
) {
    val isLight = ColorMode.current.isLight
    val effectiveInvert = if (autoInvertForColorMode && !colored) isLight else invert
    val options = remember(map, columns, charAspectRatio, effectiveInvert, luminanceMode, spaced) {
        AsciiArt.AsciiOptions(
            map = map,
            columns = columns,
            charAspectRatio = charAspectRatio,
            invert = effectiveInvert,
            luminanceMode = luminanceMode,
            spaced = spaced,
        )
    }

    AsciiImage(
        src = src,
        options = options,
        modifier = modifier,
        colored = colored,
        renderAsCanvas = renderAsCanvas,
        fontSize = fontSize,
        lineHeight = lineHeight,
        alt = alt,
        autoPrefix = autoPrefix,
        onLoaded = onLoaded,
        onError = onError,
    )
}

/**
 * Overload of [AsciiImage] accepting an explicit [AsciiArt.AsciiOptions] configuration.
 */
@Composable
fun AsciiImage(
    src: String,
    options: AsciiArt.AsciiOptions,
    modifier: Modifier = Modifier,
    colored: Boolean = false,
    renderAsCanvas: Boolean = false,
    fontSize: CSSLengthOrPercentageNumericValue = 0.45.cssRem,
    lineHeight: Number = 1.0,
    alt: String = "",
    autoPrefix: Boolean = true,
    onLoaded: ((AsciiArt.AsciiGrid) -> Unit)? = null,
    onError: ((Throwable) -> Unit)? = null,
) {
    var grid by remember { mutableStateOf<AsciiArt.AsciiGrid?>(null) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(src, options, autoPrefix) {
        errorMsg = null
        try {
            val result = AsciiArt.fromUrl(src, options, autoPrefix = autoPrefix)
            grid = result
            onLoaded?.invoke(result)
        } catch (t: Throwable) {
            grid = null
            errorMsg = t.message ?: "Failed to convert image to ASCII art"
            onError?.invoke(t)
        }
    }

    val currentGrid = grid
    when {
        errorMsg != null -> {
            Box(modifier = modifier, contentAlignment = Alignment.Center) {
                SpanText(
                    text = alt.ifEmpty { errorMsg!! },
                    modifier = Modifier.color(Colors.Gray).fontSize(0.85.cssRem)
                )
            }
        }
        currentGrid != null -> {
            AsciiArtView(
                grid = currentGrid,
                modifier = modifier,
                colored = colored,
                renderAsCanvas = renderAsCanvas,
                spaced = options.spaced,
                alphaThreshold = options.alphaThreshold,
                fontSize = fontSize,
                lineHeight = lineHeight,
                alt = alt,
            )
        }
    }
}

/**
 * Renders a precomputed [AsciiArt.AsciiGrid] either as selectable monospace `<pre>` text
 * (monochrome or per-character RGB color) or as a rasterized `<canvas>` PNG data URL.
 */
@Composable
fun AsciiArtView(
    grid: AsciiArt.AsciiGrid,
    modifier: Modifier = Modifier,
    colored: Boolean = false,
    renderAsCanvas: Boolean = false,
    spaced: Boolean = false,
    alphaThreshold: Int = AsciiArt.DEFAULT_ALPHA_THRESHOLD,
    fontSize: CSSLengthOrPercentageNumericValue = 0.45.cssRem,
    lineHeight: Number = 1.0,
    alt: String = "",
) {
    val isDark = ColorMode.current.isDark
    val defaultTextColor = if (isDark) Colors.White else Colors.Black

    if (renderAsCanvas) {
        val bgHex = if (isDark) "#0D0D0D" else "#FFFFFF"
        val fgHex = if (isDark) "#FFFFFF" else "#0D0D0D"
        val dataUrl = remember(grid, colored, bgHex, fgHex, spaced, alphaThreshold) {
            val canvas = AsciiArt.renderToCanvas(
                grid = grid,
                colored = colored,
                backgroundColor = bgHex,
                textColor = fgHex,
                fontSize = 12,
                spaced = spaced,
                alphaThreshold = alphaThreshold,
            )
            canvas.toDataURL("image/png")
        }
        Img(
            src = dataUrl,
            alt = alt,
            attrs = Modifier
                .maxWidth(100.percent)
                .then(modifier)
                .toAttrs()
        )
    } else {
        Pre(
            attrs = Modifier
                .margin(0.px)
                .fontSize(fontSize)
                .lineHeight(lineHeight)
                .color(defaultTextColor)
                .overflow(Overflow.Auto)
                .styleModifier {
                    property("font-family", "'Courier New', Courier, monospace")
                    property("letter-spacing", "0px")
                    property("white-space", "pre")
                    if (alt.isNotEmpty()) {
                        property("--ascii-alt", "\"$alt\"")
                    }
                }
                .ariaLabel(alt)
                .then(modifier)
                .toAttrs()
        ) {
            if (!colored) {
                Text(grid.toPlainText(spaced))
            } else {
                for ((rowIndex, row) in grid.rows.withIndex()) {
                    var i = 0
                    while (i < row.size) {
                        val cell = row[i]
                        val isUncolored = cell.char == ' ' || cell.a < alphaThreshold
                        val targetColor = if (isUncolored) null else cell.cssRgb()
                        val runBuilder = StringBuilder()
                        while (i < row.size) {
                            val c = row[i]
                            val cUncolored = c.char == ' ' || c.a < alphaThreshold
                            val cColor = if (cUncolored) null else c.cssRgb()
                            if (cColor != targetColor) break
                            runBuilder.append(c.char)
                            if (spaced) runBuilder.append(' ')
                            i++
                        }
                        val runText = runBuilder.toString()
                        if (targetColor == null) {
                            Text(runText)
                        } else {
                            Span(
                                attrs = {
                                    style {
                                        property("color", targetColor)
                                    }
                                }
                            ) {
                                Text(runText)
                            }
                        }
                    }
                    if (rowIndex < grid.rows.lastIndex) {
                        Text("\n")
                    }
                }
            }
        }
    }
}
