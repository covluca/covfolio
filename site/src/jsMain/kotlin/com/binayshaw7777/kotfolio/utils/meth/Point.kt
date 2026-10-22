package com.binayshaw7777.kotfolio.utils.meth

import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

open class Point {
    var x: Double = 0.0
    var y: Double = 0.0

    constructor(x: Double = 0.0, y: Double = 0.0) {
        this.x = x
        this.y = y
    }

    constructor(point: Point?) {
        if (point == null) {
            this.x = 0.0
            this.y = 0.0
        } else {
            this.x = point.x
            this.y = point.y
        }
    }

    fun subtract(other: Point): Point {
        return Point(x - other.x, y - other.y)
    }

    fun add(other: Point): Point {
        return Point(x + other.x, y + other.y)
    }

    fun divide(div: Double): Point {
        return Point(x / div, y / div)
    }

    fun distanceTo(other: Point): Double {
        return other.subtract(this).radius()
    }

    fun atan(): Double {
        return kotlin.math.atan2(x, y)
    }

    fun atan2(other: Point): Double {
        return kotlin.math.atan2(other.x - x, other.y - y)
    }

    fun radius(): Double {
        return hypot(x, y)
    }

    fun rotate(amount: Double): Point {
        return polar(radius(), atan() + amount)
    }

    override fun toString(): String {
        return "x=" + x + ", y=" + y
    }

    companion object {
        fun polar(r: Double, angle: Double): Point {
            return Point(cos(angle) * r, sin(angle) * r)
        }
    }
}