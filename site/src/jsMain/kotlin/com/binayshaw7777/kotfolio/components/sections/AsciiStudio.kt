package com.binayshaw7777.kotfolio.components.sections

import androidx.compose.runtime.*
import com.binayshaw7777.kotfolio.components.widgets.AsciiArtView
import com.binayshaw7777.kotfolio.components.widgets.SectionTitle
import com.binayshaw7777.kotfolio.utils.AsciiArt
import com.binayshaw7777.kotfolio.utils.Res
import com.varabyte.kobweb.compose.css.Cursor
import com.varabyte.kobweb.compose.css.FontWeight
import com.varabyte.kobweb.compose.css.Overflow
import com.varabyte.kobweb.compose.foundation.layout.Arrangement
import com.varabyte.kobweb.compose.foundation.layout.Box
import com.varabyte.kobweb.compose.foundation.layout.Column
import com.varabyte.kobweb.compose.foundation.layout.Row
import com.varabyte.kobweb.compose.ui.Alignment
import com.varabyte.kobweb.compose.ui.Modifier
import com.varabyte.kobweb.compose.ui.graphics.Colors
import com.varabyte.kobweb.compose.ui.modifiers.*
import com.varabyte.kobweb.compose.ui.styleModifier
import com.varabyte.kobweb.compose.ui.toAttrs
import com.varabyte.kobweb.silk.components.style.ComponentStyle
import com.varabyte.kobweb.silk.components.style.hover
import com.varabyte.kobweb.silk.components.style.toModifier
import com.varabyte.kobweb.silk.components.text.SpanText
import com.varabyte.kobweb.silk.theme.colors.ColorMode
import kotlinx.browser.document
import kotlinx.browser.window
import kotlinx.coroutines.launch
import org.jetbrains.compose.web.attributes.InputType
import org.jetbrains.compose.web.attributes.placeholder
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.Div
import org.jetbrains.compose.web.dom.Input
import org.w3c.dom.HTMLAnchorElement
import org.w3c.dom.HTMLInputElement
import org.w3c.files.get
import org.jetbrains.compose.web.css.Color as CssColor

private data class SampleImage(val label: String, val path: String)

private val SAMPLE_IMAGES = listOf(
    SampleImage("Photo 1", Res.Images.IMAGE_1),
    SampleImage("Photo 2", Res.Images.IMAGE_2),
    SampleImage("Photo 3", Res.Images.IMAGE_3),
    SampleImage("Photo 4", Res.Images.IMAGE_4),
    SampleImage("Kotlin Logo", Res.Images.KOTLIN_LOGO),
    SampleImage("Android Logo", Res.Images.ANDROID_LOGO),
    SampleImage("GitHub Logo", Res.Images.GITHUB_FILLED),
    SampleImage("Portal Star", Res.Images.PORTAL_STAR),
)

private val COLUMN_PRESETS = listOf(40, 60, 80, 100, 120, 150)

private val ASPECT_PRESETS = listOf(
    "0.5 (Monospace)" to 0.5,
    "0.6 (Compact)" to 0.6,
    "1.0 (1:1 Square)" to 1.0,
)

val AsciiPillStyle by ComponentStyle {
    base {
        Modifier
            .padding(topBottom = 0.3.cssRem, leftRight = 0.75.cssRem)
            .borderRadius(999.px)
            .fontSize(0.85.cssRem)
            .cursor(Cursor.Pointer)
            .styleModifier {
                property("user-select", "none")
                property("transition", "opacity 100ms, background 120ms")
            }
    }
    hover { Modifier.opacity(0.82) }
}

private fun hexColor(c: Int): CSSColorValue = CssColor("#" + c.toString(16).padStart(6, '0'))
private fun rgbaStr(c: Int, a: Double): String =
    "rgba(${(c shr 16) and 255}, ${(c shr 8) and 255}, ${c and 255}, $a)"

private const val ACCENT_PURPLE = 0x7B2CBF
private const val ACCENT_GREEN = 0x30A46C

@Composable
fun AsciiStudio() {
    val isDark = ColorMode.current.isDark
    val borderColor = if (isDark) Res.Colors.GLASS_BOX_BORDER_COLOR_DARK else Res.Colors.GLASS_BOX_BORDER_COLOR_LIGHT
    val mutedText = if (isDark) Colors.DimGray else Colors.Gray
    val strongText = if (isDark) Colors.White else Colors.Black
    val cardBg = if (isDark) "rgba(255, 255, 255, 0.03)" else "rgba(0, 0, 0, 0.02)"

    val scope = rememberCoroutineScope()

    var activeSourceUrl by remember { mutableStateOf(SAMPLE_IMAGES.first().path) }
    var activeSourceLabel by remember { mutableStateOf(SAMPLE_IMAGES.first().label) }
    var customUrlInput by remember { mutableStateOf("") }

    var selectedPresetId by remember { mutableStateOf(AsciiArt.Maps.PRESETS.first().id) }
    var customMapText by remember { mutableStateOf(AsciiArt.Maps.THIRTY) }
    var columns by remember { mutableStateOf(80) }
    var charAspectRatio by remember { mutableStateOf(AsciiArt.DEFAULT_CHAR_ASPECT_RATIO) }
    var luminanceMode by remember { mutableStateOf(AsciiArt.LuminanceMode.REC_709) }
    var autoInvert by remember { mutableStateOf(true) }
    var manualInvert by remember { mutableStateOf(false) }
    var colored by remember { mutableStateOf(false) }
    var renderAsCanvas by remember { mutableStateOf(false) }
    var spaced by remember { mutableStateOf(false) }
    var fontSizeRem by remember { mutableStateOf(0.42) }

    var grid by remember { mutableStateOf<AsciiArt.AsciiGrid?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var statusToast by remember { mutableStateOf<String?>(null) }

    val effectiveInvert = if (autoInvert && !colored) !isDark else manualInvert
    val safeMap = customMapText.ifEmpty { AsciiArt.Maps.THIRTY }

    val options = remember(safeMap, columns, charAspectRatio, effectiveInvert, luminanceMode, spaced) {
        AsciiArt.AsciiOptions(
            map = safeMap,
            columns = columns.coerceIn(8, 240),
            charAspectRatio = charAspectRatio,
            invert = effectiveInvert,
            luminanceMode = luminanceMode,
            spaced = spaced,
        )
    }

    LaunchedEffect(activeSourceUrl, options) {
        if (activeSourceUrl.isBlank()) return@LaunchedEffect
        isLoading = true
        errorMessage = null
        try {
            grid = AsciiArt.fromUrl(activeSourceUrl, options)
        } catch (t: Throwable) {
            errorMessage = t.message ?: "Could not load or convert image."
        } finally {
            isLoading = false
        }
    }

    fun showToast(msg: String) {
        statusToast = msg
        window.setTimeout({
            if (statusToast == msg) statusToast = null
        }, 2500)
    }

    fun copyToClipboard(text: String, successMessage: String) {
        try {
            window.navigator.clipboard.writeText(text)
                .then { showToast(successMessage) }
                .catch { showToast("Clipboard unavailable in this browser context") }
        } catch (_: Throwable) {
            showToast("Clipboard unavailable in this browser context")
        }
    }

    fun downloadDataUrl(filename: String, dataUrl: String) {
        val anchor = document.createElement("a") as HTMLAnchorElement
        anchor.href = dataUrl
        anchor.download = filename
        document.body?.appendChild(anchor)
        anchor.click()
        document.body?.removeChild(anchor)
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 2.cssRem, bottom = 4.cssRem)
            .fontFamily(Res.Fonts.Space_Grotesk)
            .gap(1.25.cssRem),
        horizontalAlignment = Alignment.Start
    ) {
        SectionTitle("ASCII Art Studio")

        SpanText(
            text = "Convert any photo, icon, or uploaded image into ASCII art using Kasciffy character ramps, or copy a Kobweb AsciiImage(...) snippet directly into your site.",
            modifier = Modifier.color(mutedText).fontSize(0.95.cssRem).fontFamily(Res.Fonts.DM_SANS)
        )

        // 1. Source Selection Card
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(1.cssRem)
                .borderRadius(12.px)
                .border(1.px, LineStyle.Solid, borderColor)
                .styleModifier { property("background", cardBg) }
                .gap(0.75.cssRem)
        ) {
            SpanText(
                text = "1. Choose Image Source",
                modifier = Modifier.color(strongText).fontWeight(FontWeight.Bold).fontSize(0.95.cssRem)
            )

            // Built-in site presets
            Div(
                Modifier
                    .fillMaxWidth()
                    .styleModifier {
                        property("display", "flex")
                        property("flex-wrap", "wrap")
                        property("gap", "0.5rem")
                    }
                    .toAttrs()
            ) {
                for (sample in SAMPLE_IMAGES) {
                    val isSelected = activeSourceUrl == sample.path
                    Box(
                        modifier = AsciiPillStyle.toModifier()
                            .border(
                                1.px,
                                LineStyle.Solid,
                                if (isSelected) hexColor(ACCENT_PURPLE) else borderColor
                            )
                            .styleModifier {
                                property(
                                    "background",
                                    if (isSelected) rgbaStr(ACCENT_PURPLE, 0.22) else "transparent"
                                )
                            }
                            .onClick {
                                activeSourceUrl = sample.path
                                activeSourceLabel = sample.label
                            }
                    ) {
                        SpanText(
                            text = sample.label,
                            modifier = Modifier.color(strongText)
                                .fontWeight(if (isSelected) FontWeight.Bold else FontWeight.Normal)
                        )
                    }
                }
            }

            // File Upload + Custom URL row
            Div(
                Modifier
                    .fillMaxWidth()
                    .styleModifier {
                        property("display", "flex")
                        property("flex-wrap", "wrap")
                        property("gap", "0.75rem")
                        property("align-items", "center")
                    }
                    .toAttrs()
            ) {
                // Upload Local Image button wrapping hidden file input
                Box(
                    modifier = AsciiPillStyle.toModifier()
                        .border(1.px, LineStyle.Solid, hexColor(ACCENT_PURPLE))
                        .styleModifier { property("background", rgbaStr(ACCENT_PURPLE, 0.16)) }
                        .onClick {
                            (document.getElementById("ascii-file-upload") as? HTMLInputElement)?.click()
                        }
                ) {
                    SpanText(
                        text = "Upload Image File...",
                        modifier = Modifier.color(strongText).fontWeight(FontWeight.Bold)
                    )
                }

                Input(
                    type = InputType.File,
                    attrs = Modifier
                        .id("ascii-file-upload")
                        .styleModifier { property("display", "none") }
                        .toAttrs {
                            ref { el ->
                                el.accept = "image/*"
                                onDispose { }
                            }
                            onChange { ev ->
                                val input = ev.target as? HTMLInputElement
                                val file = input?.files?.get(0) ?: return@onChange
                                scope.launch {
                                    isLoading = true
                                    errorMessage = null
                                    try {
                                        val reader = org.w3c.files.FileReader()
                                        reader.onload = {
                                            val dataUrl = reader.result as? String
                                            if (!dataUrl.isNullOrEmpty()) {
                                                activeSourceLabel = file.name
                                                activeSourceUrl = dataUrl
                                            } else {
                                                errorMessage = "Uploaded file was empty"
                                                isLoading = false
                                            }
                                            null
                                        }
                                        reader.onerror = {
                                            errorMessage = "Failed to read uploaded file"
                                            isLoading = false
                                            null
                                        }
                                        reader.readAsDataURL(file)
                                    } catch (t: Throwable) {
                                        errorMessage = t.message ?: "Failed to read uploaded file"
                                        isLoading = false
                                    } finally {
                                        input.value = ""
                                    }
                                }
                            }
                        }
                )

                Input(
                    type = InputType.Text,
                    attrs = Modifier
                        .padding(topBottom = 0.35.cssRem, leftRight = 0.65.cssRem)
                        .borderRadius(8.px)
                        .border(1.px, LineStyle.Solid, borderColor)
                        .color(strongText)
                        .fontSize(0.85.cssRem)
                        .styleModifier {
                            property("background", "transparent")
                            property("flex", "1 1 220px")
                        }
                        .toAttrs {
                            placeholder("Or paste image URL / asset path (e.g. images/Photographs/Image 5.png)")
                            value(customUrlInput)
                            onInput { e -> customUrlInput = e.value }
                        }
                )

                Box(
                    modifier = AsciiPillStyle.toModifier()
                        .border(1.px, LineStyle.Solid, borderColor)
                        .onClick {
                            val trimmed = customUrlInput.trim()
                            if (trimmed.isNotEmpty()) {
                                activeSourceLabel = trimmed.substringAfterLast('/').ifEmpty { "Custom URL" }
                                activeSourceUrl = trimmed
                            }
                        }
                ) {
                    SpanText("Load URL", modifier = Modifier.color(strongText))
                }
            }
        }

        // 2. Conversion Parameters Card
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(1.cssRem)
                .borderRadius(12.px)
                .border(1.px, LineStyle.Solid, borderColor)
                .styleModifier { property("background", cardBg) }
                .gap(0.85.cssRem)
        ) {
            SpanText(
                text = "2. Character Ramp & Conversion Settings",
                modifier = Modifier.color(strongText).fontWeight(FontWeight.Bold).fontSize(0.95.cssRem)
            )

            // Character Map Presets (Kasciffy + Detailed)
            SpanText("Character Ramp Preset (Kasciffy Maps):", modifier = Modifier.color(mutedText).fontSize(0.82.cssRem))
            Div(
                Modifier
                    .fillMaxWidth()
                    .styleModifier {
                        property("display", "flex")
                        property("flex-wrap", "wrap")
                        property("gap", "0.45rem")
                    }
                    .toAttrs()
            ) {
                for (preset in AsciiArt.Maps.PRESETS) {
                    val isSelected = selectedPresetId == preset.id && customMapText == preset.map
                    Box(
                        modifier = AsciiPillStyle.toModifier()
                            .border(
                                1.px,
                                LineStyle.Solid,
                                if (isSelected) hexColor(ACCENT_PURPLE) else borderColor
                            )
                            .styleModifier {
                                property(
                                    "background",
                                    if (isSelected) rgbaStr(ACCENT_PURPLE, 0.22) else "transparent"
                                )
                            }
                            .onClick {
                                selectedPresetId = preset.id
                                customMapText = preset.map
                            }
                    ) {
                        SpanText(
                            text = preset.label,
                            modifier = Modifier.color(strongText)
                                .fontWeight(if (isSelected) FontWeight.Bold else FontWeight.Normal)
                        )
                    }
                }
            }

            // Editable Character Ramp Input
            Row(
                modifier = Modifier.fillMaxWidth().gap(0.6.cssRem),
                verticalAlignment = Alignment.CenterVertically
            ) {
                SpanText("Characters (dark→light):", modifier = Modifier.color(mutedText).fontSize(0.82.cssRem))
                Input(
                    type = InputType.Text,
                    attrs = Modifier
                        .padding(topBottom = 0.3.cssRem, leftRight = 0.6.cssRem)
                        .borderRadius(6.px)
                        .border(1.px, LineStyle.Solid, borderColor)
                        .color(strongText)
                        .fontSize(0.85.cssRem)
                        .styleModifier {
                            property("background", "transparent")
                            property("font-family", "monospace")
                            property("flex", "1")
                        }
                        .toAttrs {
                            value(customMapText)
                            onInput { e ->
                                if (e.value.isNotEmpty()) {
                                    customMapText = e.value
                                }
                            }
                        }
                )
            }

            // Columns & Aspect Ratio
            Div(
                Modifier
                    .fillMaxWidth()
                    .styleModifier {
                        property("display", "flex")
                        property("flex-wrap", "wrap")
                        property("gap", "1rem")
                        property("align-items", "center")
                    }
                    .toAttrs()
            ) {
                Row(modifier = Modifier.gap(0.4.cssRem), verticalAlignment = Alignment.CenterVertically) {
                    SpanText("Width (columns):", modifier = Modifier.color(mutedText).fontSize(0.82.cssRem))
                    for (colPreset in COLUMN_PRESETS) {
                        val active = columns == colPreset
                        Box(
                            modifier = AsciiPillStyle.toModifier()
                                .border(1.px, LineStyle.Solid, if (active) hexColor(ACCENT_PURPLE) else borderColor)
                                .styleModifier {
                                    property("background", if (active) rgbaStr(ACCENT_PURPLE, 0.22) else "transparent")
                                }
                                .onClick { columns = colPreset }
                        ) {
                            SpanText("$colPreset", modifier = Modifier.color(strongText))
                        }
                    }
                }

                Row(modifier = Modifier.gap(0.4.cssRem), verticalAlignment = Alignment.CenterVertically) {
                    SpanText("Cell Aspect:", modifier = Modifier.color(mutedText).fontSize(0.82.cssRem))
                    for ((label, ratio) in ASPECT_PRESETS) {
                        val active = charAspectRatio == ratio
                        Box(
                            modifier = AsciiPillStyle.toModifier()
                                .border(1.px, LineStyle.Solid, if (active) hexColor(ACCENT_PURPLE) else borderColor)
                                .styleModifier {
                                    property("background", if (active) rgbaStr(ACCENT_PURPLE, 0.22) else "transparent")
                                }
                                .onClick { charAspectRatio = ratio }
                        ) {
                            SpanText(label, modifier = Modifier.color(strongText))
                        }
                    }
                }
            }

            // Luminance & Rendering Toggles
            Div(
                Modifier
                    .fillMaxWidth()
                    .styleModifier {
                        property("display", "flex")
                        property("flex-wrap", "wrap")
                        property("gap", "0.5rem")
                        property("align-items", "center")
                    }
                    .toAttrs()
            ) {
                SpanText("Luminance:", modifier = Modifier.color(mutedText).fontSize(0.82.cssRem))
                for (mode in AsciiArt.LuminanceMode.entries) {
                    val active = luminanceMode == mode
                    Box(
                        modifier = AsciiPillStyle.toModifier()
                            .border(1.px, LineStyle.Solid, if (active) hexColor(ACCENT_PURPLE) else borderColor)
                            .styleModifier {
                                property("background", if (active) rgbaStr(ACCENT_PURPLE, 0.22) else "transparent")
                            }
                            .onClick { luminanceMode = mode }
                    ) {
                        SpanText(mode.label, modifier = Modifier.color(strongText))
                    }
                }
            }

            Div(
                Modifier
                    .fillMaxWidth()
                    .styleModifier {
                        property("display", "flex")
                        property("flex-wrap", "wrap")
                        property("gap", "0.5rem")
                        property("align-items", "center")
                    }
                    .toAttrs()
            ) {
                SpanText("Style:", modifier = Modifier.color(mutedText).fontSize(0.82.cssRem))

                Box(
                    modifier = AsciiPillStyle.toModifier()
                        .border(1.px, LineStyle.Solid, if (colored) hexColor(ACCENT_PURPLE) else borderColor)
                        .styleModifier {
                            property("background", if (colored) rgbaStr(ACCENT_PURPLE, 0.22) else "transparent")
                        }
                        .onClick { colored = !colored }
                ) {
                    SpanText(if (colored) "Colored: ON" else "Colored: OFF", modifier = Modifier.color(strongText))
                }

                Box(
                    modifier = AsciiPillStyle.toModifier()
                        .border(1.px, LineStyle.Solid, if (renderAsCanvas) hexColor(ACCENT_PURPLE) else borderColor)
                        .styleModifier {
                            property("background", if (renderAsCanvas) rgbaStr(ACCENT_PURPLE, 0.22) else "transparent")
                        }
                        .onClick { renderAsCanvas = !renderAsCanvas }
                ) {
                    SpanText(
                        if (renderAsCanvas) "Render: Canvas PNG" else "Render: Selectable Text",
                        modifier = Modifier.color(strongText)
                    )
                }

                Box(
                    modifier = AsciiPillStyle.toModifier()
                        .border(1.px, LineStyle.Solid, if (autoInvert) hexColor(ACCENT_PURPLE) else borderColor)
                        .styleModifier {
                            property("background", if (autoInvert) rgbaStr(ACCENT_PURPLE, 0.22) else "transparent")
                        }
                        .onClick { autoInvert = !autoInvert }
                ) {
                    SpanText(
                        if (autoInvert) "Auto Theme Invert: ON" else "Auto Theme Invert: OFF",
                        modifier = Modifier.color(strongText)
                    )
                }

                if (!autoInvert || colored) {
                    Box(
                        modifier = AsciiPillStyle.toModifier()
                            .border(1.px, LineStyle.Solid, if (manualInvert) hexColor(ACCENT_PURPLE) else borderColor)
                            .styleModifier {
                                property("background", if (manualInvert) rgbaStr(ACCENT_PURPLE, 0.22) else "transparent")
                            }
                            .onClick { manualInvert = !manualInvert }
                    ) {
                        SpanText(
                            if (manualInvert) "Inverted: ON" else "Inverted: OFF",
                            modifier = Modifier.color(strongText)
                        )
                    }
                }

                Box(
                    modifier = AsciiPillStyle.toModifier()
                        .border(1.px, LineStyle.Solid, if (spaced) hexColor(ACCENT_PURPLE) else borderColor)
                        .styleModifier {
                            property("background", if (spaced) rgbaStr(ACCENT_PURPLE, 0.22) else "transparent")
                        }
                        .onClick { spaced = !spaced }
                ) {
                    SpanText(if (spaced) "Spaced: ON" else "Spaced: OFF", modifier = Modifier.color(strongText))
                }

                Row(modifier = Modifier.gap(0.35.cssRem), verticalAlignment = Alignment.CenterVertically) {
                    SpanText("Zoom:", modifier = Modifier.color(mutedText).fontSize(0.82.cssRem))
                    Box(
                        modifier = AsciiPillStyle.toModifier()
                            .border(1.px, LineStyle.Solid, borderColor)
                            .onClick { fontSizeRem = (fontSizeRem - 0.06).coerceAtLeast(0.18) }
                    ) {
                        SpanText("−", modifier = Modifier.color(strongText))
                    }
                    Box(
                        modifier = AsciiPillStyle.toModifier()
                            .border(1.px, LineStyle.Solid, borderColor)
                            .onClick { fontSizeRem = (fontSizeRem + 0.06).coerceAtMost(1.2) }
                    ) {
                        SpanText("+", modifier = Modifier.color(strongText))
                    }
                }
            }
        }

        // 3. Export & Actions Row
        val currentGrid = grid
        Div(
            Modifier
                .fillMaxWidth()
                .styleModifier {
                    property("display", "flex")
                    property("flex-wrap", "wrap")
                    property("gap", "0.6rem")
                    property("align-items", "center")
                }
                .toAttrs()
        ) {
            Box(
                modifier = AsciiPillStyle.toModifier()
                    .border(1.px, LineStyle.Solid, hexColor(ACCENT_GREEN))
                    .styleModifier { property("background", rgbaStr(ACCENT_GREEN, 0.18)) }
                    .onClick {
                        val g = currentGrid ?: return@onClick
                        copyToClipboard(g.toPlainText(spaced), "Copied ASCII art (${g.width}×${g.height})!")
                    }
            ) {
                SpanText("Copy ASCII Text", modifier = Modifier.color(strongText).fontWeight(FontWeight.Bold))
            }

            Box(
                modifier = AsciiPillStyle.toModifier()
                    .border(1.px, LineStyle.Solid, hexColor(ACCENT_PURPLE))
                    .styleModifier { property("background", rgbaStr(ACCENT_PURPLE, 0.18)) }
                    .onClick {
                        val snippetSrc = if (activeSourceUrl.startsWith("data:")) {
                            "images/Photographs/Image 1.png"
                        } else {
                            activeSourceUrl
                        }
                        val snippet = AsciiArt.buildKobwebSnippet(
                            src = snippetSrc,
                            options = options,
                            colored = colored,
                            renderAsCanvas = renderAsCanvas,
                            autoInvertForColorMode = autoInvert,
                        )
                        copyToClipboard(snippet, "Copied Kobweb AsciiImage(...) snippet!")
                    }
            ) {
                SpanText("Copy Kobweb Widget Code", modifier = Modifier.color(strongText).fontWeight(FontWeight.Bold))
            }

            Box(
                modifier = AsciiPillStyle.toModifier()
                    .border(1.px, LineStyle.Solid, borderColor)
                    .onClick {
                        val g = currentGrid ?: return@onClick
                        val text = g.toPlainText(spaced)
                        val encoded = js("encodeURIComponent")(text) as String
                        downloadDataUrl("ascii-art.txt", "data:text/plain;charset=utf-8,$encoded")
                        showToast("Downloaded ascii-art.txt")
                    }
            ) {
                SpanText("Download .txt", modifier = Modifier.color(strongText))
            }

            Box(
                modifier = AsciiPillStyle.toModifier()
                    .border(1.px, LineStyle.Solid, borderColor)
                    .onClick {
                        val g = currentGrid ?: return@onClick
                        val bgHex = if (isDark) "#0D0D0D" else "#FFFFFF"
                        val fgHex = if (isDark) "#FFFFFF" else "#0D0D0D"
                        val canvas = AsciiArt.renderToCanvas(
                            grid = g,
                            colored = colored,
                            backgroundColor = bgHex,
                            textColor = fgHex,
                            fontSize = 14,
                            spaced = spaced,
                        )
                        downloadDataUrl("ascii-art.png", canvas.toDataURL("image/png"))
                        showToast("Downloaded ascii-art.png")
                    }
            ) {
                SpanText("Download .png", modifier = Modifier.color(strongText))
            }

            if (currentGrid != null) {
                SpanText(
                    text = "${activeSourceLabel} • ${currentGrid.width}×${currentGrid.height} chars",
                    modifier = Modifier.color(mutedText).fontSize(0.82.cssRem)
                )
            }

            if (statusToast != null) {
                SpanText(
                    text = statusToast!!,
                    modifier = Modifier.color(hexColor(ACCENT_GREEN)).fontWeight(FontWeight.Bold).fontSize(0.85.cssRem)
                )
            }
        }

        // 4. ASCII Output Preview Box
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(1.cssRem)
                .borderRadius(12.px)
                .border(1.px, LineStyle.Solid, borderColor)
                .overflow(Overflow.Auto)
                .styleModifier {
                    property("background", if (isDark) "#0A0A0A" else "#FAFAFA")
                    property("min-height", "280px")
                },
            contentAlignment = Alignment.Center
        ) {
            when {
                isLoading && currentGrid == null -> {
                    SpanText("Converting image to ASCII art...", modifier = Modifier.color(mutedText))
                }
                errorMessage != null -> {
                    SpanText(errorMessage!!, modifier = Modifier.color(Colors.IndianRed))
                }
                currentGrid != null -> {
                    AsciiArtView(
                        grid = currentGrid,
                        colored = colored,
                        renderAsCanvas = renderAsCanvas,
                        spaced = spaced,
                        alphaThreshold = options.alphaThreshold,
                        fontSize = fontSizeRem.cssRem,
                        lineHeight = 1.0,
                        alt = activeSourceLabel,
                    )
                }
            }
        }
    }
}
