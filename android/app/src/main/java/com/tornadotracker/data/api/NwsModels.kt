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
