package com.tornadotracker.domain.model

import androidx.compose.ui.graphics.Color

enum class ProductType(
    val code: String,
    val label: String,
    val color: Color
) {
    PNS("PNS", "Public Information Statement", Color(0xFF3B82F6)),
    TOR("TOR", "Tornado Warning", Color(0xFFEF4444)),
    LSR("LSR", "Local Storm Report", Color(0xFF8B5CF6));

    companion object {
        fun fromCode(code: String): ProductType? = entries.find { it.code == code }
    }
}
