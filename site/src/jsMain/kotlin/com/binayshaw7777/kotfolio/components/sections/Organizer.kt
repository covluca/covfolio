package com.binayshaw7777.kotfolio.components.sections

import androidx.compose.runtime.*
import com.binayshaw7777.kotfolio.components.widgets.SectionTitle
import com.binayshaw7777.kotfolio.utils.Res
import com.binayshaw7777.kotfolio.utils.Scheduler
import com.varabyte.kobweb.compose.css.Cursor
import com.varabyte.kobweb.compose.css.FontWeight
import com.varabyte.kobweb.compose.css.TextAlign
import com.varabyte.kobweb.compose.css.TextDecorationLine
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
import kotlinx.browser.localStorage
import kotlinx.browser.window
import org.jetbrains.compose.web.attributes.InputType
import org.jetbrains.compose.web.attributes.placeholder
import org.jetbrains.compose.web.css.CSSColorValue
import org.jetbrains.compose.web.css.LineStyle
import org.jetbrains.compose.web.css.cssRem
import org.jetbrains.compose.web.css.px
import org.jetbrains.compose.web.dom.Div
import org.jetbrains.compose.web.dom.Input
import org.w3c.dom.events.Event
import org.jetbrains.compose.web.css.Color as CssColor

private external fun encodeURIComponent(s: String): String
private external fun decodeURIComponent(s: String): String

private data class Friend(val id: Int, val name: String, val colorIndex: Int, val blocked: Set<Int>)

// Distinct palette for friends that avoids red (busy) and green (free)
private val FRIEND_COLORS = listOf(0x3C83EF, 0x7B2CBF, 0xF5A623, 0xE86FB0, 0x17A2B8, 0x8D6E63, 0x5C6BC0, 0x9E9E9E)
private const val BLOCKED_COLOR = 0xE5484D
private const val FREE_COLOR = 0x30A46C
private const val STORAGE_KEY = "organizer.v2"
private val DAY_NAMES = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

private fun hex(c: Int) = "#" + c.toString(16).padStart(6, '0')
private fun rgba(c: Int, a: Double) = "rgba(${(c shr 16) and 255}, ${(c shr 8) and 255}, ${c and 255}, $a)"
private fun css(c: Int): CSSColorValue = CssColor(hex(c))
private fun Friend.color() = FRIEND_COLORS[colorIndex.coerceIn(FRIEND_COLORS.indices)]

private fun createDefaultFriends(): List<Friend> {
    return listOf(
        Friend(
            id = 1,
            name = "Alex",
            colorIndex = 0,
            blocked = buildSet {
                // Mon-Fri 09:00 - 17:00 and Sat 10:00 - 14:00
                for (d in 0..4) for (h in 9..16) add(Scheduler.slot(d, h))
                for (h in 10..13) add(Scheduler.slot(5, h))
            }
        ),
        Friend(
            id = 2,
            name = "Sam",
            colorIndex = 1,
            blocked = buildSet {
                // Mon-Fri 12:00 - 20:00 and Sun 11:00 - 16:00
                for (d in 0..4) for (h in 12..19) add(Scheduler.slot(d, h))
                for (h in 11..15) add(Scheduler.slot(6, h))
            }
        ),
        Friend(
            id = 3,
            name = "Jordan",
            colorIndex = 2,
            blocked = buildSet {
                // Mon-Thu 08:00 - 16:00, all day Friday (travel), and Sat 18:00 - 23:00
                for (d in 0..3) for (h in 8..15) add(Scheduler.slot(d, h))
                for (h in Scheduler.HOUR_RANGE) add(Scheduler.slot(4, h))
                for (h in 18..22) add(Scheduler.slot(5, h))
            }
        )
    )
}

private fun saveFriends(friends: List<Friend>) {
    try {
        localStorage.setItem(STORAGE_KEY, friends.joinToString("\n") { f ->
            val bits = (0 until Scheduler.SLOTS).joinToString("") { if (it in f.blocked) "1" else "0" }
            "${f.id}|${f.colorIndex}|${encodeURIComponent(f.name)}|$bits"
        })
    } catch (_: Throwable) {
        // Storage may be unavailable (private mode, quota)
    }
}

private fun loadFriends(): List<Friend> = try {
    val raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null) {
        val defaults = createDefaultFriends()
        saveFriends(defaults)
        defaults
    } else if (raw.isEmpty()) {
        emptyList()
    } else {
        raw.split("\n").mapNotNull { line ->
            val p = line.split("|")
            if (p.size != 4) return@mapNotNull null
            val id = p[0].toIntOrNull() ?: return@mapNotNull null
            val colorIndex = p[1].toIntOrNull()?.takeIf { it in FRIEND_COLORS.indices } ?: 0
            val bits = p[3]
            Friend(id, decodeURIComponent(p[2]), colorIndex, (0 until minOf(bits.length, Scheduler.SLOTS)).filter { bits[it] == '1' }.toSet())
        }.distinctBy { it.id }
    }
} catch (_: Throwable) {
    createDefaultFriends()
}

val OrganizerCellStyle by ComponentStyle {
    base {
        Modifier
            .height(1.35.cssRem)
            .borderRadius(4.px)
            .cursor(Cursor.Pointer)
            .styleModifier { property("transition", "opacity 80ms, background 120ms") }
    }
    hover { Modifier.opacity(0.75) }
}

val OrganizerChipStyle by ComponentStyle {
    base {
        Modifier
            .padding(topBottom = 0.25.cssRem, leftRight = 0.75.cssRem)
            .borderRadius(999.px)
            .fontSize(0.9.cssRem)
            .cursor(Cursor.Pointer)
            .styleModifier { property("user-select", "none") }
    }
    hover { Modifier.opacity(0.8) }
}

@Composable
fun Organizer() {
    val isDark = ColorMode.current.isDark
    val lineColor = if (isDark) Res.Colors.GLASS_BOX_BORDER_COLOR_DARK else Res.Colors.GLASS_BOX_BORDER_COLOR_LIGHT
    val mutedText = if (isDark) Colors.DimGray else Colors.Gray
    val strongText = if (isDark) Colors.White else Colors.Black

    val friends = remember { mutableStateListOf<Friend>().apply { addAll(loadFriends()) } }
    var selectedId by remember { mutableStateOf<Int?>(friends.firstOrNull()?.id) } // Default to first friend so user can immediately click & block
    var previewRemovedId by remember { mutableStateOf<Int?>(null) } // override for tied one-removed configurations
    var newName by remember { mutableStateOf("") }
    var paintValue by remember { mutableStateOf<Boolean?>(null) } // non-null while dragging

    DisposableEffect(Unit) {
        val stop: (Event) -> Unit = { paintValue = null }
        window.addEventListener("mouseup", stop)
        window.addEventListener("blur", stop)
        onDispose {
            window.removeEventListener("mouseup", stop)
            window.removeEventListener("blur", stop)
        }
    }

    val selected = friends.firstOrNull { it.id == selectedId }

    fun replace(f: Friend) {
        val i = friends.indexOfFirst { it.id == f.id }
        if (i >= 0) friends[i] = f
        saveFriends(friends)
    }

    fun addFriend() {
        val id = (friends.maxOfOrNull { it.id } ?: 0) + 1
        val name = newName.trim().ifEmpty { "Friend $id" }
        val used = friends.map { it.colorIndex }.toSet()
        val color = FRIEND_COLORS.indices.firstOrNull { it !in used } ?: (friends.size % FRIEND_COLORS.size)
        friends.add(Friend(id, name, color, emptySet()))
        saveFriends(friends)
        newName = ""
        selectedId = id
    }

    fun paint(friend: Friend, slot: Int, value: Boolean) {
        if ((slot in friend.blocked) == value) return
        replace(friend.copy(blocked = if (value) friend.blocked + slot else friend.blocked - slot))
    }

    fun toggleDay(friend: Friend, day: Int) {
        val daySlots = Scheduler.HOUR_RANGE.map { Scheduler.slot(day, it) }
        val allBlocked = daySlots.all { it in friend.blocked }
        val updated = if (allBlocked) friend.blocked - daySlots.toSet() else friend.blocked + daySlots
        replace(friend.copy(blocked = updated))
    }

    fun toggleHour(friend: Friend, hour: Int) {
        val hourSlots = (0 until Scheduler.DAYS).map { Scheduler.slot(it, hour) }
        val allBlocked = hourSlots.all { it in friend.blocked }
        val updated = if (allBlocked) friend.blocked - hourSlots.toSet() else friend.blocked + hourSlots
        replace(friend.copy(blocked = updated))
    }

    val blockedSets = friends.map { it.blocked }
    val allFree = Scheduler.mutualFree(blockedSets)
    val best = Scheduler.bestOneRemoved(blockedSets)

    // Resolve active one-removed target
    val activeWinnerFriend = remember(best, previewRemovedId, friends) {
        if (best == null || best.gain <= 0) null
        else {
            val candidate = friends.firstOrNull { it.id == previewRemovedId }
            val candidateIndex = if (candidate != null) friends.indexOf(candidate) else -1
            if (candidateIndex in best.removed) candidate else friends.getOrNull(best.removed.first())
        }
    }
    val activeWinnerIndex = if (activeWinnerFriend != null) friends.indexOf(activeWinnerFriend) else -1
    val bestGroupFree = if (activeWinnerIndex >= 0) Scheduler.freeWithout(blockedSets, activeWinnerIndex) else emptySet()
    val extraFree = if (activeWinnerIndex >= 0) Scheduler.extraFree(blockedSets, activeWinnerIndex) else emptySet()

    Column(
        Modifier.fillMaxWidth().margin(top = 2.cssRem, bottom = 4.cssRem).gap(1.25.cssRem)
            .fontFamily(Res.Fonts.Space_Grotesk)
    ) {
        SectionTitle("Organizer")
        SpanText(
            "Merge friends' schedules into one to reveal mutual free time and find the optimum group configuration.",
            Modifier.fontFamily(Res.Fonts.DM_SANS).color(mutedText).fontSize(0.95.cssRem)
        )

        // Friend selectors and controls
        Row(
            Modifier.gap(0.5.cssRem).styleModifier { property("flex-wrap", "wrap") },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Chip(
                text = if (friends.isNotEmpty()) "Merged (${allFree.size}h free)" else "Merged",
                active = selected == null,
                lineColor = lineColor,
                strongText = strongText,
                dotColor = if (friends.isNotEmpty()) FREE_COLOR else null,
                onClick = { selectedId = null }
            )

            friends.forEach { f ->
                Chip(
                    text = f.name,
                    active = f.id == selected?.id,
                    lineColor = lineColor,
                    strongText = strongText,
                    dotColor = f.color(),
                    onDotClick = {
                        val nextColor = (f.colorIndex + 1) % FRIEND_COLORS.size
                        replace(f.copy(colorIndex = nextColor))
                    },
                    onRemove = {
                        friends.removeAll { it.id == f.id }
                        saveFriends(friends)
                        if (selectedId == f.id) selectedId = null
                    },
                    onClick = { selectedId = f.id }
                )
            }

            Input(
                InputType.Text,
                attrs = Modifier
                    .width(8.5.cssRem)
                    .padding(topBottom = 0.25.cssRem, leftRight = 0.4.cssRem)
                    .fontSize(0.9.cssRem)
                    .border(0.px)
                    .borderBottom(1.px, LineStyle.Solid, lineColor)
                    .styleModifier {
                        property("background", "transparent")
                        property("color", "inherit")
                        property("font-family", "inherit")
                        property("outline", "none")
                    }
                    .toAttrs {
                        value(newName)
                        placeholder("Add friend...")
                        onInput { newName = it.value }
                        onKeyDown { if (it.key == "Enter") addFriend() }
                    }
            )

            SpanText(
                "+",
                OrganizerChipStyle.toModifier()
                    .border(1.px, LineStyle.Solid, lineColor)
                    .onClick { addFriend() }
                    .title("Add friend")
            )

            if (friends.isEmpty()) {
                SpanText(
                    "Load sample group",
                    OrganizerChipStyle.toModifier()
                        .border(1.px, LineStyle.Dashed, css(FREE_COLOR))
                        .color(css(FREE_COLOR))
                        .onClick {
                            friends.clear()
                            val defaults = createDefaultFriends()
                            friends.addAll(defaults)
                            saveFriends(defaults)
                            selectedId = null
                        }
                        .title("Populate sample friends")
                )
            }
        }

        // Status bar / Legend / Color Picker
        Row(
            Modifier.gap(1.cssRem).fontFamily(Res.Fonts.DM_SANS).fontSize(0.9.cssRem).color(mutedText)
                .styleModifier { property("flex-wrap", "wrap") },
            verticalAlignment = Alignment.CenterVertically
        ) {
            when {
                friends.isEmpty() -> {
                    SpanText("No friends added yet. Add a friend or click 'Load sample group' above to begin.")
                }
                selected != null -> {
                    Swatch(Modifier.backgroundColor(css(BLOCKED_COLOR)))
                    SpanText("Click or drag to block unavailable hours (${selected.blocked.size}h blocked)")

                    if (friends.size > 1) {
                        SpanText("·")
                        SpanText("${allFree.size}h mutual free with group", Modifier.color(strongText))
                    }

                    if (selected.blocked.isNotEmpty()) {
                        SpanText("·")
                        SpanText(
                            "Clear all",
                            Modifier.cursor(Cursor.Pointer)
                                .textDecorationLine(TextDecorationLine.Underline)
                                .color(strongText)
                                .onClick { replace(selected.copy(blocked = emptySet())) }
                                .title("Clear all blocked hours for ${selected.name}")
                        )
                    }

                    SpanText("·")
                    SpanText("Color:")
                    Row(Modifier.gap(0.35.cssRem), verticalAlignment = Alignment.CenterVertically) {
                        FRIEND_COLORS.forEachIndexed { idx, colorInt ->
                            val isCurrent = idx == selected.colorIndex
                            Div(
                                Modifier.size(if (isCurrent) 1.05.cssRem else 0.8.cssRem)
                                    .borderRadius(50.px)
                                    .backgroundColor(css(colorInt))
                                    .cursor(Cursor.Pointer)
                                    .then(if (isCurrent) Modifier.border(2.px, LineStyle.Solid, strongText) else Modifier.opacity(0.65))
                                    .onClick { replace(selected.copy(colorIndex = idx)) }
                                    .toAttrs { attr("title", "Select color") }
                            )
                        }
                    }
                }
                else -> {
                    Row(Modifier.gap(0.4.cssRem), verticalAlignment = Alignment.CenterVertically) {
                        Swatch(Modifier.backgroundColor(css(FREE_COLOR)))
                        SpanText("${allFree.size}h free for everyone", Modifier.color(strongText))
                    }

                    when {
                        activeWinnerFriend != null -> {
                            Row(Modifier.gap(0.4.cssRem), verticalAlignment = Alignment.CenterVertically) {
                                Swatch(
                                    Modifier.backgroundColor(CssColor(rgba(FREE_COLOR, 0.25)))
                                        .border(1.5.px, LineStyle.Dashed, css(activeWinnerFriend.color()))
                                )
                                SpanText(
                                    "Optimum group: everyone but ${activeWinnerFriend.name} → ${bestGroupFree.size}h (+${best!!.gain}h)",
                                    Modifier.color(strongText).fontWeight(FontWeight.Medium)
                                )

                                val tied = best.removed.mapNotNull { idx ->
                                    friends.getOrNull(idx)?.takeIf { it.id != activeWinnerFriend.id }
                                }
                                if (tied.isNotEmpty()) {
                                    SpanText("(tied with", Modifier.color(mutedText))
                                    tied.forEachIndexed { i, t ->
                                        SpanText(
                                            t.name + (if (i < tied.lastIndex) "," else ""),
                                            Modifier.cursor(Cursor.Pointer)
                                                .textDecorationLine(TextDecorationLine.Underline)
                                                .color(css(t.color()))
                                                .onClick { previewRemovedId = t.id }
                                                .title("Preview configuration without ${t.name}")
                                        )
                                    }
                                    SpanText(")", Modifier.color(mutedText))
                                }
                            }
                        }
                        best != null && best.gain == 0 -> {
                            SpanText("Leaving any single person out would not increase mutual free time.")
                        }
                        friends.size == 1 -> {
                            SpanText("Add at least one more friend to compare and calculate group free time.")
                        }
                    }
                }
            }
        }

        // Week schedule grid
        Box(
            Modifier.fillMaxWidth().styleModifier { property("overflow-x", "auto") }
        ) {
            Div(
                Modifier.fillMaxWidth().minWidth(32.cssRem).styleModifier {
                    property("display", "grid")
                    property("grid-template-columns", "2.75rem repeat(7, minmax(0, 1fr))")
                    property("gap", "3px")
                    property("user-select", "none")
                    property("touch-action", "manipulation")
                }.toAttrs()
            ) {
                // Top-left corner
                Div()

                // Day headers (click to toggle whole day when a friend is selected)
                DAY_NAMES.forEachIndexed { dayIndex, day ->
                    Div(
                        Modifier
                            .fontSize(0.8.cssRem)
                            .fontWeight(FontWeight.Bold)
                            .textAlign(TextAlign.Center)
                            .padding(bottom = 0.25.cssRem)
                            .then(if (selected != null) Modifier.cursor(Cursor.Pointer) else Modifier)
                            .toAttrs {
                                if (selected != null) {
                                    attr("title", "Click to toggle all $day hours for ${selected.name}")
                                    onClick { toggleDay(selected, dayIndex) }
                                }
                            }
                    ) {
                        SpanText(day)
                    }
                }

                // Grid rows for each hour (08:00..22:00)
                for (hour in Scheduler.HOUR_RANGE) {
                    val hourLabel = hour.toString().padStart(2, '0') + ":00"

                    // Hour label (click to toggle across all days when a friend is selected)
                    Div(
                        Modifier
                            .fontSize(0.7.cssRem)
                            .color(mutedText)
                            .fontFamily(Res.Fonts.DM_SANS)
                            .lineHeight(1.35.cssRem)
                            .textAlign(TextAlign.Right)
                            .padding(right = 0.3.cssRem)
                            .then(if (selected != null) Modifier.cursor(Cursor.Pointer) else Modifier)
                            .toAttrs {
                                if (selected != null) {
                                    attr("title", "Click to toggle $hourLabel across all days for ${selected.name}")
                                    onClick { toggleHour(selected, hour) }
                                }
                            }
                    ) {
                        SpanText(hour.toString().padStart(2, '0'))
                    }

                    // 7 day slots for this hour
                    for (day in 0 until Scheduler.DAYS) {
                        val slot = Scheduler.slot(day, hour)
                        val slotLabel = "${DAY_NAMES[day]} $hourLabel"

                        if (selected != null) {
                            val isBlocked = slot in selected.blocked
                            val tip = if (isBlocked) "$slotLabel · Unavailable (click or drag to free)" else "$slotLabel · Available (click or drag to block)"
                            Div(
                                OrganizerCellStyle.toModifier()
                                    .border(1.px, LineStyle.Solid, if (isBlocked) css(BLOCKED_COLOR) else lineColor)
                                    .then(if (isBlocked) Modifier.backgroundColor(css(BLOCKED_COLOR)) else Modifier)
                                    .toAttrs {
                                        attr("title", tip)
                                        onMouseDown {
                                            it.preventDefault()
                                            val nextVal = !isBlocked
                                            paintValue = nextVal
                                            paint(selected, slot, nextVal)
                                        }
                                        onMouseEnter {
                                            paintValue?.let { v ->
                                                friends.firstOrNull { f -> f.id == selected.id }?.let { f -> paint(f, slot, v) }
                                            }
                                        }
                                    }
                            )
                        } else {
                            val busy = friends.filter { slot in it.blocked }
                            val isExtra = slot in extraFree
                            val modifier = when {
                                friends.isEmpty() -> Modifier.border(1.px, LineStyle.Solid, lineColor)
                                busy.isEmpty() -> Modifier.backgroundColor(css(FREE_COLOR)).border(1.px, LineStyle.Solid, css(FREE_COLOR))
                                isExtra && activeWinnerFriend != null -> Modifier
                                    .backgroundColor(CssColor(rgba(FREE_COLOR, 0.25)))
                                    .border(1.5.px, LineStyle.Dashed, css(activeWinnerFriend.color()))
                                busy.size == 1 -> Modifier
                                    .backgroundColor(CssColor(rgba(busy.first().color(), 0.7)))
                                    .border(1.px, LineStyle.Solid, lineColor)
                                else -> {
                                    val step = 100.0 / busy.size
                                    val stops = busy.mapIndexed { i, f ->
                                        val c = rgba(f.color(), 0.6)
                                        "$c ${i * step}% ${(i + 1) * step}%"
                                    }
                                    Modifier.border(1.px, LineStyle.Solid, lineColor)
                                        .styleModifier { property("background", "linear-gradient(90deg, ${stops.joinToString(", ")})") }
                                }
                            }

                            val tip = when {
                                friends.isEmpty() -> slotLabel
                                busy.isEmpty() -> "$slotLabel · Everyone is free! (Click to edit schedule)"
                                isExtra && activeWinnerFriend != null -> "$slotLabel · Free without ${activeWinnerFriend.name} (only ${activeWinnerFriend.name} busy · click to edit)"
                                busy.size == 1 -> "$slotLabel · Busy: ${busy.first().name} (click to edit)"
                                else -> "$slotLabel · Busy: ${busy.joinToString(", ") { it.name }} (click to edit)"
                            }

                            Div(
                                OrganizerCellStyle.toModifier()
                                    .then(modifier)
                                    .toAttrs {
                                        attr("title", tip)
                                        if (busy.isNotEmpty()) {
                                            onClick {
                                                // Jump to edit the busy friend (or removed winner if extra free)
                                                val target = if (isExtra && activeWinnerFriend != null) activeWinnerFriend else busy.first()
                                                selectedId = target.id
                                            }
                                        } else if (friends.isNotEmpty()) {
                                            onClick {
                                                // Switch to editing schedule
                                                selectedId = friends.first().id
                                            }
                                        }
                                    }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Swatch(modifier: Modifier) {
    Div(Modifier.size(0.85.cssRem).borderRadius(3.px).then(modifier).toAttrs())
}

@Composable
private fun Chip(
    text: String,
    active: Boolean,
    lineColor: CSSColorValue,
    strongText: CSSColorValue,
    dotColor: Int? = null,
    onDotClick: (() -> Unit)? = null,
    onRemove: (() -> Unit)? = null,
    onClick: () -> Unit,
) {
    Row(
        OrganizerChipStyle.toModifier()
            .gap(0.4.cssRem)
            .border(1.px, LineStyle.Solid, if (active) strongText else lineColor)
            .then(if (active) Modifier.fontWeight(FontWeight.Bold) else Modifier)
            .onClick { onClick() },
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (dotColor != null) {
            Div(
                Modifier.size(0.7.cssRem).borderRadius(50.px).backgroundColor(css(dotColor))
                    .onClick { it.stopPropagation(); onDotClick?.invoke() }
                    .toAttrs { attr("title", "Click to cycle color") }
            )
        }
        SpanText(text)
        if (onRemove != null) {
            SpanText(
                "×",
                Modifier.opacity(0.6).onClick { it.stopPropagation(); onRemove() }.title("Remove")
            )
        }
    }
}
