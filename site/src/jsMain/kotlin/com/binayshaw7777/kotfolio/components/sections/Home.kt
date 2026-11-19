package com.binayshaw7777.kotfolio.components.sections

import androidx.compose.runtime.Composable
import com.binayshaw7777.kotfolio.SubheadlineTextStyle
import com.binayshaw7777.kotfolio.components.styles.ButtonStyle
import com.binayshaw7777.kotfolio.components.styles.HelloImStyle
import com.binayshaw7777.kotfolio.components.styles.HeroContainerKeyFrames
import com.binayshaw7777.kotfolio.components.styles.HeroSectionStyle
import com.binayshaw7777.kotfolio.components.styles.UserNameStyle
import com.binayshaw7777.kotfolio.components.styles.UsersMessageStyle
import com.binayshaw7777.kotfolio.utils.Constants
import com.binayshaw7777.kotfolio.utils.CustomColorSchemes
import com.binayshaw7777.kotfolio.utils.Res
import com.varabyte.kobweb.compose.css.FontWeight
import com.varabyte.kobweb.compose.foundation.layout.Box
import com.varabyte.kobweb.compose.foundation.layout.Column
import com.varabyte.kobweb.compose.foundation.layout.Row
import com.varabyte.kobweb.compose.ui.Alignment
import com.varabyte.kobweb.compose.ui.Modifier
import com.varabyte.kobweb.compose.ui.attrsModifier
import com.varabyte.kobweb.compose.ui.graphics.Color
import com.varabyte.kobweb.compose.ui.graphics.Colors
import com.varabyte.kobweb.compose.ui.modifiers.*
import com.varabyte.kobweb.compose.ui.toAttrs
import com.varabyte.kobweb.core.rememberPageContext
import com.varabyte.kobweb.silk.components.animation.toAnimation
import com.varabyte.kobweb.silk.components.forms.Button
import com.varabyte.kobweb.silk.components.forms.ButtonSize
import com.varabyte.kobweb.silk.components.forms.ButtonVars
import com.varabyte.kobweb.silk.components.style.toModifier
import com.varabyte.kobweb.silk.components.text.SpanText
import com.varabyte.kobweb.silk.theme.colors.ColorMode
import org.jetbrains.compose.web.css.AnimationTimingFunction
import org.jetbrains.compose.web.css.FlexWrap
import org.jetbrains.compose.web.css.cssRem
import org.jetbrains.compose.web.css.px
import org.jetbrains.compose.web.css.s
import org.jetbrains.compose.web.dom.Div

@Composable
fun Home() {
    Box(
        modifier = HeroSectionStyle.toModifier().animation(HeroContainerKeyFrames.toAnimation(
            duration = 1.s,
            timingFunction = AnimationTimingFunction.EaseInOut
        )),
        contentAlignment = Alignment.CenterStart
    ) {
        Column(
            horizontalAlignment = Alignment.Start
        ) {

            SpanText(
                text = Constants.HELLO_IM,
                modifier = HelloImStyle.toModifier()
                    .color(
                        when (ColorMode.current) {
                            ColorMode.LIGHT -> Colors.Gray
                            ColorMode.DARK -> Colors.DimGray
                        }
                    )
                    .fontWeight(FontWeight.Bold)
            )
            SpanText(
                text = Constants.BINAY_SHAW,
                modifier = UserNameStyle.toModifier()
                    .color(
                        when (ColorMode.current) {
                            ColorMode.LIGHT -> Colors.Black
                            ColorMode.DARK -> Colors.White
                        }
                    )
                    .fontWeight(FontWeight.Bold)
            )

            Div(
                SubheadlineTextStyle.toModifier().margin(top = 20.px).toAttrs()
            ) {
                SpanText(
                    text = Constants.AND_NICE_TO_MEET_YOU,
                    modifier = UsersMessageStyle.toModifier()
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
            val driftAccent = if (isDark) Color.rgb(0xF3DB5B) else Color.rgb(0x3C83EF)
            val driftText = if (isDark) Colors.Black else Colors.White

            Row(
                modifier = Modifier
                    .margin(top = 56.px)
                    .gap(1.25.cssRem)
                    .flexWrap(FlexWrap.Wrap),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Button(
                    onClick = {
                        ctx.router.navigateTo(Constants.RESUME_URL)
                    },
                    colorScheme = CustomColorSchemes.BlackAndWhite,
                    size = ButtonSize.LG,
                    modifier = ButtonStyle.toModifier()
                ) {
                    SpanText(
                        text = Constants.RESUME,
                        modifier = Modifier.fontFamily(Res.Fonts.Tauri)
                    )
                }

                Button(
                    onClick = {
                        ctx.router.navigateTo("/drift")
                    },
                    size = ButtonSize.LG,
                    modifier = ButtonStyle.toModifier()
                        .setVariable(ButtonVars.BackgroundDefaultColor, driftAccent)
                        .setVariable(ButtonVars.BackgroundHoverColor, driftAccent)
                        .setVariable(ButtonVars.BackgroundPressedColor, driftAccent)
                        .color(driftText)
                        .attrsModifier { attr("data-testid", "play-jelly-drift-cta") }
                ) {
                    SpanText(
                        text = "Play Jelly Drift 3D",
                        modifier = Modifier.fontFamily(Res.Fonts.Tauri)
                    )
                }
            }
        }
    }
}