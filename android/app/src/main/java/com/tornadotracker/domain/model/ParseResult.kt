package com.tornadotracker.domain.model

data class ParseResult(
    val tornadoes: List<TornadoData> = emptyList(),
    val hasTornadoContent: Boolean = false,
    val subType: String? = null,
    val isPDS: Boolean = false
)
