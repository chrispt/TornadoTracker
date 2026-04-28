package com.tornadotracker.domain.model

import androidx.compose.ui.graphics.Color

/**
 * User-facing tornado categories — ordered by severity for the UI.
 */
enum class Category(
    val key: String,
    val label: String,
    val color: Color
) {
    EMERGENCY("EMERGENCY", "Tornado Emergency", Color(0xFFDC2626)),
    ALERT("ALERT", "Active Alerts", Color(0xFFF43F5E)),
    WATCH("WATCH", "Tornado Watches", Color(0xFFF59E0B)),
    WARNING("WARNING", "Tornado Warnings", Color(0xFFA855F7)),
    PDS("PDS", "PDS Warnings", Color(0xFFEF4444)),
    SURVEY("SURVEY", "Damage Surveys", Color(0xFF3B82F6)),
    LSR("LSR", "Storm Reports", Color(0xFF8B5CF6));

    companion object {
        fun fromKey(key: String): Category? = entries.find { it.key == key }

        fun fromSubType(subType: String?): Category? = when (subType) {
            "ALERT_TOR_EMERGENCY", "TOR_EMERGENCY" -> EMERGENCY
            "ALERT_TOR", "ALERT_TOR_PDS" -> ALERT
            "WATCH_TOR", "WATCH_TOR_PDS" -> WATCH
            "PNS_SURVEY", "PNS_TORNADO" -> SURVEY
            "LSR" -> LSR
            "TOR_PDS" -> PDS
            "TOR" -> WARNING
            else -> null
        }
    }
}
