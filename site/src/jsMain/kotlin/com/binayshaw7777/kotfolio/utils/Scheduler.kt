package com.binayshaw7777.kotfolio.utils

/**
 * Pure weekly-schedule math for the Organizer page.
 *
 * A week is 7 days x 15 hours (08:00..22:00) = 105 slots,
 * indexed as `day * HOURS + (hour - START_HOUR)` (day 0 = Monday).
 * Each person is represented by the set of slots in which they are busy.
 */
object Scheduler {
    const val DAYS = 7
    const val START_HOUR = 8
    const val END_HOUR = 22
    val HOUR_RANGE = START_HOUR..END_HOUR
    const val HOURS = END_HOUR - START_HOUR + 1
    const val SLOTS = DAYS * HOURS

    fun slot(day: Int, hour: Int): Int {
        require(day in 0 until DAYS) { "Day must be in 0..6, was $day" }
        require(hour in HOUR_RANGE) { "Hour must be in $START_HOUR..$END_HOUR, was $hour" }
        return day * HOURS + (hour - START_HOUR)
    }

    fun day(slot: Int): Int = slot / HOURS
    fun hour(slot: Int): Int = START_HOUR + (slot % HOURS)

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
