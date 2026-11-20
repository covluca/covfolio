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
    var muted by remember { mutableStateOf(false) }

    val isExporting = remember {
        window.location.search.indexOf("_kobwebIsExporting=true") != -1
    }
    val adConfig = AdConfig.currentConfig()

    var webglLayerEl by remember { mutableStateOf<HTMLElement?>(null) }
    var ad3dLayerEl by remember { mutableStateOf<HTMLElement?>(null) }
    var consoleOverlayEl by remember { mutableStateOf<HTMLElement?>(null) }
    var roofOverlayEl by remember { mutableStateOf<HTMLElement?>(null) }
    var consoleInsEl by remember { mutableStateOf<HTMLElement?>(null) }
    var roofInsEl by remember { mutableStateOf<HTMLElement?>(null) }
    var garageInsEl by remember { mutableStateOf<HTMLElement?>(null) }
    var podiumInsEl by remember { mutableStateOf<HTMLElement?>(null) }
    var continueInsEl by remember { mutableStateOf<HTMLElement?>(null) }

    LaunchedEffect(bridge) {
        TouchBridgeHolder.bridge = bridge
    }

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
                    .width(300.px).height(94.px)
                    .borderRadius(8.px)
                    .border(1.px, LineStyle.Solid, rgba(126, 151, 170, 0.62f))
                    .overflow(Overflow.Hidden)
                    .pointerEvents(PointerEvents.None)
                    .styleModifier {
                        property("visibility", "hidden")
                        property("opacity", "0")
                        property("transform-origin", "0 0")
                        property("background", "linear-gradient(145deg, rgba(10,16,22,.98), rgba(27,35,42,.98))")
                        property("box-shadow", "inset 0 0 0 2px rgba(0,0,0,.62), inset 0 1px 0 rgba(213,236,255,.16), 0 5px 14px rgba(0,0,0,.34)")
                        property("padding", "4px")
                        property("box-sizing", "border-box")
                    }
                    .toAttrs {
                        ref { el ->
                            consoleOverlayEl = el
                            onDispose { if (consoleOverlayEl === el) consoleOverlayEl = null }
                        }
                    }
            ) {
                SponsoredFallbackCard(
                    badge = "SPONSORED CONSOLE",
                    title = "COVFOLIO DASHBOARD OS",
                    body = "Live Apex Telemetry · Drift Assist Engaged",
                    compact = true
                )
                TagElement<HTMLElement>(
                    tagName = "ins",
                    applyAttrs = Modifier
                        .fillMaxSize()
                        .styleModifier {
                            property("display", "block")
                            property("position", "absolute")
                            property("top", "0px")
                            property("left", "0px")
                            property("width", "100%")
                            property("height", "100%")
                            property("background", "transparent")
                        }
                        .toAttrs {
                            classes("adsbygoogle")
                            attr("data-ad-client", adConfig.publisherId)
                            attr("data-ad-slot", adConfig.consoleSlotId)
                            attr("data-ad-placement", AdSlotKey.CONSOLE.placementName)
                            if (adConfig.testMode && !isExporting) attr("data-adtest", "on")
                            ref { el ->
                                consoleInsEl = el
                                val liveCfg = AdConfig.currentConfig()
                                el.setAttribute("data-ad-client", liveCfg.publisherId)
                                el.setAttribute("data-ad-slot", liveCfg.consoleSlotId)
                                el.setAttribute("data-ad-placement", AdSlotKey.CONSOLE.placementName)
                                if (liveCfg.testMode && !isExporting) {
                                    el.setAttribute("data-adtest", "on")
                                } else {
                                    el.removeAttribute("data-adtest")
                                }
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
                    .width(220.px).height(69.px)
                    .borderRadius(8.px)
                    .border(1.px, LineStyle.Solid, rgba(116, 191, 201, 0.72f))
                    .overflow(Overflow.Hidden)
                    .pointerEvents(PointerEvents.None)
                    .styleModifier {
                        property("visibility", "hidden")
                        property("opacity", "0")
                        property("transform-origin", "0 0")
                        property("background", "linear-gradient(180deg, rgba(12,23,29,.98), rgba(3,10,14,.98))")
                        property("box-shadow", "inset 0 0 0 2px rgba(0,0,0,.7), inset 0 1px 0 rgba(180,255,255,.22), 0 4px 12px rgba(0,0,0,.38)")
                        property("padding", "3px")
                        property("box-sizing", "border-box")
                    }
                    .toAttrs {
                        ref { el ->
                            roofOverlayEl = el
                            onDispose { if (roofOverlayEl === el) roofOverlayEl = null }
                        }
                    }
            ) {
                SponsoredFallbackCard(
                    badge = "SPONSORED ROOF",
                    title = "JELLY DRIFT GP",
                    body = "Covfolio 3D Racing Series",
                    compact = true
                )
                TagElement<HTMLElement>(
                    tagName = "ins",
                    applyAttrs = Modifier
                        .fillMaxSize()
                        .styleModifier {
                            property("display", "block")
                            property("position", "absolute")
                            property("top", "0px")
                            property("left", "0px")
                            property("width", "100%")
                            property("height", "100%")
                            property("background", "transparent")
                        }
                        .toAttrs {
                            classes("adsbygoogle")
                            attr("data-ad-client", adConfig.publisherId)
                            attr("data-ad-slot", adConfig.roofSlotId)
                            attr("data-ad-placement", AdSlotKey.ROOF.placementName)
                            if (adConfig.testMode && !isExporting) attr("data-adtest", "on")
                            ref { el ->
                                roofInsEl = el
                                val liveCfg = AdConfig.currentConfig()
                                el.setAttribute("data-ad-client", liveCfg.publisherId)
                                el.setAttribute("data-ad-slot", liveCfg.roofSlotId)
                                el.setAttribute("data-ad-placement", AdSlotKey.ROOF.placementName)
                                if (liveCfg.testMode && !isExporting) {
                                    el.setAttribute("data-adtest", "on")
                                } else {
                                    el.removeAttribute("data-adtest")
                                }
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
                JellyDriftHud(
                    snapshot = snapshot,
                    onPause = { bridge.pause() },
                    onToggleCamera = { bridge.toggleCamera() },
                    onToggleMute = {
                        muted = !muted
                        bridge.setMuted(muted)
                    }
                )
            }

            val inRaceHud = loadStatus == EngineLoadStatus.READY && (
                snapshot.phase == GamePhase.COUNTDOWN ||
                    snapshot.phase == GamePhase.RACING ||
                    snapshot.phase == GamePhase.PAUSED ||
                    snapshot.phase == GamePhase.CONTINUE_OFFER
                )

            Link(
                path = "/",
                text = "← Portfolio",
                modifier = Modifier
                    .position(Position.Absolute)
                    .top(if (inRaceHud) 56.px else 12.px)
                    .left(14.px)
                    .padding(topBottom = 0.38.cssRem, leftRight = 0.85.cssRem)
                    .borderRadius(999.px)
                    .backgroundColor(rgba(19, 23, 31, 0.88f))
                    .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.2f))
                    .color(Colors.White)
                    .fontFamily(Res.Fonts.Space_Grotesk)
                    .fontSize(0.78.cssRem)
                    .fontWeight(FontWeight.SemiBold)
                    .pointerEvents(PointerEvents.Auto)
                    .attrsModifier { attr("data-testid", "back-portfolio-btn") },
                variant = UndecoratedLinkVariant.then(UncoloredLinkVariant)
            )
        }

        // Layer 4: Modal & Status Overlay Layer
        if (loadStatus == EngineLoadStatus.READY) {
            SideEffect {
                bridge.confirmUiPhase(snapshot.phase)
            }
        }
        Box(
            modifier = Modifier
                .id("jellydrift-modal-layer")
                .position(Position.Absolute)
                .top(0.px).right(0.px).bottom(0.px).left(0.px)
                .zIndex(25)
                .pointerEvents(PointerEvents.None),
            contentAlignment = Alignment.Center
        ) {
            if (loadStatus == EngineLoadStatus.READY) {
                // Pre-Race Garage Ad Banner (728x90 desktop / responsive mobile)
                StaticAdOverlay(
                    id = "garage-ad-overlay",
                    slotKey = AdSlotKey.GARAGE,
                    adConfig = adConfig,
                    isExporting = isExporting,
                    visible = snapshot.phase == GamePhase.GARAGE,
                    modifier = Modifier
                        .position(Position.Absolute)
                        .bottom(14.px)
                        .height(90.px)
                        .borderRadius(12.px)
                        .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.16f))
                        .styleModifier {
                            property("left", "50%")
                            property("transform", "translateX(-50%)")
                            property("width", "min(728px, calc(100vw - 28px))")
                        },
                    badge = "SPONSORED GARAGE",
                    title = "COVFOLIO RACING TEAM",
                    body = "Official Pit Stop · Choose Your Machine & Hit the Track",
                    onIns = { garageInsEl = it }
                )

                // Post-Race Podium Ad Slot (300x250 on right)
                StaticAdOverlay(
                    id = "podium-ad-overlay",
                    slotKey = AdSlotKey.PODIUM,
                    adConfig = adConfig,
                    isExporting = isExporting,
                    visible = snapshot.phase == GamePhase.FINISHED,
                    modifier = Modifier
                        .position(Position.Absolute)
                        .right(24.px)
                        .top(70.px)
                        .height(250.px)
                        .borderRadius(12.px)
                        .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.18f))
                        .styleModifier {
                            property("width", "min(300px, calc(100vw - 48px))")
                        },
                    badge = "SPONSORED PODIUM",
                    title = "COVFOLIO CHAMPIONSHIP SERIES",
                    body = "Race Again or Retire to the Portfolio",
                    onIns = { podiumInsEl = it }
                )

                // Watch-an-Ad-to-Continue Tier 2 Modal & #continue-ad-overlay (always mounted)
                AdWatchingOverlayModal(
                    snapshot = snapshot,
                    bridge = bridge,
                    adConfig = adConfig,
                    isExporting = isExporting,
                    onContinueIns = { continueInsEl = it }
                )

                when (snapshot.phase) {
                    GamePhase.GARAGE -> GarageMenu(snapshot = snapshot, bridge = bridge)
                    GamePhase.COUNTDOWN -> CountdownOverlay(snapshot = snapshot)
                    GamePhase.PAUSED -> PauseMenu(bridge = bridge)
                    GamePhase.CONTINUE_OFFER -> ContinueOfferMenu(snapshot = snapshot, bridge = bridge)
                    GamePhase.FINISHED -> PodiumMenu(snapshot = snapshot, bridge = bridge)
                    else -> {}
                }
            } else {
                val blocked = remember(loadStatus) { AdConfig.isBlocked() }
                Column(
                    modifier = Modifier
                        .maxWidth(34.cssRem)
                        .margin(1.5.cssRem)
                        .padding(2.cssRem)
                        .gap(1.cssRem)
                        .borderRadius(16.px)
                        .backgroundColor(Color.rgb(0x13171F))
                        .border(1.px, LineStyle.Solid, rgba(255, 255, 255, 0.16f))
                        .pointerEvents(PointerEvents.Auto),
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
                                .attrsModifier { attr("data-testid", "loading-back-portfolio-btn") },
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
            val curPhase = bridge.getSnapshot()?.phase
            if (hidden && (curPhase == GamePhase.RACING || curPhase == GamePhase.COUNTDOWN)) {
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
            TouchBridgeHolder.bridge = null
            window.removeEventListener("keydown", keyDownListener, nonPassiveOptions)
            document.removeEventListener("visibilitychange", visibilityListener)
            AdConfig.unobserveSlot(consoleInsEl)
            AdConfig.unobserveSlot(roofInsEl)
            AdConfig.unobserveSlot(garageInsEl)
            AdConfig.unobserveSlot(podiumInsEl)
            AdConfig.unobserveSlot(continueInsEl)
            bridge.dispose()
            webglLayerEl?.innerHTML = ""
        }
    }
}
