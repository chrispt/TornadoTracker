package com.tornadotracker.data.api

import com.google.gson.annotations.SerializedName

data class ProductListResponse(
    @SerializedName("@graph") val graph: List<ProductSummary> = emptyList()
)

data class ProductSummary(
    val id: String,
    val productCode: String? = null,
    val productName: String? = null,
    val issuingOffice: String? = null,
    val issuanceTime: String? = null,
    @SerializedName("@type") val type: String? = null
)

data class ProductDetailResponse(
    val id: String,
    val productCode: String? = null,
    val productName: String? = null,
    val issuingOffice: String? = null,
    val issuanceTime: String? = null,
    val productText: String? = null
)

// ── Active alerts (GeoJSON) ────────────────────────────────────────────

data class ActiveAlertsResponse(
    val features: List<AlertFeature> = emptyList()
)

data class AlertFeature(
    val id: String? = null,
    val geometry: AlertGeometry? = null,
    val properties: AlertProperties? = null
)

data class AlertGeometry(
    val type: String? = null,
    /** GeoJSON coordinates — Polygon: [[[lon, lat], ...]] */
    val coordinates: Any? = null
)

data class AlertProperties(
    val id: String? = null,
    val event: String? = null,
    val headline: String? = null,
    val description: String? = null,
    val instruction: String? = null,
    val areaDesc: String? = null,
    val severity: String? = null,
    val certainty: String? = null,
    val urgency: String? = null,
    val sent: String? = null,
    val effective: String? = null,
    val onset: String? = null,
    val expires: String? = null,
    val ends: String? = null,
    val senderName: String? = null
)
