package com.binayshaw7777.kotfolio.utils

/**
 * Pure weekly-schedule math for the Organizer page.
 *
 * A week is 7 days x 14 one-hour slots (8:00-9:00 .. 21:00-22:00) = 98 slots,
 * indexed as `day * HOURS + (hour - START_HOUR)` (day 0 = Monday).
 * Each person is represented by the set of slots in which they are busy.
 */
object Scheduler {
    const val DAYS = 7
    const val START_HOUR = 8
    const val END_HOUR = 21
    val HOUR_RANGE = START_HOUR..END_HOUR
    const val HOURS = END_HOUR - START_HOUR + 1
    const val SLOTS = DAYS * HOURS

    private const val CODE_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_"
    private const val MAX_CODE_LEN = (SLOTS + 5) / 6 // 17 chars for 98 slots
    private val DEFAULT_NAME_REGEX = Regex("^Friend\\s+\\d+$", RegexOption.IGNORE_CASE)

    fun slot(day: Int, hour: Int): Int {
        require(day in 0 until DAYS) { "Day must be in 0..6, was $day" }
        require(hour in HOUR_RANGE) { "Hour must be in $START_HOUR..$END_HOUR, was $hour" }
        return day * HOURS + (hour - START_HOUR)
    }

    fun day(slot: Int): Int = slot / HOURS
    fun hour(slot: Int): Int = START_HOUR + (slot % HOURS)

    /** Formats a starting [hour] as an interval `"from x until y"`, e.g. `"8:00-9:00"`. */
    fun slotRangeLabel(hour: Int): String = "$hour:00-${hour + 1}:00"

    /**
     * Encodes a set of blocked slot indices (`0 until SLOTS`) into a compact 1..17 char code.
     */
    fun encodeSchedule(blocked: Set<Int>): String {
        val sb = StringBuilder(MAX_CODE_LEN)
        for (chunk in 0 until MAX_CODE_LEN) {
            var bits = 0
            for (b in 0..5) {
                val s = chunk * 6 + b
                if (s < SLOTS && s in blocked) {
                    bits = bits or (1 shl b)
                }
            }
            sb.append(CODE_ALPHABET[bits])
        }
        return sb.toString().trimEnd('0').ifEmpty { "0" }
    }

    /**
     * Decodes a compact schedule code back into a set of blocked slot indices, or `null` if invalid.
     */
    fun decodeSchedule(code: String): Set<Int>? {
        val cleaned = code.trim()
        if (cleaned.isEmpty() || cleaned.length > MAX_CODE_LEN) return null
        val result = LinkedHashSet<Int>()
        for (chunk in cleaned.indices) {
            val bits = CODE_ALPHABET.indexOf(cleaned[chunk])
            if (bits < 0) return null
            for (b in 0..5) {
                if ((bits and (1 shl b)) != 0) {
                    val s = chunk * 6 + b
                    if (s >= SLOTS) return null
                    result.add(s)
                }
            }
        }
        return result
    }

    data class DecodedFriend(val name: String?, val blocked: Set<Int>)

    /**
     * Encodes a single friend tab into a small shareable code.
     * Includes the friend's name prefix (`Name:code`) when a custom name is set,
     * or just the compact schedule code when the name is blank or a default `"Friend N"`.
     */
    fun encodeFriend(name: String, blocked: Set<Int>): String {
        val scheduleCode = encodeSchedule(blocked)
        val trimmed = name.trim().replace(':', '-')
        return if (trimmed.isEmpty() || DEFAULT_NAME_REGEX.matches(trimmed)) {
            scheduleCode
        } else {
            "$trimmed:$scheduleCode"
        }
    }

    /**
     * Decodes a shareable friend code (`Name:code` or raw `code`).
     * Returns `null` if the schedule code part is invalid.
     */
    fun decodeFriend(raw: String): DecodedFriend? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null
        val colonIndex = trimmed.lastIndexOf(':')
        val namePart = if (colonIndex >= 0) {
            trimmed.substring(0, colonIndex).trim().takeIf { it.isNotEmpty() } ?: return null
        } else null
        val codePart = if (colonIndex >= 0) trimmed.substring(colonIndex + 1).trim() else trimmed
        val blocked = decodeSchedule(codePart) ?: return null
        return DecodedFriend(namePart, blocked)
    }

    /** Slots in which nobody in [blocked] is busy. An empty group has no mutual free time. */
    fun mutualFree(blocked: List<Set<Int>>): Set<Int> {
        if (blocked.isEmpty()) return emptySet()
        return (0 until SLOTS).filterTo(LinkedHashSet()) { s -> blocked.none { s in it } }
    }

    /**
     * @property removed indices of the people whose removal yields the most mutual free hours
     *   (more than one when tied; the first one is the configuration whose [free] slots are reported).
     * @property free mutual free slots of the group without `removed.first()`.
     * @property gain how many free hours that adds compared to the whole group.
     */
    data class OneRemoved(val removed: List<Int>, val free: Set<Int>, val gain: Int)

    /**
     * Mutual free slots when friend at [index] is excluded from the group.
     */
    fun freeWithout(blocked: List<Set<Int>>, index: Int): Set<Int> {
        if (index !in blocked.indices) return emptySet()
        return mutualFree(blocked.filterIndexed { j, _ -> j != index })
    }

    /**
     * Unlocked free slots that would become mutually available if the friend at [index] were removed.
     */
    fun extraFree(blocked: List<Set<Int>>, index: Int): Set<Int> {
        if (index !in blocked.indices || blocked.size < 2) return emptySet()
        return freeWithout(blocked, index) - mutualFree(blocked)
    }

    /**
     * Finds the best "everyone but one" group. Requires at least 2 people.
     * When there are 2 people, removing one leaves the other person.
     * When there are 3+ people, removing one leaves the remaining group.
     */
    fun bestOneRemoved(blocked: List<Set<Int>>): OneRemoved? {
        if (blocked.size < 2) return null
        val base = mutualFree(blocked).size
        val results = blocked.indices.map { i -> i to freeWithout(blocked, i) }
        val bestSize = results.maxOf { it.second.size }
        val winners = results.filter { it.second.size == bestSize }
        return OneRemoved(winners.map { it.first }, winners.first().second, bestSize - base)
    }
}
