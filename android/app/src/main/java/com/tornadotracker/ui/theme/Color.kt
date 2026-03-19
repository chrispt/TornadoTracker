package com.tornadotracker.ui.theme

import androidx.compose.ui.graphics.Color

// Background colors (matching web app dark theme)
val Background = Color(0xFF0F1419)
val Surface = Color(0xFF1E2538)
val SurfaceVariant = Color(0xFF2A3347)

// Text colors
val TextPrimary = Color(0xFFE8EAED)
val TextSecondary = Color(0xFF9AA0A6)

// Product type colors
val PnsColor = Color(0xFF3B82F6)
val TorColor = Color(0xFFEF4444)
val LsrColor = Color(0xFF8B5CF6)

// Marker colors
val MarkerTor = Color(0xFFA855F7)
val MarkerPns = Color(0xFF3B82F6)
val MarkerLsr = Color(0xFF8B5CF6)
val MarkerDefault = Color(0xFF6B7280)

// EF Scale colors
val EfUnknown = Color(0xFF6B7280)
val Ef0Color = Color(0xFFFDE047)
val Ef1Color = Color(0xFFFACC15)
val Ef2Color = Color(0xFFF97316)
val Ef3Color = Color(0xFFEF4444)
val Ef4Color = Color(0xFFDC2626)
val Ef5Color = Color(0xFF991B1B)

// PDS banner
val PdsBannerBg = Color(0xFFDC2626)
val PdsBannerText = Color.White

fun efColor(rating: String?): Color = when (rating) {
    "EF0" -> Ef0Color
    "EF1" -> Ef1Color
    "EF2" -> Ef2Color
    "EF3" -> Ef3Color
    "EF4" -> Ef4Color
    "EF5" -> Ef5Color
    else -> EfUnknown
}

fun productTypeColor(code: String): Color = when (code) {
    "PNS" -> PnsColor
    "TOR" -> TorColor
    "LSR" -> LsrColor
    else -> MarkerDefault
}
