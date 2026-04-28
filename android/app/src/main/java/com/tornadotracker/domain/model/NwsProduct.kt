package com.tornadotracker.domain.model

data class NwsProduct(
    val id: String,
    val productCode: String,
    val productName: String,
    val issuingOffice: String,
    val issuanceTime: String,
    val subType: String? = null,
    val isPDS: Boolean = false,
    val category: Category? = null,
    /** Populated for live tornado warnings sourced from /alerts/active */
    val alert: AlertPayload? = null
)

data class AlertPayload(
    val headline: String? = null,
    val description: String? = null,
    val instruction: String? = null,
    val areaDesc: String? = null,
    val severity: String? = null,
    val certainty: String? = null,
    val urgency: String? = null,
    val onset: String? = null,
    val expires: String? = null,
    val polygon: List<LatLon> = emptyList(),
    val centroid: LatLon? = null
)
