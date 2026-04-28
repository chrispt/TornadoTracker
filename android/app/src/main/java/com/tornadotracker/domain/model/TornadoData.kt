package com.tornadotracker.domain.model

data class TornadoData(
    /** Section header from a damage survey (e.g. "Greens Creek Tornado") */
    val eventName: String? = null,
    /** Radar-derived tornado status: "CONFIRMED" | "INDICATED" | null */
    val radarStatus: String? = null,
    val efRating: String? = null,
    val pathLength: String? = null,
    val pathWidth: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val startLat: Double? = null,
    val startLon: Double? = null,
    val endLat: Double? = null,
    val endLon: Double? = null,
    val county: String? = null,
    val state: String? = null,
    val fatalities: Int? = null,
    val injuries: Int? = null,
    val peakWinds: String? = null,
    val startTime: String? = null,
    val endTime: String? = null,
    val summary: String? = null,
    val source: String? = null,
    val hazard: String? = null,
    val impact: String? = null,
    val motionDescription: String? = null,
    val location: String? = null,
    val polygon: List<LatLon>? = null
)

data class LatLon(val lat: Double, val lon: Double)
