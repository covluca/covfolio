package com.binayshaw7777.kotfolio.utils.meth

import kotlin.math.hypot

class Pose2d : Point {
    var heading: Double

    constructor(x: Double = 0.0, y: Double = 0.0, heading: Double = 0.0) {
        this.x = x
        this.y = y
        this.heading = heading
    }

    constructor(pose2d: Pose2d) {
        this.x = pose2d.x
        this.y = pose2d.y
        this.heading = pose2d.heading
    }

    constructor(p: Point?, heading: Double) {
        if (p != null) {
            this.x = p.x
            this.y = p.y
        } else {
            this.x = 0.0
            this.y = 0.0
        }
        this.heading = heading
    }

    fun subtract(other: Pose2d): Pose2d {
        return Pose2d(this.x - other.x, this.y - other.y, this.heading - other.heading)
    }

    fun distanceToPose(other: Pose2d): Double {
        return other.subtract(this).radius()
    }

    fun divide(other: Pose2d): Pose2d {
        return Pose2d(this.x / other.x, this.y / other.y, this.heading / other.heading)
    }

    override fun toString(): String {
        return "x=" + x + ", y=" + y+", heading=" + heading
    }

}