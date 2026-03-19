package com.tornadotracker.domain.model

data class TornadoMarker(
    val lat: Double,
    val lon: Double,
    val efRating: String? = null,
    val productId: String,
    val label: String,
    val county: String? = null,
    val pathLength: String? = null,
    val type: String,
    val category: Category? = null,
    val polygon: List<LatLon>? = null,
    val pathLine: List<LatLon>? = null
)
