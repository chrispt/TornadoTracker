package com.tornadotracker.domain.model

data class NwsProduct(
    val id: String,
    val productCode: String,
    val productName: String,
    val issuingOffice: String,
    val issuanceTime: String,
    val subType: String? = null,
    val isPDS: Boolean = false
)
