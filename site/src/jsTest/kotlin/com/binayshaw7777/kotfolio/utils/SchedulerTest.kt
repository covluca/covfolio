package com.binayshaw7777.kotfolio.utils

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SchedulerTest {

    @Test
    fun testSlotIndexAndConversion() {
        assertEquals(0, Scheduler.slot(0, 8))
        assertEquals(13, Scheduler.slot(0, 21))
        assertEquals(14, Scheduler.slot(1, 8))
        assertEquals(97, Scheduler.slot(6, 21))
        assertEquals(98, Scheduler.SLOTS)

        assertEquals(0, Scheduler.day(0))
        assertEquals(8, Scheduler.hour(0))
        assertEquals(0, Scheduler.day(13))
        assertEquals(21, Scheduler.hour(13))
        assertEquals(6, Scheduler.day(97))
        assertEquals(21, Scheduler.hour(97))

        for (d in 0 until Scheduler.DAYS) {
            for (h in Scheduler.HOUR_RANGE) {
                val s = Scheduler.slot(d, h)
                assertEquals(d, Scheduler.day(s))
                assertEquals(h, Scheduler.hour(s))
            }
        }

        assertFailsWith<IllegalArgumentException> { Scheduler.slot(-1, 8) }
        assertFailsWith<IllegalArgumentException> { Scheduler.slot(7, 8) }
        assertFailsWith<IllegalArgumentException> { Scheduler.slot(0, 7) }
        assertFailsWith<IllegalArgumentException> { Scheduler.slot(0, 22) }
    }

    @Test
    fun testSlotRangeLabels() {
        val labels = Scheduler.HOUR_RANGE.map { Scheduler.slotRangeLabel(it) }
        assertEquals(14, labels.size)
        assertEquals("8:00-9:00", labels.first())
        assertEquals("9:00-10:00", Scheduler.slotRangeLabel(9))
        assertEquals("21:00-22:00", labels.last())
        assertTrue(22 !in Scheduler.HOUR_RANGE)
        assertTrue("22:00-23:00" !in labels)
    }

    @Test
    fun testEncodeAndDecodeSchedule() {
        // Empty schedule -> "0"
        assertEquals("0", Scheduler.encodeSchedule(emptySet()))
        assertEquals(emptySet(), Scheduler.decodeSchedule("0"))
        assertEquals(emptySet(), Scheduler.decodeSchedule("000"))

        // Single slot (first and last)
        val firstOnly = setOf(0)
        assertEquals("1", Scheduler.encodeSchedule(firstOnly))
        assertEquals(firstOnly, Scheduler.decodeSchedule(Scheduler.encodeSchedule(firstOnly)))

        val lastOnly = setOf(Scheduler.SLOTS - 1)
        val lastCode = Scheduler.encodeSchedule(lastOnly)
        assertEquals(17, lastCode.length)
        assertEquals(lastOnly, Scheduler.decodeSchedule(lastCode))

        // Full schedule (all 98 slots blocked)
        val full = (0 until Scheduler.SLOTS).toSet()
        val fullCode = Scheduler.encodeSchedule(full)
        assertEquals(17, fullCode.length)
        assertEquals(full, Scheduler.decodeSchedule(fullCode))

        // Arbitrary mixed schedule
        val sample = setOf(0, 1, 5, 13, 14, 28, 42, 63, 64, 96, 97)
        val sampleCode = Scheduler.encodeSchedule(sample)
        assertEquals(sample, Scheduler.decodeSchedule(sampleCode))

        // Invalid codes
        assertNull(Scheduler.decodeSchedule(""))
        assertNull(Scheduler.decodeSchedule("   "))
        assertNull(Scheduler.decodeSchedule("invalid!code"))
        assertNull(Scheduler.decodeSchedule("000000000000000000")) // 18 chars > MAX_CODE_LEN
        assertNull(Scheduler.decodeSchedule("00000000000000004"))  // bit 98 out of range (>= 98)
    }

    @Test
    fun testEncodeAndDecodeFriend() {
        val blocked = setOf(0, 14, 28, 97)

        // Default "Friend N" name omits prefix to keep code minimal
        val defaultCode = Scheduler.encodeFriend("Friend 1", blocked)
        assertTrue(':' !in defaultCode)
        val decodedDefault = Scheduler.decodeFriend(defaultCode)!!
        assertNull(decodedDefault.name)
        assertEquals(blocked, decodedDefault.blocked)

        // Custom friend name is preserved in code
        val customCode = Scheduler.encodeFriend("Luca", blocked)
        assertTrue(customCode.startsWith("Luca:"))
        val decodedCustom = Scheduler.decodeFriend(customCode)!!
        assertEquals("Luca", decodedCustom.name)
        assertEquals(blocked, decodedCustom.blocked)

        // Whitespace and colons in custom names
        val colonNameCode = Scheduler.encodeFriend("A:B", setOf(3, 7))
        val decodedColon = Scheduler.decodeFriend("  $colonNameCode  ")!!
        assertEquals("A-B", decodedColon.name)
        assertEquals(setOf(3, 7), decodedColon.blocked)

        // Invalid friend codes
        assertNull(Scheduler.decodeFriend(""))
        assertNull(Scheduler.decodeFriend(":0"))
        assertNull(Scheduler.decodeFriend("   :1"))
        assertNull(Scheduler.decodeFriend("Luca:"))
        assertNull(Scheduler.decodeFriend("Luca:invalid!"))
    }

    @Test
    fun testMutualFreeEmptyList() {
        val result = Scheduler.mutualFree(emptyList())
        assertTrue(result.isEmpty())
    }

    @Test
    fun testMutualFreeSinglePerson() {
        val freeAll = Scheduler.mutualFree(listOf(emptySet()))
        assertEquals(Scheduler.SLOTS, freeAll.size)

        val blocked5 = setOf(0, 10, 20, 30, 40)
        val freeSome = Scheduler.mutualFree(listOf(blocked5))
        assertEquals(Scheduler.SLOTS - 5, freeSome.size)
        assertTrue(0 !in freeSome)
        assertTrue(1 in freeSome)
    }

    @Test
    fun testMutualFreeMultiplePeople() {
        val personA = setOf(1, 2, 3)
        val personB = setOf(3, 4, 5)
        val mutual = Scheduler.mutualFree(listOf(personA, personB))
        assertEquals(Scheduler.SLOTS - 5, mutual.size)
        for (i in 1..5) {
            assertTrue(i !in mutual)
        }
        assertTrue(0 in mutual)
        assertTrue(6 in mutual)
    }

    @Test
    fun testBestOneRemovedLessThanTwoPeople() {
        assertNull(Scheduler.bestOneRemoved(emptyList()))
        assertNull(Scheduler.bestOneRemoved(listOf(setOf(1, 2))))
    }

    @Test
    fun testBestOneRemovedTwoPeople() {
        val personA = setOf(0, 1, 2) // 3 blocked
        val personB = setOf(10, 11)   // 2 blocked
        // Mutual free is SLOTS - 5
        // If remove A, remaining is B (SLOTS - 2 free) -> gain 3
        // If remove B, remaining is A (SLOTS - 3 free) -> gain 2
        val best = Scheduler.bestOneRemoved(listOf(personA, personB))
        assertEquals(listOf(0), best?.removed)
        assertEquals(3, best?.gain)
        assertEquals(Scheduler.SLOTS - 2, best?.free?.size)
    }

    @Test
    fun testBestOneRemovedThreePeopleClearWinner() {
        val alice = setOf(0, 1, 2)
        val bob = setOf(1, 2, 3)
        val charlie = setOf(10, 11, 12, 13, 14, 15) // Charlie has 6 unique blocked slots

        // Mutual free without Charlie gains slots 10..15 (+6)
        // Without Alice gains slot 0 (+1, since 1,2 blocked by bob)
        // Without Bob gains slot 3 (+1, since 1,2 blocked by alice)
        val best = Scheduler.bestOneRemoved(listOf(alice, bob, charlie))
        val b = best!!
        assertEquals(listOf(2), b.removed)
        assertEquals(6, b.gain)
        assertTrue(10 in b.free)
        assertTrue(15 in b.free)
    }

    @Test
    fun testBestOneRemovedTie() {
        val alice = setOf(0, 1)
        val bob = setOf(2, 3)
        val charlie = setOf(4, 5)
        // Each has 2 unique blocked slots.
        // Removing any person gains 2 slots.
        val best = Scheduler.bestOneRemoved(listOf(alice, bob, charlie))
        assertEquals(listOf(0, 1, 2), best?.removed)
        assertEquals(2, best?.gain)
    }

    @Test
    fun testBestOneRemovedZeroGainWhenOverlapped() {
        // Alice, Bob, Charlie all block the exact same slot 42, and nothing else.
        val blocked = listOf(setOf(42), setOf(42), setOf(42))
        val best = Scheduler.bestOneRemoved(blocked)
        assertEquals(listOf(0, 1, 2), best?.removed)
        assertEquals(0, best?.gain)
        assertEquals(Scheduler.SLOTS - 1, best?.free?.size)
    }

    @Test
    fun testFreeWithout() {
        val p0 = setOf(1, 2)
        val p1 = setOf(3, 4)
        val p2 = setOf(5, 6)
        val group = listOf(p0, p1, p2)

        val without0 = Scheduler.freeWithout(group, 0)
        assertTrue(1 in without0)
        assertTrue(2 in without0)
        assertTrue(3 !in without0)
        assertTrue(5 !in without0)

        assertTrue(Scheduler.freeWithout(group, -1).isEmpty())
        assertTrue(Scheduler.freeWithout(group, 5).isEmpty())
    }

    @Test
    fun testExtraFree() {
        val alice = setOf(1, 2)
        val bob = setOf(2, 3)
        val charlie = setOf(10, 11)
        val group = listOf(alice, bob, charlie)

        // Removing charlie unlocks slots 10 and 11
        val extraCharlie = Scheduler.extraFree(group, 2)
        assertEquals(setOf(10, 11), extraCharlie)

        // Removing alice unlocks slot 1 (since slot 2 is still blocked by bob)
        val extraAlice = Scheduler.extraFree(group, 0)
        assertEquals(setOf(1), extraAlice)

        // Out of bounds / invalid group size
        assertTrue(Scheduler.extraFree(group, -1).isEmpty())
        assertTrue(Scheduler.extraFree(group, 99).isEmpty())
        assertTrue(Scheduler.extraFree(listOf(alice), 0).isEmpty())
    }
}
