package com.binayshaw7777.kotfolio.components.sections

import androidx.compose.runtime.*
import com.varabyte.kobweb.compose.css.functions.clamp
import com.varabyte.kobweb.compose.foundation.layout.Column
import com.varabyte.kobweb.compose.foundation.layout.Row
import com.varabyte.kobweb.compose.foundation.layout.Spacer
import com.varabyte.kobweb.compose.ui.Alignment
import com.varabyte.kobweb.compose.ui.Modifier
import com.varabyte.kobweb.compose.ui.graphics.Colors
import com.varabyte.kobweb.compose.ui.modifiers.*
import com.varabyte.kobweb.silk.components.animation.Keyframes
import com.varabyte.kobweb.silk.components.animation.toAnimation
import com.varabyte.kobweb.silk.components.icons.CloseIcon
import com.varabyte.kobweb.silk.components.icons.HamburgerIcon
import com.varabyte.kobweb.silk.components.icons.MoonIcon
import com.varabyte.kobweb.silk.components.icons.SunIcon
import com.varabyte.kobweb.silk.components.layout.breakpoint.displayIfAtLeast
import com.varabyte.kobweb.silk.components.layout.breakpoint.displayUntil
import com.varabyte.kobweb.silk.components.navigation.Link
import com.varabyte.kobweb.silk.components.navigation.UncoloredLinkVariant
import com.varabyte.kobweb.silk.components.navigation.UndecoratedLinkVariant
import com.varabyte.kobweb.silk.components.overlay.Overlay
import com.varabyte.kobweb.silk.components.overlay.OverlayVars
import com.varabyte.kobweb.silk.components.style.ComponentStyle
import com.varabyte.kobweb.silk.components.style.base
import com.varabyte.kobweb.silk.components.style.breakpoint.Breakpoint
import com.varabyte.kobweb.silk.components.style.toModifier
import com.varabyte.kobweb.silk.theme.colors.ColorMode
import org.jetbrains.compose.web.css.*
import com.binayshaw7777.kotfolio.components.widgets.IconButton
import com.binayshaw7777.kotfolio.toSitePalette
import com.binayshaw7777.kotfolio.utils.Res
import com.varabyte.kobweb.compose.css.FontWeight
import com.varabyte.kobweb.compose.css.functions.blur
import com.varabyte.kobweb.compose.foundation.layout.Arrangement
import com.varabyte.kobweb.compose.ui.attrsModifier
import com.varabyte.kobweb.compose.ui.graphics.Color
import com.varabyte.kobweb.compose.ui.styleModifier
import com.varabyte.kobweb.core.rememberPageContext

val NavHeaderStyle by ComponentStyle.base {
    Modifier
        .background(rgba(255, 255, 255, 0f))
        .fillMaxWidth().padding(1.cssRem)
        .backdropFilter(blur(4.px))
        .styleModifier {
            property("-webkit-backdrop-filter", "blur( 4px )")
        }
}

@Composable
private fun NavLink(path: String, text: String, onClick: () -> Unit = {}) {
    Link(
        path = path,
        text = text,
        modifier = Modifier
            .styleModifier { property("white-space", "nowrap") }
            .onClick { onClick() },
        variant = UndecoratedLinkVariant.then(UncoloredLinkVariant)
    )
}

@Composable
private fun DriftNavLink(onClick: () -> Unit = {}) {
    val isDark = ColorMode.current.isDark
    val currentPath = rememberPageContext().route.path
    val isActive = currentPath == "/drift"
    val accent = if (isDark) Color.rgb(0xF3DB5B) else Color.rgb(0x3C83EF)
    Link(
        path = "/drift",
        text = "Jelly Drift",
        modifier = Modifier
            .fontFamily(Res.Fonts.Space_Grotesk)
            .fontWeight(FontWeight.SemiBold)
            .padding(topBottom = 0.25.cssRem, leftRight = 0.7.cssRem)
            .borderRadius(999.px)
            .border(1.px, LineStyle.Solid, accent)
            .color(if (isActive) (if (isDark) Colors.Black else Colors.White) else accent)
            .backgroundColor(if (isActive) accent else Colors.Transparent)
            .styleModifier { property("white-space", "nowrap") }
            .attrsModifier { attr("data-testid", "nav-jelly-drift") }
            .onClick { onClick() },
        variant = UndecoratedLinkVariant.then(UncoloredLinkVariant)
    )
}

@Composable
private fun MenuItems(onItemClick: () -> Unit = {}) {
    NavLink("/#home", "Home", onItemClick)
    NavLink("/#about", "About", onItemClick)
    NavLink("/#experience", "Experience", onItemClick)
//    NavLink("#skills_and_tools", "Skills & Tools")
//    NavLink("#photography", "Photography")
    NavLink("/#projects", "Projects", onItemClick)
    NavLink("/organizer", "Organizer", onItemClick)
    NavLink("/ascii", "ASCII Art", onItemClick)
    DriftNavLink(onItemClick)
}

@Composable
private fun ColorModeButton() {
    var colorMode by ColorMode.currentState
    IconButton(onClick = { colorMode = colorMode.opposite },) {
        if (colorMode.isLight) MoonIcon() else SunIcon()
    }
//    Tooltip(ElementTarget.PreviousSibling, "Toggle color mode", placement = PopupPlacement.BottomRight)
}

@Composable
private fun HamburgerButton(onClick: () -> Unit) {
    IconButton(onClick) {
        HamburgerIcon()
    }
}

@Composable
private fun CloseButton(onClick: () -> Unit) {
    IconButton(onClick) {
        CloseIcon()
    }
}

val SideMenuSlideInAnim by Keyframes {
    from {
        Modifier.translateX(100.percent)
    }

    to {
        Modifier
    }
}

// Note: When the user closes the side menu, we don't immediately stop rendering it (at which point it would disappear
// abruptly). Instead, we start animating it out and only stop rendering it when the animation is complete.
enum class SideMenuState {
    CLOSED,
    OPEN,
    CLOSING;

    fun close() = when (this) {
        CLOSED -> CLOSED
        OPEN -> CLOSING
        CLOSING -> CLOSING
    }
}

@Composable
fun NavHeader(modifier: Modifier = Modifier) {
    Row(NavHeaderStyle.toModifier().fillMaxWidth().then(modifier), verticalAlignment = Alignment.CenterVertically) {
//        Link("https://kobweb.varabyte.com") {
//            // Block display overrides inline display of the <img> tag, so it calculates centering better
//            Image("/kobweb-logo.png", "Kobweb Logo", Modifier.height(2.cssRem).display(DisplayStyle.Block))
//        }

        Spacer()

        Row(
            Modifier
                .fontSize(1.5.cssRem)
                .gap(1.cssRem)
                .displayUntil(Breakpoint.MD),
            verticalAlignment = Alignment.CenterVertically
        ) {
            var menuState by remember { mutableStateOf(SideMenuState.CLOSED) }

            ColorModeButton()
            HamburgerButton(onClick =  { menuState = SideMenuState.OPEN })

            if (menuState != SideMenuState.CLOSED) {
                SideMenu(
                    menuState,
                    close = { menuState = menuState.close() },
                    onAnimationEnd = { if (menuState == SideMenuState.CLOSING) menuState = SideMenuState.CLOSED }
                )
            }
        }

        Row(Modifier.gap(1.5.cssRem).displayIfAtLeast(Breakpoint.MD), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            MenuItems()
            ColorModeButton()
        }

        Spacer()
    }
}

@Composable
private fun SideMenu(menuState: SideMenuState, close: () -> Unit, onAnimationEnd: () -> Unit) {
    Overlay(
        Modifier
            .setVariable(OverlayVars.BackgroundColor, Colors.Transparent)
            .onClick { close() }
    ) {
        key(menuState) { // Force recompute animation parameters when close button is clicked
            Column(
                Modifier
                    .fillMaxHeight()
                    .width(clamp(10.5.cssRem, 45.percent, 13.cssRem))
                    .align(Alignment.CenterEnd)
                    // Close button will appear roughly over the hamburger button, so the user can close
                    // things without moving their finger / cursor much.
                    .padding(top = 1.cssRem, leftRight = 1.cssRem)
                    .gap(1.5.cssRem)
                    .backgroundColor(ColorMode.current.toSitePalette().nearBackground)
                    .animation(
                        SideMenuSlideInAnim.toAnimation(
                            duration = 200.ms,
                            timingFunction = if (menuState == SideMenuState.OPEN) AnimationTimingFunction.EaseOut else AnimationTimingFunction.EaseIn,
                            direction = if (menuState == SideMenuState.OPEN) AnimationDirection.Normal else AnimationDirection.Reverse,
                            fillMode = AnimationFillMode.Forwards
                        )
                    )
                    .borderRadius(topLeft = 2.cssRem)
                    .onClick { it.stopPropagation() }
                    .onAnimationEnd { onAnimationEnd() },
                horizontalAlignment = Alignment.End
            ) {
                CloseButton(onClick = { close() })
                Column(Modifier.padding(right = 0.75.cssRem).gap(1.5.cssRem).fontSize(1.4.cssRem), horizontalAlignment = Alignment.End) {
                    MenuItems(onItemClick = close)
                }
            }
        }
    }
}
