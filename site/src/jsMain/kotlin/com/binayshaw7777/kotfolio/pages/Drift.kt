package com.binayshaw7777.kotfolio.pages

import androidx.compose.runtime.*
import com.binayshaw7777.kotfolio.components.layouts.GameLayout
import com.binayshaw7777.kotfolio.game.*
import com.binayshaw7777.kotfolio.utils.Res
import com.varabyte.kobweb.compose.css.Cursor
import com.varabyte.kobweb.compose.css.FontWeight
import com.varabyte.kobweb.compose.css.Overflow
import com.varabyte.kobweb.compose.css.PointerEvents
import com.varabyte.kobweb.compose.css.TextAlign
import com.varabyte.kobweb.compose.foundation.layout.Arrangement
import com.varabyte.kobweb.compose.foundation.layout.Box
import com.varabyte.kobweb.compose.foundation.layout.Column
import com.varabyte.kobweb.compose.foundation.layout.Row
import com.varabyte.kobweb.compose.ui.Alignment
import com.varabyte.kobweb.compose.ui.Modifier
import com.varabyte.kobweb.compose.ui.attrsModifier
import com.varabyte.kobweb.compose.ui.graphics.Color
import com.varabyte.kobweb.compose.ui.graphics.Colors
import com.varabyte.kobweb.compose.ui.modifiers.*
import com.varabyte.kobweb.compose.ui.styleModifier
import com.varabyte.kobweb.compose.ui.toAttrs
import com.varabyte.kobweb.core.Page
import com.varabyte.kobweb.silk.components.navigation.Link
import com.varabyte.kobweb.silk.components.navigation.UncoloredLinkVariant
import com.varabyte.kobweb.silk.components.navigation.UndecoratedLinkVariant
import com.varabyte.kobweb.silk.components.text.SpanText
import kotlinx.browser.document
import kotlinx.browser.window
import org.jetbrains.compose.web.css.LineStyle
import org.jetbrains.compose.web.css.Position
import org.jetbrains.compose.web.css.cssRem
import org.jetbrains.compose.web.css.px
import org.jetbrains.compose.web.css.rgba
import org.jetbrains.compose.web.dom.Div
import org.jetbrains.compose.web.dom.TagElement
import org.w3c.dom.HTMLElement
import org.w3c.dom.events.EventListener
import org.w3c.dom.events.KeyboardEvent

@Page
@Composable
fun DriftPage() {
    val bridge = remember { JellyDriftBridge() }
    var loadStatus by remember { mutableStateOf(EngineLoadStatus.INITIALIZING) }
    var threeRevision by remember { mutableStateOf<String?>(null) }
    var statusMessage by remember { mutableStateOf<String?>("Initializing WebGL & AdSense...") }
    var snapshot by remember { mutableStateOf(JellyDriftSnapshot()) }

    val adConfig = remember { AdConfig.currentConfig() }

    var webglLayerEl by remember { mutableStateOf<HTMLElement?>(null) }
    var ad3dLayerEl by remember { mutableStateOf<HTMLElement?>(null) }
    var consoleOverlayEl by remember { mutableStateOf<HTMLElement?>(null) }
    var roofOverlayEl by remember { mutableStateOf<HTMLElement?>(null) }
    var consoleInsEl by remember { mutableStateOf<HTMLElement?>(null) }
    var roofInsEl by remember { mutableStateOf<HTMLElement?>(null) }

    GameLayout("Jelly Drift 3D") {
        // Layer 1: WebGL Canvas Container
        Div(
            Modifier
                .id("jellydrift-webgl-layer")
                .position(Position.Absolute)
                .top(0.px).right(0.px).bottom(0.px).left(0.px)
                .zIndex(1)
                .toAttrs {
                    ref { el ->
                        webglLayerEl = el
                        onDispose { if (webglLayerEl === el) webglLayerEl = null }
                    }
                }
        )

        // Layer 2: 3D-Projected Ad Overlay Container (pointer-events: none during driving; hidden via visibility/opacity)
        Div(
            Modifier
                .id("jellydrift-ad3d-layer")
                .position(Position.Absolute)
                .top(0.px).right(0.px).bottom(0.px).left(0.px)
                .zIndex(5)
                .pointerEvents(PointerEvents.None)
                .overflow(Overflow.Hidden)
                .toAttrs {
                    ref { el ->
                        ad3dLayerEl = el
                        onDispose { if (ad3dLayerEl === el) ad3dLayerEl = null }
                    }
                }
        ) {
            // Driver-View Center Console Ad Slot (320x100)
            Div(
                Modifier
                    .id("console-ad-overlay")
                    .position(Position.Absolute)
                    .top(0.px).left(0.px)
                    .width(320.px).height(100.px)
                    .pointerEvents(PointerEvents.None)
                    .styleModifier {
                        property("visibility", "hidden")
                        property("opacity", "0")
                        property("transform-origin", "0 0")
                    }
                    .toAttrs {
                        ref { el ->
                            consoleOverlayEl = el
                            onDispose { if (consoleOverlayEl === el) consoleOverlayEl = null }
                        }
                    }
            ) {
                TagElement<HTMLElement>(
                    tagName = "ins",
                    applyAttrs = Modifier
                        .fillMaxSize()
                        .styleModifier {
                            property("display", "block")
                            property("width", "320px")
                            property("height", "100px")
                        }
                        .toAttrs {
                            classes("adsbygoogle")
                            attr("data-ad-client", adConfig.publisherId)
                            attr("data-ad-slot", adConfig.consoleSlotId)
                            attr("data-ad-placement", AdSlotKey.CONSOLE.placementName)
                            if (adConfig.testMode) attr("data-adtest", "on")
                            ref { el ->
                                consoleInsEl = el
                                onDispose { if (consoleInsEl === el) consoleInsEl = null }
                            }
                        },
                    content = null
                )
            }

            // Third-Person Moving Car-Roof Ad Slot (320x100)
            Div(
                Modifier
                    .id("roof-ad-overlay")
                    .position(Position.Absolute)
                    .top(0.px).left(0.px)
                    .width(320.px).height(100.px)
                    .pointerEvents(PointerEvents.None)
                    .styleModifier {
                        property("visibility", "hidden")
                        property("opacity", "0")
                        property("transform-origin", "0 0")
                    }
                    .toAttrs {
                        ref { el ->
                            roofOverlayEl = el
                            onDispose { if (roofOverlayEl === el) roofOverlayEl = null }
                        }
                    }
            ) {
                TagElement<HTMLElement>(
                    tagName = "ins",
                    applyAttrs = Modifier
                        .fillMaxSize()
                        .styleModifier {
                            property("display", "block")
                            property("width", "320px")
                            property("height", "100px")
                        }
                        .toAttrs {
                            classes("adsbygoogle")
                            attr("data-ad-client", adConfig.publisherId)
                            attr("data-ad-slot", adConfig.roofSlotId)
                            attr("data-ad-placement", AdSlotKey.ROOF.placementName)
                            if (adConfig.testMode) attr("data-adtest", "on")
                            ref { el ->
                                roofInsEl = el
                                onDispose { if (roofInsEl === el) roofInsEl = null }
                            }
                        },
                    content = null
                )
            }
        }

        // Layer 3: Driving HUD Layer
        Box(
            modifier = Modifier
                .id("jellydrift-hud-layer")
                .position(Position.Absolute)
                .top(0.px).right(0.px).bottom(0.px).left(0.px)
                .zIndex(15)
                .pointerEvents(PointerEvents.None)
        ) {
            if (loadStatus == EngineLoadStatus.READY) {
                Link(
                    path = "/",
                    text = "← Portfolio",
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .margin(1.cssRem)
                        .padding(topBottom = 0.45.cssRem, leftRight = 0.9.cssRem)
                        .borderRadius(999.px)
                        .backgroundColor(rgba(19, 23, 31, 0.85f))
                        .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.18f))
                        .color(Colors.White)
                        .fontFamily(Res.Fonts.Space_Grotesk)
                        .fontSize(0.85.cssRem)
                        .fontWeight(FontWeight.SemiBold)
                        .pointerEvents(PointerEvents.Auto)
                        .attrsModifier { attr("data-testid", "back-portfolio-btn") },
                    variant = UndecoratedLinkVariant.then(UncoloredLinkVariant)
                )
            }
        }

        // Layer 4: Modal & Status Overlay Layer
        Box(
            modifier = Modifier
                .id("jellydrift-modal-layer")
                .position(Position.Absolute)
                .top(0.px).right(0.px).bottom(0.px).left(0.px)
                .zIndex(25)
                .pointerEvents(if (loadStatus == EngineLoadStatus.READY) PointerEvents.None else PointerEvents.Auto),
            contentAlignment = Alignment.Center
        ) {
            if (loadStatus != EngineLoadStatus.READY) {
                val blocked = remember(loadStatus) { AdConfig.isBlocked() }
                Column(
                    modifier = Modifier
                        .maxWidth(34.cssRem)
                        .margin(1.5.cssRem)
                        .padding(2.cssRem)
                        .gap(1.cssRem)
                        .borderRadius(16.px)
                        .backgroundColor(Color.rgb(0x13171F))
                        .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.16f)),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    SpanText(
                        "JELLY DRIFT 3D",
                        modifier = Modifier
                            .fontFamily(Res.Fonts.Space_Grotesk)
                            .fontSize(0.8.cssRem)
                            .fontWeight(FontWeight.Bold)
                            .color(Color.rgb(0xF3DB5B))
                    )
                    SpanText(
                        when (loadStatus) {
                            EngineLoadStatus.INITIALIZING -> "Preparing WebGL Garage..."
                            EngineLoadStatus.VENDOR_READY_AWAITING_ENGINE -> "WebGL Vendor & AdSense Ready"
                            EngineLoadStatus.ERROR -> "Initialization Issue"
                            EngineLoadStatus.READY -> ""
                        },
                        modifier = Modifier
                            .fontFamily(Res.Fonts.Space_Grotesk)
                            .fontSize(1.6.cssRem)
                            .fontWeight(FontWeight.Bold)
                            .color(Colors.White)
                            .textAlign(TextAlign.Center)
                    )
                    SpanText(
                        statusMessage ?: "",
                        modifier = Modifier
                            .fontFamily(Res.Fonts.DM_SANS)
                            .fontSize(0.95.cssRem)
                            .color(Colors.LightGray)
                            .textAlign(TextAlign.Center)
                    )
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(1.cssRem)
                            .gap(0.4.cssRem)
                            .borderRadius(10.px)
                            .backgroundColor(Color.rgb(0x06080B))
                            .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.1f))
                    ) {
                        SpanText(
                            "Three.js Module: ${threeRevision?.let { "r$it loaded" } ?: "loading..."}",
                            modifier = Modifier.fontSize(0.85.cssRem).color(Colors.White)
                        )
                        SpanText(
                            "AdSense Publisher: ${adConfig.publisherId} (testMode=${adConfig.testMode}, blocked=$blocked)",
                            modifier = Modifier.fontSize(0.85.cssRem).color(Colors.LightGray)
                        )
                    }
                    Row(
                        modifier = Modifier.margin(top = 0.5.cssRem),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Link(
                            path = "/",
                            text = "← Back to Portfolio",
                            modifier = Modifier
                                .padding(topBottom = 0.75.cssRem, leftRight = 1.4.cssRem)
                                .borderRadius(10.px)
                                .backgroundColor(Color.rgb(0xF3DB5B))
                                .color(Colors.Black)
                                .fontFamily(Res.Fonts.Tauri)
                                .fontSize(0.95.cssRem)
                                .cursor(Cursor.Pointer)
                                .attrsModifier { attr("data-testid", "back-portfolio-btn") },
                            variant = UndecoratedLinkVariant.then(UncoloredLinkVariant)
                        )
                    }
                }
            }
        }
    }

    DisposableEffect(Unit) {
        var disposed = false

        val blockedKeys = setOf("Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight")
        val keyDownListener = EventListener { evt ->
            val keyEvt = evt as? KeyboardEvent ?: return@EventListener
            val tag = (document.activeElement?.tagName ?: "").uppercase()
            if (tag == "INPUT" || tag == "TEXTAREA" || tag == "SELECT") return@EventListener
            if (keyEvt.code in blockedKeys || keyEvt.key == " ") {
                keyEvt.preventDefault()
            }
        }
        val nonPassiveOptions = js("({ passive: false })")
        window.addEventListener("keydown", keyDownListener, nonPassiveOptions)

        val visibilityListener = EventListener {
            val hidden = (document.asDynamic().hidden as? Boolean) == true
            if (hidden && snapshot.phase == GamePhase.RACING) {
                bridge.pause()
            }
        }
        document.addEventListener("visibilitychange", visibilityListener)

        val webgl = webglLayerEl
        val ad3d = ad3dLayerEl
        if (webgl != null && ad3d != null) {
            bridge.mount(
                webglContainer = webgl,
                ad3dContainer = ad3d,
                consoleSlotEl = consoleOverlayEl,
                roofSlotEl = roofOverlayEl,
                onSnapshot = { nextSnapshot ->
                    if (!disposed) {
                        snapshot = nextSnapshot
                    }
                },
                onLoadStateChange = { nextStatus, nextRev, nextMsg ->
                    if (!disposed) {
                        loadStatus = nextStatus
                        threeRevision = nextRev
                        statusMessage = nextMsg
                    }
                },
                isDisposed = { disposed }
            )
        } else {
            loadStatus = EngineLoadStatus.ERROR
            statusMessage = "DOM containers failed to mount."
        }

        onDispose {
            disposed = true
            window.removeEventListener("keydown", keyDownListener, nonPassiveOptions)
            document.removeEventListener("visibilitychange", visibilityListener)
            AdConfig.unobserveSlot(consoleInsEl)
            AdConfig.unobserveSlot(roofInsEl)
            bridge.dispose()
            webglLayerEl?.innerHTML = ""
        }
    }
}
