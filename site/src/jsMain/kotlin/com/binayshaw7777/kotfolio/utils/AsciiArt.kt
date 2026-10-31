package com.binayshaw7777.kotfolio.utils

import kotlinx.browser.document
import org.khronos.webgl.Uint8ClampedArray
import org.khronos.webgl.get
import org.w3c.dom.CanvasRenderingContext2D
import org.w3c.dom.HTMLCanvasElement
import org.w3c.dom.HTMLImageElement
import org.w3c.files.Blob
import org.w3c.files.FileReader
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Client-side image-to-ASCII art conversion engine and presets.
 *
 * Includes all character ramps from the `kasciffy` library (`dev.gmitch215.kasciffy`)
 * along with perceptual luminance modes, aspect-ratio correction for monospace fonts,
 * single-pass HTML5 Canvas `ImageData` extraction, and both plain-text and canvas output.
 */
object AsciiArt {

    const val DEFAULT_COLUMNS = 80
    const val DEFAULT_CHAR_ASPECT_RATIO = 0.5
    const val DEFAULT_ALPHA_THRESHOLD = 16

    /**
     * Character maps ordered from densest/heaviest (index 0) to lightest/empty (last index),
     * matching the `kasciffy` convention (`dev.gmitch215.kasciffy.api.AsciiMaps`).
     */
    object Maps {
        const val DETAILED = "\$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. "
        const val THIRTY = "@\$#%[]{}()&?/\\|<>o+=x~;:-,`._ "
        const val TWENTY = "@&\$%#?!o+=x^~;:-,.` "
        const val FIFTEEN = "@&\$%#0?ol+=-:. "
        const val TWELVE = "@&\$%#=+~-_. "
        const val TEN = "@&\$%#=+_. "
        const val TEN_NUMERIC = "098654271 "
        const val FIVE = "@#\$. "
        const val FIVE_BLOCK = "█▓▒░ "
        const val FOUR_BLOCK = "█▓▒░"
        const val TWO = "@ "
        const val TWO_BLOCK = "█ "

        data class Preset(val id: String, val label: String, val map: String)

        val PRESETS: List<Preset> = listOf(
            Preset("thirty", "Kasciffy 30 (Default)", THIRTY),
            Preset("twenty", "Kasciffy 20", TWENTY),
            Preset("fifteen", "Kasciffy 15", FIFTEEN),
            Preset("twelve", "Kasciffy 12", TWELVE),
            Preset("ten", "Kasciffy 10", TEN),
            Preset("ten_numeric", "Kasciffy 10 Numeric", TEN_NUMERIC),
            Preset("five", "Kasciffy 5", FIVE),
            Preset("five_block", "Kasciffy 5 Block", FIVE_BLOCK),
            Preset("four_block", "Kasciffy 4 Block", FOUR_BLOCK),
            Preset("two", "Kasciffy 2", TWO),
            Preset("two_block", "Kasciffy 2 Block", TWO_BLOCK),
            Preset("detailed", "Detailed (70 chars)", DETAILED),
        )
    }

    /**
     * Formula used to convert RGB channels (0..255) into a grayscale luminance value (0..255).
     */
    enum class LuminanceMode(val label: String) {
        /** ITU-R BT.709 perceptual luminance: `0.2126 R + 0.7152 G + 0.0722 B`. */
        REC_709("Perceptual (Rec. 709)"),

        /** ITU-R BT.601 luma: `0.299 R + 0.587 G + 0.114 B`. */
        REC_601("Standard (Rec. 601)"),

        /** Arithmetic mean: `(R + G + B) / 3`. */
        AVERAGE("Average"),

        /** Kasciffy library weights: `0.34 R + 0.16 G + 0.50 B`. */
        KASCIFFY("Kasciffy (0.34R / 0.16G / 0.50B)");

        fun compute(r: Int, g: Int, b: Int): Int {
            val raw = when (this) {
                REC_709 -> 0.2126 * r + 0.7152 * g + 0.0722 * b
                REC_601 -> 0.299 * r + 0.587 * g + 0.114 * b
                AVERAGE -> (r + g + b) / 3.0
                KASCIFFY -> 0.34 * r + 0.16 * g + 0.50 * b
            }
            return if (this == KASCIFFY) {
                raw.toInt().coerceIn(0, 255)
            } else {
                raw.roundToInt().coerceIn(0, 255)
            }
        }
    }

    /**
     * Configuration for converting an image into ASCII art.
     *
     * @property map Character ramp ordered from densest (index 0) to lightest (last index).
     * @property columns Target output width in characters. Takes precedence over [downScale] when non-null.
     * @property downScale Pixel downscale divisor (Kasciffy-style). Used when [columns] is `null`.
     * @property charAspectRatio Width-to-height ratio of a monospace character cell (typically `0.5`).
     *   Use `1.0` for unadjusted 1:1 pixel sampling.
     * @property invert When `false` (default, suited for dark backgrounds), bright pixels map to dense
     *   characters (`map.first()`) and dark pixels map to light characters (`map.last()`).
     *   When `true` (suited for light backgrounds), dark pixels map to dense characters and bright pixels to light.
     * @property luminanceMode RGB-to-grayscale conversion formula.
     * @property alphaThreshold Pixels with alpha below this value (`0..255`) are treated as transparent (`' '`).
     * @property sampleArea When `true`, averages all pixels in each cell's bounding box; when `false`,
     *   point-samples the top-left pixel of each cell.
     * @property spaced When `true`, inserts a space after each character in plain-text/canvas output.
     */
    data class AsciiOptions(
        val map: String = Maps.THIRTY,
        val columns: Int? = DEFAULT_COLUMNS,
        val downScale: Int? = null,
        val charAspectRatio: Double = DEFAULT_CHAR_ASPECT_RATIO,
        val invert: Boolean = false,
        val luminanceMode: LuminanceMode = LuminanceMode.REC_709,
        val alphaThreshold: Int = DEFAULT_ALPHA_THRESHOLD,
        val sampleArea: Boolean = true,
        val spaced: Boolean = false,
    ) {
        init {
            require(map.isNotEmpty()) { "ASCII character map must not be empty" }
            require(columns == null || columns > 0) { "columns must be positive when specified, was $columns" }
            require(downScale == null || downScale > 0) { "downScale must be positive when specified, was $downScale" }
            require(charAspectRatio.isFinite() && charAspectRatio > 0.0) {
                "charAspectRatio must be a finite positive number, was $charAspectRatio"
            }
            require(alphaThreshold in 0..255) { "alphaThreshold must be in 0..255, was $alphaThreshold" }
        }
    }

    /**
     * A single converted character cell with its sampled RGBA color and computed luminance.
     */
    data class AsciiCell(
        val char: Char,
        val r: Int,
        val g: Int,
        val b: Int,
        val a: Int,
        val luminance: Int,
    ) {
        fun cssRgb(): String = "rgb($r, $g, $b)"
        fun hexColor(): String =
            "#" + r.toString(16).padStart(2, '0') +
                g.toString(16).padStart(2, '0') +
                b.toString(16).padStart(2, '0')
    }

    /**
     * 2D grid of converted [AsciiCell]s.
     */
    data class AsciiGrid(
        val width: Int,
        val height: Int,
        val rows: List<List<AsciiCell>>,
    ) {
        val isEmpty: Boolean get() = width <= 0 || height <= 0 || rows.isEmpty()

        /**
         * Formats a single row as a string, optionally inserting a space after each character.
         */
        fun formatRow(rowIndex: Int, spaced: Boolean = false): String {
            val row = rows.getOrNull(rowIndex) ?: return ""
            if (!spaced) {
                val chars = CharArray(row.size) { i -> row[i].char }
                return chars.concatToString()
            }
            val sb = StringBuilder(row.size * 2)
            for (cell in row) {
                sb.append(cell.char).append(' ')
            }
            return sb.toString()
        }

        /**
         * Lines of the ASCII art without trailing newlines.
         */
        fun toLines(spaced: Boolean = false): List<String> =
            List(rows.size) { idx -> formatRow(idx, spaced) }

        /**
         * Full multi-line ASCII string separated by `\n`.
         */
        fun toPlainText(spaced: Boolean = false): String =
            if (isEmpty) "" else toLines(spaced).joinToString("\n")
    }

    /**
     * Maps a luminance value (`0..255`) and alpha (`0..255`) to a character from [options].
     */
    fun mapLuminanceToChar(
        luminance: Int,
        alpha: Int = 255,
        options: AsciiOptions = AsciiOptions(),
    ): Char {
        if (alpha < options.alphaThreshold) return ' '
        val clampedLum = luminance.coerceIn(0, 255)
        val map = options.map
        if (map.length == 1) return map[0]
        // By default (invert = false), map is reversed so 0 (dark) -> last char (' ') and 255 (bright) -> first char ('@')
        val scaled = if (options.invert) {
            (255 - clampedLum) * (map.length - 1)
        } else {
            clampedLum * (map.length - 1)
        }
        val effectiveIdx = (scaled / 255.0).roundToInt()
        val charIndex = (map.length - 1 - effectiveIdx).coerceIn(0, map.length - 1)
        return map[charIndex]
    }

    /**
     * Computes the target `(outWidth, outHeight)` in characters for an image of `(imageWidth, imageHeight)`.
     */
    fun computeOutputDimensions(
        imageWidth: Int,
        imageHeight: Int,
        options: AsciiOptions = AsciiOptions(),
    ): Pair<Int, Int> {
        if (imageWidth <= 0 || imageHeight <= 0) return 0 to 0

        val outWidth = when {
            options.columns != null -> options.columns
            options.downScale != null -> max(1, imageWidth / options.downScale)
            else -> min(imageWidth, DEFAULT_COLUMNS).coerceAtLeast(1)
        }

        val rawHeight = if (options.columns == null && options.downScale != null) {
            (imageHeight.toDouble() / options.downScale) * options.charAspectRatio
        } else {
            imageHeight.toDouble() * (outWidth.toDouble() / imageWidth.toDouble()) * options.charAspectRatio
        }
        val outHeight = rawHeight.roundToInt().coerceAtLeast(1)
        return outWidth to outHeight
    }

    /**
     * Converts raw RGBA byte data (`[R, G, B, A, ...]` of length `>= imageWidth * imageHeight * 4`)
     * into an [AsciiGrid].
     */
    fun convertRgbaBuffer(
        rgba: ByteArray,
        imageWidth: Int,
        imageHeight: Int,
        options: AsciiOptions = AsciiOptions(),
    ): AsciiGrid {
        if (imageWidth <= 0 || imageHeight <= 0) {
            return AsciiGrid(0, 0, emptyList())
        }
        val expectedBytes = imageWidth * imageHeight * 4
        require(rgba.size >= expectedBytes) {
            "RGBA buffer too small: expected at least $expectedBytes bytes for ${imageWidth}x${imageHeight}, got ${rgba.size}"
        }

        val (outWidth, outHeight) = computeOutputDimensions(imageWidth, imageHeight, options)
        val rows = ArrayList<List<AsciiCell>>(outHeight)

        for (cy in 0 until outHeight) {
            val y0 = ((cy.toLong() * imageHeight) / outHeight).toInt().coerceIn(0, imageHeight - 1)
            val y1 = if (options.sampleArea) {
                max(y0 + 1, (((cy + 1).toLong() * imageHeight) / outHeight).toInt()).coerceAtMost(imageHeight)
            } else {
                y0 + 1
            }

            val row = ArrayList<AsciiCell>(outWidth)
            for (cx in 0 until outWidth) {
                val x0 = ((cx.toLong() * imageWidth) / outWidth).toInt().coerceIn(0, imageWidth - 1)
                val x1 = if (options.sampleArea) {
                    max(x0 + 1, (((cx + 1).toLong() * imageWidth) / outWidth).toInt()).coerceAtMost(imageWidth)
                } else {
                    x0 + 1
                }

                var sumR = 0.0
                var sumG = 0.0
                var sumB = 0.0
                var sumA = 0
                var weightSum = 0.0
                var count = 0

                for (py in y0 until y1) {
                    val rowOffset = py * imageWidth * 4
                    for (px in x0 until x1) {
                        val idx = rowOffset + px * 4
                        val r = rgba[idx].toInt() and 0xFF
                        val g = rgba[idx + 1].toInt() and 0xFF
                        val b = rgba[idx + 2].toInt() and 0xFF
                        val a = rgba[idx + 3].toInt() and 0xFF
                        val w = a / 255.0
                        sumR += r * w
                        sumG += g * w
                        sumB += b * w
                        weightSum += w
                        sumA += a
                        count++
                    }
                }

                val avgA = if (count > 0) (sumA.toDouble() / count).roundToInt().coerceIn(0, 255) else 0
                val avgR: Int
                val avgG: Int
                val avgB: Int
                if (weightSum > 0.0) {
                    avgR = (sumR / weightSum).roundToInt().coerceIn(0, 255)
                    avgG = (sumG / weightSum).roundToInt().coerceIn(0, 255)
                    avgB = (sumB / weightSum).roundToInt().coerceIn(0, 255)
                } else {
                    avgR = 0
                    avgG = 0
                    avgB = 0
                }

                val lum = options.luminanceMode.compute(avgR, avgG, avgB)
                val ch = mapLuminanceToChar(lum, avgA, options)
                row.add(AsciiCell(ch, avgR, avgG, avgB, avgA, lum))
            }
            rows.add(row)
        }

        return AsciiGrid(outWidth, outHeight, rows)
    }

    /**
     * Converts packed ARGB (`0xAARRGGBB`) integer pixels of length `>= imageWidth * imageHeight`
     * into an [AsciiGrid]. If alpha bits (`0xFF000000`) are all zero for every pixel in the array,
     * pixels are treated as opaque RGB (`0xRRGGBB` with `alpha = 255`).
     */
    fun convertArgbPixels(
        pixels: IntArray,
        imageWidth: Int,
        imageHeight: Int,
        options: AsciiOptions = AsciiOptions(),
    ): AsciiGrid {
        if (imageWidth <= 0 || imageHeight <= 0) {
            return AsciiGrid(0, 0, emptyList())
        }
        val expectedPixels = imageWidth * imageHeight
        require(pixels.size >= expectedPixels) {
            "Pixel array too small: expected at least $expectedPixels pixels for ${imageWidth}x${imageHeight}, got ${pixels.size}"
        }

        var hasAnyAlpha = false
        for (i in 0 until expectedPixels) {
            if ((pixels[i] ushr 24) != 0) {
                hasAnyAlpha = true
                break
            }
        }

        val rgba = ByteArray(expectedPixels * 4)
        for (i in 0 until expectedPixels) {
            val p = pixels[i]
            val a = if (hasAnyAlpha) (p ushr 24) and 0xFF else 255
            val r = (p ushr 16) and 0xFF
            val g = (p ushr 8) and 0xFF
            val b = p and 0xFF
            val base = i * 4
            rgba[base] = r.toByte()
            rgba[base + 1] = g.toByte()
            rgba[base + 2] = b.toByte()
            rgba[base + 3] = a.toByte()
        }
        return convertRgbaBuffer(rgba, imageWidth, imageHeight, options)
    }

    /**
     * Extracts pixels from an [HTMLCanvasElement] in a single `getImageData` call and converts them to an [AsciiGrid].
     */
    fun fromCanvas(
        canvas: HTMLCanvasElement,
        options: AsciiOptions = AsciiOptions(),
    ): AsciiGrid {
        val w = canvas.width
        val h = canvas.height
        if (w <= 0 || h <= 0) return AsciiGrid(0, 0, emptyList())
        val ctx = canvas.getContext("2d") as? CanvasRenderingContext2D
            ?: throw IllegalStateException("Failed to acquire 2D rendering context from canvas")
        val imageData = ctx.getImageData(0.0, 0.0, w.toDouble(), h.toDouble())
        val data: Uint8ClampedArray = imageData.data
        val len = data.length
        val bytes = ByteArray(len) { i -> data[i] }
        return convertRgbaBuffer(bytes, w, h, options)
    }

    /**
     * Draws an already-loaded [HTMLImageElement] onto an offscreen canvas and converts it to an [AsciiGrid].
     *
     * If the image is an SVG without explicit `width`/`height` attributes (where `naturalWidth`/`naturalHeight`
     * and `width`/`height` may report `0` on an unattached `<img>`), falls back to [defaultWidth] x [defaultHeight].
     */
    fun fromImageElement(
        img: HTMLImageElement,
        options: AsciiOptions = AsciiOptions(),
        defaultWidth: Int = 256,
        defaultHeight: Int = 256,
    ): AsciiGrid {
        val rawW = if (img.naturalWidth > 0) img.naturalWidth else img.width
        val rawH = if (img.naturalHeight > 0) img.naturalHeight else img.height
        val isSvgSource = img.src.startsWith("data:image/svg", ignoreCase = true) ||
            img.src.substringBefore('?').substringBefore('#').endsWith(".svg", ignoreCase = true)
        val w = if (rawW > 0) rawW else if (isSvgSource) defaultWidth else 0
        val h = if (rawH > 0) rawH else if (isSvgSource) defaultHeight else 0
        if (w <= 0 || h <= 0) return AsciiGrid(0, 0, emptyList())
        val canvas = document.createElement("canvas") as HTMLCanvasElement
        canvas.width = w
        canvas.height = h
        val ctx = canvas.getContext("2d") as CanvasRenderingContext2D
        ctx.drawImage(img, 0.0, 0.0, w.toDouble(), h.toDouble())
        return fromCanvas(canvas, options)
    }

    /**
     * Normalizes a relative site asset path (such as [Res.Images.IMAGE_1]) so it resolves from the site root
     * regardless of the current page route, while leaving `http://`, `https://`, `data:`, `blob:`, and `/`-prefixed URLs untouched.
     */
    fun resolveAssetUrl(url: String, autoPrefix: Boolean = true): String {
        val trimmed = url.trim()
        if (!autoPrefix || trimmed.isEmpty()) return trimmed
        val lower = trimmed.lowercase()
        return if (
            trimmed.startsWith("/") ||
            lower.startsWith("http://") ||
            lower.startsWith("https://") ||
            lower.startsWith("data:") ||
            lower.startsWith("blob:")
        ) {
            trimmed
        } else {
            "/$trimmed"
        }
    }

    /**
     * Asynchronously loads an image from [url] (supporting PNG, JPEG, WebP, SVG, GIF, or Data URLs)
     * and converts it into an [AsciiGrid].
     */
    suspend fun fromUrl(
        url: String,
        options: AsciiOptions = AsciiOptions(),
        autoPrefix: Boolean = true,
    ): AsciiGrid {
        val resolved = resolveAssetUrl(url, autoPrefix)
        require(resolved.isNotEmpty()) { "Image URL must not be blank" }
        val img = loadImageElement(resolved)
        return fromImageElement(img, options)
    }

    /**
     * Asynchronously reads a browser [Blob] / `File` via `FileReader` and converts it into an [AsciiGrid].
     */
    suspend fun fromBlob(
        blob: Blob,
        options: AsciiOptions = AsciiOptions(),
    ): AsciiGrid {
        val dataUrl = readBlobAsDataUrl(blob)
        return fromUrl(dataUrl, options)
    }

    /**
     * Renders an [AsciiGrid] onto an [HTMLCanvasElement] for display or PNG download (`canvas.toDataURL("image/png")`).
     */
    fun renderToCanvas(
        grid: AsciiGrid,
        colored: Boolean = false,
        backgroundColor: String = "#0D0D0D",
        textColor: String = "#FFFFFF",
        fontName: String = "monospace",
        fontSize: Int = 12,
        spaced: Boolean = false,
        alphaThreshold: Int = DEFAULT_ALPHA_THRESHOLD,
    ): HTMLCanvasElement {
        val canvas = document.createElement("canvas") as HTMLCanvasElement
        if (grid.isEmpty) {
            canvas.width = 1
            canvas.height = 1
            return canvas
        }

        val safeFontSize = fontSize.coerceAtLeast(4)
        val ctx = canvas.getContext("2d") as CanvasRenderingContext2D
        val fontSpec = "${safeFontSize}px $fontName"
        ctx.font = fontSpec

        val lines = grid.toLines(spaced)
        val lineHeight = safeFontSize * 1.15
        val measuredWidth = lines.maxOfOrNull { ctx.measureText(it).width } ?: (grid.width * safeFontSize * 0.6)
        val padding = safeFontSize
        val canvasWidth = (measuredWidth + padding * 2).roundToInt().coerceAtLeast(1)
        val canvasHeight = (lineHeight * lines.size + padding * 2).roundToInt().coerceAtLeast(1)

        canvas.width = canvasWidth
        canvas.height = canvasHeight

        // Re-apply context state after resizing canvas
        ctx.fillStyle = backgroundColor
        ctx.fillRect(0.0, 0.0, canvasWidth.toDouble(), canvasHeight.toDouble())
        ctx.font = fontSpec

        if (!colored) {
            ctx.fillStyle = textColor
            for ((index, line) in lines.withIndex()) {
                val y = padding + (index + 0.85) * lineHeight
                ctx.fillText(line, padding.toDouble(), y)
            }
        } else {
            val charAdvance = if (grid.width > 0) measuredWidth / (grid.width * (if (spaced) 2 else 1)) else safeFontSize * 0.6
            val stepX = charAdvance * (if (spaced) 2 else 1)
            for ((rowIdx, row) in grid.rows.withIndex()) {
                val y = padding + (rowIdx + 0.85) * lineHeight
                for ((colIdx, cell) in row.withIndex()) {
                    if (cell.char == ' ' || cell.a < alphaThreshold) continue
                    ctx.fillStyle = cell.cssRgb()
                    val x = padding + colIdx * stepX
                    ctx.fillText(cell.char.toString(), x, y)
                }
            }
        }

        return canvas
    }

    /**
     * Generates a ready-to-paste Kotlin/Kobweb `AsciiImage(...)` call for the given [src] and [options].
     */
    fun buildKobwebSnippet(
        src: String,
        options: AsciiOptions = AsciiOptions(),
        colored: Boolean = false,
        renderAsCanvas: Boolean = false,
        autoInvertForColorMode: Boolean = true,
    ): String {
        val escapedSrc = src
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("$", "\\$")
        val mapArg = Maps.PRESETS.firstOrNull { it.map == options.map }?.let { preset ->
            when (preset.id) {
                "thirty" -> "AsciiArt.Maps.THIRTY"
                "twenty" -> "AsciiArt.Maps.TWENTY"
                "fifteen" -> "AsciiArt.Maps.FIFTEEN"
                "twelve" -> "AsciiArt.Maps.TWELVE"
                "ten" -> "AsciiArt.Maps.TEN"
                "ten_numeric" -> "AsciiArt.Maps.TEN_NUMERIC"
                "five" -> "AsciiArt.Maps.FIVE"
                "five_block" -> "AsciiArt.Maps.FIVE_BLOCK"
                "four_block" -> "AsciiArt.Maps.FOUR_BLOCK"
                "two" -> "AsciiArt.Maps.TWO"
                "two_block" -> "AsciiArt.Maps.TWO_BLOCK"
                "detailed" -> "AsciiArt.Maps.DETAILED"
                else -> null
            }
        } ?: ("\"" + options.map
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("$", "\\$") + "\"")

        return buildString {
            appendLine("AsciiImage(")
            appendLine("    src = \"$escapedSrc\",")
            if (options.columns != null) {
                appendLine("    columns = ${options.columns},")
            }
            appendLine("    map = $mapArg,")
            if (options.charAspectRatio != DEFAULT_CHAR_ASPECT_RATIO) {
                appendLine("    charAspectRatio = ${options.charAspectRatio},")
            }
            if (options.luminanceMode != LuminanceMode.REC_709) {
                appendLine("    luminanceMode = AsciiArt.LuminanceMode.${options.luminanceMode.name},")
            }
            if (colored) {
                appendLine("    colored = true,")
            }
            if (renderAsCanvas) {
                appendLine("    renderAsCanvas = true,")
            }
            if (!autoInvertForColorMode) {
                appendLine("    autoInvertForColorMode = false,")
                if (options.invert) {
                    appendLine("    invert = true,")
                }
            } else if (colored && options.invert) {
                appendLine("    invert = true,")
            }
            if (options.spaced) {
                appendLine("    spaced = true,")
            }
            append(")")
        }
    }

    private suspend fun loadImageElement(url: String): HTMLImageElement = suspendCoroutine { cont ->
        val img = document.createElement("img") as HTMLImageElement
        if (url.startsWith("http://") || url.startsWith("https://")) {
            img.crossOrigin = "anonymous"
        }
        img.onload = {
            cont.resume(img)
        }
        img.onerror = { _, _, _, _, _ ->
            cont.resumeWithException(IllegalArgumentException("Failed to load image: $url"))
        }
        img.src = url
    }

    private suspend fun readBlobAsDataUrl(blob: Blob): String = suspendCoroutine { cont ->
        val reader = FileReader()
        reader.onload = {
            val result = reader.result as? String
            if (result != null) {
                cont.resume(result)
            } else {
                cont.resumeWithException(IllegalStateException("FileReader produced empty result"))
            }
        }
        reader.onerror = {
            cont.resumeWithException(IllegalStateException("Failed to read image file"))
        }
        reader.readAsDataURL(blob)
    }
}
