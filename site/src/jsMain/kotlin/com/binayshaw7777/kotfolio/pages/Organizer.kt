package com.binayshaw7777.kotfolio.pages

import androidx.compose.runtime.Composable
import com.binayshaw7777.kotfolio.components.layouts.PageLayout
import com.binayshaw7777.kotfolio.components.sections.Organizer
import com.varabyte.kobweb.core.Page

@Page
@Composable
fun OrganizerPage() {
    PageLayout("Organizer") {
        Organizer()
    }
}
