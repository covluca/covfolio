package com.binayshaw7777.kotfolio.components.sections

import androidx.compose.runtime.Composable
import com.binayshaw7777.kotfolio.components.styles.ButtonStyle
import com.binayshaw7777.kotfolio.components.styles.ProjectStyle
import com.binayshaw7777.kotfolio.components.styles.SectionDescriptionStyle
import com.binayshaw7777.kotfolio.components.widgets.AppearanceAwareImage
import com.binayshaw7777.kotfolio.components.widgets.RoundedImage
import com.binayshaw7777.kotfolio.components.widgets.SectionTitle
import com.binayshaw7777.kotfolio.components.widgets.WipOverlay
import com.binayshaw7777.kotfolio.utils.Constants
import com.binayshaw7777.kotfolio.utils.Res
import com.binayshaw7777.kotfolio.utils.getAllProjects
import com.varabyte.kobweb.compose.css.Cursor
import com.varabyte.kobweb.compose.css.FontWeight
import com.varabyte.kobweb.compose.css.TextAlign
import com.varabyte.kobweb.compose.css.functions.LinearGradient
import com.varabyte.kobweb.compose.css.functions.linearGradient
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
import com.varabyte.kobweb.core.rememberPageContext
import com.varabyte.kobweb.silk.components.forms.Button
import com.varabyte.kobweb.silk.components.forms.ButtonSize
import com.varabyte.kobweb.silk.components.forms.ButtonVars
import com.varabyte.kobweb.silk.components.layout.SimpleGrid
import com.varabyte.kobweb.silk.components.layout.numColumns
import com.varabyte.kobweb.silk.components.navigation.Link
import com.varabyte.kobweb.silk.components.style.toModifier
import com.varabyte.kobweb.silk.components.text.SpanText
import com.varabyte.kobweb.silk.theme.colors.ColorMode
import org.jetbrains.compose.web.css.FlexWrap
import org.jetbrains.compose.web.css.LineStyle
import org.jetbrains.compose.web.css.cssRem
import org.jetbrains.compose.web.css.px
import org.jetbrains.compose.web.css.rgba


@Composable
fun Projects() {
    Column(
        modifier = ProjectStyle.toModifier().id("projects"),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {

        SectionTitle(Constants.PROJECT_TITLE)

        WipOverlay(compact = true) {
            SpanText(
                text = Constants.PROJECT_SECTION_TEXT,
                modifier = SectionDescriptionStyle.toModifier()
                    .textAlign(TextAlign.Center)
                    .color(
                        when (ColorMode.current) {
                            ColorMode.LIGHT -> Colors.Gray
                            ColorMode.DARK -> Colors.DimGray
                        }
                    )
                    .fontFamily(Res.Fonts.DM_SANS)
            )
        }

        val ctx = rememberPageContext()
        val isDark = ColorMode.current.isDark
        val borderColor = if (isDark) Res.Colors.GLASS_BOX_BORDER_COLOR_DARK else Res.Colors.GLASS_BOX_BORDER_COLOR_LIGHT
        val accentColor = if (isDark) Color.rgb(0xF3DB5B) else Color.rgb(0x3C83EF)
        val accentText = if (isDark) Colors.Black else Colors.White

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .maxWidth(48.cssRem)
                .margin(top = 2.cssRem)
                .padding(topBottom = 1.5.cssRem, leftRight = 1.75.cssRem)
                .gap(1.25.cssRem)
                .flexWrap(FlexWrap.Wrap)
                .borderRadius(12.px)
                .border(1.px, LineStyle.Solid, borderColor)
                .backgroundImage(
                    linearGradient(
                        LinearGradient.Direction.ToBottomRight,
                        rgba(255, 255, 255, 0.02f),
                        rgba(255, 255, 255, 0.08f)
                    )
                )
                .cursor(Cursor.Pointer)
                .onClick { ctx.router.navigateTo("/drift") }
                .attrsModifier { attr("data-testid", "projects-jelly-drift-card") },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.gap(0.4.cssRem)) {
                SpanText(
                    "FEATURED INTERACTIVE 3D",
                    modifier = Modifier
                        .fontFamily(Res.Fonts.Space_Grotesk)
                        .fontSize(0.75.cssRem)
                        .fontWeight(FontWeight.Bold)
                        .color(accentColor)
                )
                SpanText(
                    "Jelly Drift 3D",
                    modifier = Modifier
                        .fontFamily(Res.Fonts.Space_Grotesk)
                        .fontSize(1.5.cssRem)
                        .fontWeight(FontWeight.Bold)
                        .color(if (isDark) Colors.White else Colors.Black)
                )
                SpanText(
                    "3 tracks, 4 squishy drift cars, AI rivals, driver & chase cams — playable in browser.",
                    modifier = Modifier
                        .fontFamily(Res.Fonts.DM_SANS)
                        .fontSize(0.95.cssRem)
                        .color(if (isDark) Colors.LightGray else Colors.Gray)
                )
            }
            Button(
                onClick = {
                    it.stopPropagation()
                    ctx.router.navigateTo("/drift")
                },
                size = ButtonSize.MD,
                modifier = ButtonStyle.toModifier()
                    .setVariable(ButtonVars.BackgroundDefaultColor, accentColor)
                    .setVariable(ButtonVars.BackgroundHoverColor, accentColor)
                    .setVariable(ButtonVars.BackgroundPressedColor, accentColor)
                    .color(accentText)
            ) {
                SpanText("Play →", modifier = Modifier.fontFamily(Res.Fonts.Tauri))
            }
        }

        SimpleGrid(
            numColumns = numColumns(base = 1, sm = 2, md = 3),
            modifier = Modifier.fillMaxWidth().margin(top = 3.cssRem, bottom = 6.cssRem)
        ) {
            val allProjects = getAllProjects()

            repeat(allProjects.size) {
                val project = allProjects[it]
                WipOverlay(compact = true) {
                    RoundedImage(
                        src = project.first,
                        navigateTo = project.second
                    )
                }
            }

            Box(
                modifier = Modifier.fillMaxSize().padding(topBottom = 50.px),
                contentAlignment = Alignment.Center
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Link(
                        path = Constants.PROJECT_REPOSITORIES_URL,
                        text = Constants.MORE_ON_GITHUB,
                        modifier = Modifier
                            .fontFamily(Res.Fonts.DM_SANS)
                            .color(
                                when (ColorMode.current) {
                                    ColorMode.LIGHT -> Colors.Black
                                    ColorMode.DARK -> Colors.White
                                }
                            )
                            .margin(right = 4.px)
                    )
                    AppearanceAwareImage(
                        src = Res.Images.NAVIGATION_ARROW
                    )
                }
            }
        }
    }
}