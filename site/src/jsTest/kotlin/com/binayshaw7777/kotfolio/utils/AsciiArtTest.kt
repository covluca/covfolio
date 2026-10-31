package com.binayshaw7777.kotfolio.utils

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AsciiArtTest {

    @Test
    fun testKasciffyMapsAndPresets() {
        assertEquals(30, AsciiArt.Maps.THIRTY.length)
        assertEquals(20, AsciiArt.Maps.TWENTY.length)
        assertEquals(15, AsciiArt.Maps.FIFTEEN.length)
        assertEquals(12, AsciiArt.Maps.TWELVE.length)
        assertEquals(10, AsciiArt.Maps.TEN.length)
        assertEquals(10, AsciiArt.Maps.TEN_NUMERIC.length)
        assertEquals(5, AsciiArt.Maps.FIVE.length)
        assertEquals(5, AsciiArt.Maps.FIVE_BLOCK.length)
        assertEquals(4, AsciiArt.Maps.FOUR_BLOCK.length)
        assertEquals(2, AsciiArt.Maps.TWO.length)
        assertEquals(2, AsciiArt.Maps.TWO_BLOCK.length)
        assertEquals(70, AsciiArt.Maps.DETAILED.length)

        assertTrue(AsciiArt.Maps.PRESETS.isNotEmpty())
        for (preset in AsciiArt.Maps.PRESETS) {
            assertTrue(preset.id.isNotBlank())
            assertTrue(preset.label.isNotBlank())
            assertTrue(preset.map.isNotEmpty())
        }
    }

    @Test
    fun testLuminanceModes() {
        // Pure black & white
        for (mode in AsciiArt.LuminanceMode.entries) {
            assertEquals(0, mode.compute(0, 0, 0))
            assertEquals(255, mode.compute(255, 255, 255))
        }

        // Rec. 709 weights green heavily (0.7152), then red (0.2126), then blue (0.0722)
        val r709 = AsciiArt.LuminanceMode.REC_709.compute(255, 0, 0)
        val g709 = AsciiArt.LuminanceMode.REC_709.compute(0, 255, 0)
        val b709 = AsciiArt.LuminanceMode.REC_709.compute(0, 0, 255)
        assertTrue(g709 > r709 && r709 > b709)

        // Kasciffy weights: 0.34 R + 0.16 G + 0.50 B (truncated to Int)
        assertEquals(86, AsciiArt.LuminanceMode.KASCIFFY.compute(255, 0, 0))
        assertEquals(40, AsciiArt.LuminanceMode.KASCIFFY.compute(0, 255, 0))
        assertEquals(127, AsciiArt.LuminanceMode.KASCIFFY.compute(0, 0, 255))

        // Average
        assertEquals(100, AsciiArt.LuminanceMode.AVERAGE.compute(50, 100, 150))
    }

    @Test
    fun testMapLuminanceToChar() {
        val defaultOpts = AsciiArt.AsciiOptions(map = "@#+. ", invert = false)
        // invert = false (dark background): 0 -> ' ', 255 -> '@'
        assertEquals(' ', AsciiArt.mapLuminanceToChar(0, 255, defaultOpts))
        assertEquals('@', AsciiArt.mapLuminanceToChar(255, 255, defaultOpts))
        assertEquals('+', AsciiArt.mapLuminanceToChar(128, 255, defaultOpts))

        // invert = true (light background): 0 -> '@', 255 -> ' '
        val invertedOpts = defaultOpts.copy(invert = true)
        assertEquals('@', AsciiArt.mapLuminanceToChar(0, 255, invertedOpts))
        assertEquals(' ', AsciiArt.mapLuminanceToChar(255, 255, invertedOpts))

        // Transparent pixel below alphaThreshold always maps to ' '
        assertEquals(' ', AsciiArt.mapLuminanceToChar(255, 0, defaultOpts))
        assertEquals(' ', AsciiArt.mapLuminanceToChar(0, 10, invertedOpts))

        // Single-char map does not divide by zero
        val singleCharOpts = AsciiArt.AsciiOptions(map = "#")
        assertEquals('#', AsciiArt.mapLuminanceToChar(0, 255, singleCharOpts))
        assertEquals('#', AsciiArt.mapLuminanceToChar(255, 255, singleCharOpts))
        assertEquals(' ', AsciiArt.mapLuminanceToChar(255, 0, singleCharOpts))

        // Out-of-bounds luminance values are safely clamped
        assertEquals(' ', AsciiArt.mapLuminanceToChar(-100, 255, defaultOpts))
        assertEquals('@', AsciiArt.mapLuminanceToChar(999, 255, defaultOpts))
    }

    @Test
    fun testComputeOutputDimensions() {
        assertEquals(0 to 0, AsciiArt.computeOutputDimensions(0, 100))
        assertEquals(0 to 0, AsciiArt.computeOutputDimensions(100, 0))
        assertEquals(0 to 0, AsciiArt.computeOutputDimensions(-10, -20))

        // 200x100 image at 80 columns and 0.5 charAspectRatio -> 80x20
        val opts80 = AsciiArt.AsciiOptions(columns = 80, charAspectRatio = 0.5)
        assertEquals(80 to 20, AsciiArt.computeOutputDimensions(200, 100, opts80))

        // 200x100 image at 80 columns and 1.0 charAspectRatio -> 80x40
        val optsSquare = AsciiArt.AsciiOptions(columns = 80, charAspectRatio = 1.0)
        assertEquals(80 to 40, AsciiArt.computeOutputDimensions(200, 100, optsSquare))

        // Explicit downScale (columns = null)
        val optsDownscale = AsciiArt.AsciiOptions(columns = null, downScale = 4, charAspectRatio = 1.0)
        assertEquals(50 to 25, AsciiArt.computeOutputDimensions(200, 100, optsDownscale))

        // Aggressive downScale larger than image still clamps to at least 1x1
        val optsHugeDownscale = AsciiArt.AsciiOptions(columns = null, downScale = 5000, charAspectRatio = 0.5)
        assertEquals(1 to 1, AsciiArt.computeOutputDimensions(200, 100, optsHugeDownscale))
    }

    @Test
    fun testConvertRgbaBufferAndUnsignedByteHandling() {
        // 2x2 image:
        // (0,0) = black (0,0,0,255)      (1,0) = white (255,255,255,255)
        // (0,1) = transparent (255,0,0,0) (1,1) = mid-gray (128,128,128,255)
        val rgba = byteArrayOf(
            0, 0, 0, 255.toByte(),
            255.toByte(), 255.toByte(), 255.toByte(), 255.toByte(),
            255.toByte(), 0, 0, 0,
            128.toByte(), 128.toByte(), 128.toByte(), 255.toByte(),
        )
        val opts = AsciiArt.AsciiOptions(
            map = "@+. ",
            columns = 2,
            charAspectRatio = 1.0,
            invert = false,
            sampleArea = false,
        )
        val grid = AsciiArt.convertRgbaBuffer(rgba, 2, 2, opts)
        assertFalse(grid.isEmpty)
        assertEquals(2, grid.width)
        assertEquals(2, grid.height)
        assertEquals(" @\n +", grid.toPlainText(spaced = false))
        assertEquals("  @ \n  + ", grid.toPlainText(spaced = true))

        // Verify cell RGB & hex formatting
        assertEquals("#ffffff", grid.rows[0][1].hexColor())
        assertEquals("rgb(255, 255, 255)", grid.rows[0][1].cssRgb())
    }

    @Test
    fun testConvertArgbPixelsOpaqueAndAlpha() {
        // Opaque RGB ints (alpha byte 0x00 -> auto-treated as 255 when all alpha bytes are 0)
        val rgbPixels = intArrayOf(
            0x000000, 0xFFFFFF,
            0xFFFFFF, 0x000000,
        )
        val opts = AsciiArt.AsciiOptions(
            map = AsciiArt.Maps.TWO, // "@ "
            columns = 2,
            charAspectRatio = 1.0,
            invert = false,
        )
        val grid = AsciiArt.convertArgbPixels(rgbPixels, 2, 2, opts)
        assertEquals(" @\n@ ", grid.toPlainText())

        // Explicit ARGB ints where one pixel has alpha = 0xFF and one has alpha = 0x00 (transparent)
        val argbPixels = intArrayOf(
            0xFFFFFFFF.toInt(), // opaque white -> '@'
            0x00FFFFFF,         // transparent white -> ' '
        )
        val gridArgb = AsciiArt.convertArgbPixels(
            argbPixels,
            2,
            1,
            opts.copy(invert = true) // even when inverted (dark->'@'), transparent stays ' '!
        )
        assertEquals("  ", gridArgb.toPlainText())
    }

    @Test
    fun testAreaSamplingWeightsByAlpha() {
        // 2x1 image downscaled to 1x1 cell:
        // pixel 0 is transparent black (0, 0, 0, 0)
        // pixel 1 is opaque white (255, 255, 255, 255)
        // Area sampling should weight RGB by alpha so the cell color is white (255, 255, 255), not darkened to 128!
        val rgba = byteArrayOf(
            0, 0, 0, 0,
            255.toByte(), 255.toByte(), 255.toByte(), 255.toByte(),
        )
        val opts = AsciiArt.AsciiOptions(
            map = "@ ",
            columns = 1,
            charAspectRatio = 1.0,
            sampleArea = true,
        )
        val grid = AsciiArt.convertRgbaBuffer(rgba, 2, 1, opts)
        val cell = grid.rows[0][0]
        assertEquals(255, cell.r)
        assertEquals(255, cell.g)
        assertEquals(255, cell.b)
        assertEquals(128, cell.a)
        assertEquals('@', cell.char)
    }

    @Test
    fun testEmptyAndValidationEdgeCases() {
        assertTrue(AsciiArt.convertRgbaBuffer(ByteArray(0), 0, 0).isEmpty)
        assertEquals("", AsciiArt.convertRgbaBuffer(ByteArray(0), 0, 0).toPlainText())
        assertTrue(AsciiArt.convertArgbPixels(IntArray(0), -1, 5).isEmpty)

        // Invalid options
        assertFailsWith<IllegalArgumentException> { AsciiArt.AsciiOptions(map = "") }
        assertFailsWith<IllegalArgumentException> { AsciiArt.AsciiOptions(columns = 0) }
        assertFailsWith<IllegalArgumentException> { AsciiArt.AsciiOptions(columns = -5) }
        assertFailsWith<IllegalArgumentException> { AsciiArt.AsciiOptions(columns = null, downScale = 0) }
        assertFailsWith<IllegalArgumentException> { AsciiArt.AsciiOptions(charAspectRatio = 0.0) }
        assertFailsWith<IllegalArgumentException> { AsciiArt.AsciiOptions(charAspectRatio = -0.5) }
        assertFailsWith<IllegalArgumentException> { AsciiArt.AsciiOptions(charAspectRatio = Double.NaN) }
        assertFailsWith<IllegalArgumentException> { AsciiArt.AsciiOptions(alphaThreshold = -1) }
        assertFailsWith<IllegalArgumentException> { AsciiArt.AsciiOptions(alphaThreshold = 256) }

        // Undersized buffers
        assertFailsWith<IllegalArgumentException> {
            AsciiArt.convertRgbaBuffer(ByteArray(15), 2, 2)
        }
        assertFailsWith<IllegalArgumentException> {
            AsciiArt.convertArgbPixels(IntArray(3), 2, 2)
        }
    }

    @Test
    fun testResolveAssetUrlAndKobwebSnippet() {
        assertEquals("/images/Photographs/Image 1.png", AsciiArt.resolveAssetUrl("images/Photographs/Image 1.png"))
        assertEquals("/images/Photographs/Image 1.png", AsciiArt.resolveAssetUrl("/images/Photographs/Image 1.png"))
        assertEquals("https://example.com/a.png", AsciiArt.resolveAssetUrl("https://example.com/a.png"))
        assertEquals("data:image/png;base64,abc", AsciiArt.resolveAssetUrl("data:image/png;base64,abc"))
        assertEquals("images/Photographs/Image 1.png", AsciiArt.resolveAssetUrl("images/Photographs/Image 1.png", autoPrefix = false))

        val snippet = AsciiArt.buildKobwebSnippet(
            src = "images/Photographs/Image 1.png",
            options = AsciiArt.AsciiOptions(
                map = AsciiArt.Maps.FIVE_BLOCK,
                columns = 60,
                luminanceMode = AsciiArt.LuminanceMode.KASCIFFY,
            ),
            colored = true,
        )
        assertTrue(snippet.contains("src = \"images/Photographs/Image 1.png\""))
        assertTrue(snippet.contains("columns = 60"))
        assertTrue(snippet.contains("map = AsciiArt.Maps.FIVE_BLOCK"))
        assertTrue(snippet.contains("luminanceMode = AsciiArt.LuminanceMode.KASCIFFY"))
        assertTrue(snippet.contains("colored = true"))

        val manualInvertSnippet = AsciiArt.buildKobwebSnippet(
            src = "images/Photographs/Image 1.png",
            options = AsciiArt.AsciiOptions(invert = true),
            colored = false,
            autoInvertForColorMode = false,
        )
        assertTrue(manualInvertSnippet.contains("autoInvertForColorMode = false"))
        assertTrue(manualInvertSnippet.contains("invert = true"))
    }

    @Test
    fun testFromCanvasAndRenderToCanvas() {
        val canvas = kotlinx.browser.document.createElement("canvas") as org.w3c.dom.HTMLCanvasElement
        canvas.width = 4
        canvas.height = 2
        val ctx = canvas.getContext("2d") as org.w3c.dom.CanvasRenderingContext2D
        // Left half black, right half white
        ctx.fillStyle = "#000000"
        ctx.fillRect(0.0, 0.0, 2.0, 2.0)
        ctx.fillStyle = "#FFFFFF"
        ctx.fillRect(2.0, 0.0, 2.0, 2.0)

        val opts = AsciiArt.AsciiOptions(
            map = AsciiArt.Maps.TWO, // "@ "
            columns = 4,
            charAspectRatio = 1.0,
            invert = false,
            sampleArea = false,
        )
        val grid = AsciiArt.fromCanvas(canvas, opts)
        assertEquals(4, grid.width)
        assertEquals(2, grid.height)
        assertEquals("  @@\n  @@", grid.toPlainText())

        // Render both monochrome and colored grids back to a canvas and verify PNG data URL output
        val monoCanvas = AsciiArt.renderToCanvas(grid, colored = false, spaced = false)
        assertTrue(monoCanvas.width > 0 && monoCanvas.height > 0)
        assertTrue(monoCanvas.toDataURL("image/png").startsWith("data:image/png;base64,"))

        val colorCanvas = AsciiArt.renderToCanvas(grid, colored = true, spaced = true)
        assertTrue(colorCanvas.width > 0 && colorCanvas.height > 0)
        assertTrue(colorCanvas.toDataURL("image/png").startsWith("data:image/png;base64,"))

        // Empty grid renders to a 1x1 fallback canvas without throwing
        val emptyCanvas = AsciiArt.renderToCanvas(AsciiArt.AsciiGrid(0, 0, emptyList()))
        assertEquals(1, emptyCanvas.width)
        assertEquals(1, emptyCanvas.height)

        // Unattached SVG <img> without explicit width/height attributes (where width/naturalWidth == 0)
        // falls back to defaultWidth x defaultHeight instead of returning an empty 0x0 grid
        val svgImg = kotlinx.browser.document.createElement("img") as org.w3c.dom.HTMLImageElement
        svgImg.src = "data:image/svg+xml;utf8,<svg viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'><rect width='10' height='10' fill='white'/></svg>"
        val svgGrid = AsciiArt.fromImageElement(
            svgImg,
            AsciiArt.AsciiOptions(columns = 10, charAspectRatio = 1.0),
            defaultWidth = 100,
            defaultHeight = 100,
        )
        assertFalse(svgGrid.isEmpty)
        assertEquals(10, svgGrid.width)
        assertEquals(10, svgGrid.height)
    }
}
