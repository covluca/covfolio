package com.binayshaw7777.kotfolio.pages

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.delay
import com.varabyte.kobweb.compose.ui.Modifier
import com.varabyte.kobweb.compose.ui.modifiers.*
import com.varabyte.kobweb.core.Page
import com.binayshaw7777.kotfolio.components.layouts.PageLayout
import com.binayshaw7777.kotfolio.components.sections.About
import com.binayshaw7777.kotfolio.components.sections.Experience
import com.binayshaw7777.kotfolio.components.sections.Home
import com.binayshaw7777.kotfolio.components.sections.Photography
import com.binayshaw7777.kotfolio.components.sections.Projects
import com.binayshaw7777.kotfolio.components.sections.SkillsAndTools
import com.binayshaw7777.kotfolio.components.widgets.WipOverlay
import com.binayshaw7777.kotfolio.utils.Res
import com.varabyte.kobweb.compose.foundation.layout.*
import org.jetbrains.compose.web.css.cssRem
import kotlinx.browser.document
import kotlinx.browser.window

@Page
@Composable
fun HomePage() {
    LaunchedEffect(Unit) {
        val hash = window.location.hash
        if (hash.isNotEmpty()) {
            val targetId = hash.removePrefix("#")
            if (targetId.isNotEmpty()) {
                delay(100)
                val targetEl = document.getElementById(targetId)
                if (targetEl != null) {
                    val opts: dynamic = js("({ behavior: 'smooth' })")
                    targetEl.asDynamic().scrollIntoView(opts)
                }
            }
        }
    }

    PageLayout("Home") {
        Row(
            Modifier.fillMaxWidth().fontFamily(Res.Fonts.Space_Grotesk).id("home")
        ) {
            Box {

                Column {

                    Home()

                    About()

                    Experience()

                    WipOverlay { SkillsAndTools() }

                    WipOverlay { Photography() }

                    Projects()
                }
            }
        }
    }
}