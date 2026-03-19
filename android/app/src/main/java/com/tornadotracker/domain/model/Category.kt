package com.tornadotracker.domain.model

import androidx.compose.ui.graphics.Color

/**
 * User-facing tornado categories that map from NWS sub-types.
 */
enum class Category(
    val key: String,
    val label: String,
    val color: Color,
    val shape: MarkerShape
) {
    SURVEY("SURVEY", "Damage Surveys", Color(0xFF3B82F6), MarkerShape.DIAMOND),
    LSR("LSR", "Storm Reports", Color(0xFF8B5CF6), MarkerShape.SQUARE),
    PDS("PDS", "PDS Warnings", Color(0xFFEF4444), MarkerShape.TRIANGLE),
    WARNING("WARNING", "Tornado Warnings", Color(0xFFA855F7), MarkerShape.CIRCLE);

    companion object {
        fun fromKey(key: String): Category? = entries.find { it.key == key }

        /** Map NWS sub-type to user-facing category */
        fun fromSubType(subType: String?): Category? = when (subType) {
            "PNS_SURVEY", "PNS_TORNADO" -> SURVEY
            "LSR" -> LSR
            "TOR_PDS" -> PDS
            "TOR" -> WARNING
            else -> null
        }
    }
}

enum class MarkerShape {
    DIAMOND, SQUARE, TRIANGLE, CIRCLE
}
