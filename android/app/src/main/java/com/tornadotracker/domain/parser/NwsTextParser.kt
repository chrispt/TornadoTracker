package com.tornadotracker.domain.parser

import com.tornadotracker.domain.model.LatLon
import com.tornadotracker.domain.model.ParseResult
import com.tornadotracker.domain.model.TornadoData
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NwsTextParser @Inject constructor() {

    private val STATE_CODES = setOf(
        "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
        "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
        "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
        "VA","WA","WV","WI","WY","DC","PR","VI","GU","AS","MP"
    )

    fun parseProductText(text: String?, productType: String = "PNS"): ParseResult {
        if (text.isNullOrBlank()) return ParseResult()

        val upperText = text.uppercase()
        val isPDS = detectPDS(upperText)

        return when (productType) {
            "TOR" -> parseTorWarning(text, isPDS)
            "LSR" -> parseLSR(text)
            else -> parsePNS(text, upperText, isPDS)
        }
    }

    private fun parsePNS(text: String, upperText: String, isPDS: Boolean): ParseResult {
        // Exclude historical bulletins
        if (upperText.contains("ON THIS DATE IN WEATHER HISTORY")) {
            return ParseResult()
        }

        // NWS Damage Survey — flag, don't return early
        val isSurvey = upperText.contains("NWS DAMAGE SURVEY")

        // Look for ...TORNADO... sections
        val tornadoRegex = Regex(
            """\.\.\.\s*TORNADO\s*\.\.\.([\s\S]*?)(?=\.\.\.\s*(?:TORNADO|HAIL|WIND|FLOOD|SNOW|ICE|FIRE|LIGHTNING)\s*\.\.\.|$)""",
            RegexOption.IGNORE_CASE
        )

        val tornadoes = tornadoRegex.findAll(text).mapNotNull { match ->
            parseTornadoSection(match.groupValues[1])
        }.toList()

        val hasTornadoContent = tornadoes.isNotEmpty() || isSurvey || hasTornadoKeywords(upperText)
        val subType = if (isSurvey) "PNS_SURVEY" else if (tornadoes.isNotEmpty()) "PNS_TORNADO" else "PNS"

        return ParseResult(tornadoes, hasTornadoContent, subType, isPDS)
    }

    private fun parseTorWarning(text: String, isPDS: Boolean): ParseResult {
        val polygon = mutableListOf<LatLon>()
        val latLonMatch = Regex("""LAT\.\.\.LON\s+([\d\s]+)""").find(text)

        if (latLonMatch != null) {
            val pairs = latLonMatch.groupValues[1].trim().split(Regex("\\s+"))
            var i = 0
            while (i < pairs.size - 1) {
                val coords = parseNWSCoords(pairs[i], pairs[i + 1])
                if (coords != null) polygon.add(coords)
                i += 2
            }
        }

        val tornadoes = if (polygon.isNotEmpty()) {
            val centroid = LatLon(
                lat = polygon.map { it.lat }.average(),
                lon = polygon.map { it.lon }.average()
            )
            listOf(
                TornadoData(
                    lat = centroid.lat,
                    lon = centroid.lon,
                    summary = "Tornado Warning",
                    polygon = polygon
                )
            )
        } else {
            emptyList()
        }

        val subType = if (isPDS) "TOR_PDS" else "TOR"
        return ParseResult(tornadoes, hasTornadoContent = true, subType = subType, isPDS = isPDS)
    }

    private fun parseLSR(text: String): ParseResult {
        val tornadoes = mutableListOf<TornadoData>()
        val lines = text.split("\n")

        for (i in lines.indices) {
            val line = lines[i]
            if (line.contains("TORNADO", ignoreCase = true) && !line.contains("WATERSPOUT", ignoreCase = true)) {
                val contextStart = maxOf(0, i - 2)
                val contextEnd = minOf(lines.size, i + 4)
                val context = lines.subList(contextStart, contextEnd).joinToString("\n")
                val coordMatch = Regex("""([-]?\d{2,3}\.\d+)\s+([-]?\d{2,3}\.\d+)""").find(context)

                var lat: Double? = null
                var lon: Double? = null

                if (coordMatch != null) {
                    lat = coordMatch.groupValues[1].toDoubleOrNull()
                    lon = coordMatch.groupValues[2].toDoubleOrNull()
                    if (lon != null && lon > 0) lon = -lon
                }

                tornadoes.add(
                    TornadoData(
                        lat = lat,
                        lon = lon,
                        summary = line.trim().take(200)
                    )
                )
            }
        }

        return ParseResult(
            tornadoes = tornadoes,
            hasTornadoContent = tornadoes.isNotEmpty() || hasTornadoKeywords(text),
            subType = "LSR",
            isPDS = false
        )
    }

    fun parseTornadoSection(section: String?): TornadoData? {
        if (section.isNullOrBlank()) return null

        // EF Rating
        val efMatch = Regex("""(?:RATING|EF\s*SCALE|RATED)\s*(?::|\.{3})?\s*(EF[0-5U]|F[0-5])""", RegexOption.IGNORE_CASE).find(section)
        var efRating = efMatch?.groupValues?.get(1)?.uppercase()
        if (efRating != null && efRating.startsWith("F") && !efRating.startsWith("EF")) {
            efRating = "E$efRating"
        }

        // Path length
        val lengthMatch = Regex("""PATH\s*LENGTH\s*(?::|\.{3})?\s*([\d.]+)\s*(MILES?|MI|KM)""", RegexOption.IGNORE_CASE).find(section)
        val pathLength = lengthMatch?.let { "${it.groupValues[1]} ${it.groupValues[2].lowercase()}" }

        // Path width
        val widthMatch = Regex("""PATH\s*WIDTH\s*(?::|\.{3})?\s*([\d.]+)\s*(YARDS?|YDS?|FEET|FT|METERS?|M)\b""", RegexOption.IGNORE_CASE).find(section)
        val pathWidth = widthMatch?.let { "${it.groupValues[1]} ${it.groupValues[2].lowercase()}" }

        // Coordinates — try labeled START/END first, then positional pairs
        var startLat: Double? = null
        var startLon: Double? = null
        var endLat: Double? = null
        var endLon: Double? = null

        val startMatch = Regex("""START\s*LAT/?LON[:\s]+(\d{4})\s+(\d{4,5})""", RegexOption.IGNORE_CASE).find(section)
        val endCoordMatch = Regex("""END\s*LAT/?LON[:\s]+(\d{4})\s+(\d{4,5})""", RegexOption.IGNORE_CASE).find(section)

        if (startMatch != null) {
            val sc = parseNWSCoords(startMatch.groupValues[1], startMatch.groupValues[2])
            if (sc != null) { startLat = sc.lat; startLon = sc.lon }
        }
        if (endCoordMatch != null) {
            val ec = parseNWSCoords(endCoordMatch.groupValues[1], endCoordMatch.groupValues[2])
            if (ec != null) { endLat = ec.lat; endLon = ec.lon }
        }

        // Fallback: find all compressed coord pairs positionally
        if (startLat == null) {
            val allCoords = Regex("""(\d{4})\s+(\d{4,5})(?:\s|$)""").findAll(section)
                .mapNotNull { parseNWSCoords(it.groupValues[1], it.groupValues[2]) }
                .toList()
            if (allCoords.size >= 2) {
                startLat = allCoords[0].lat; startLon = allCoords[0].lon
                endLat = allCoords[1].lat; endLon = allCoords[1].lon
            } else if (allCoords.size == 1) {
                startLat = allCoords[0].lat; startLon = allCoords[0].lon
            }
        }

        // Use start as primary location for backward compat
        var lat: Double? = startLat
        var lon: Double? = startLon

        // Decimal degree fallback
        if (lat == null) {
            val decMatch = Regex("""([-]?\d{2,3}\.\d+)\s*[,/]\s*([-]?\d{2,3}\.\d+)""").find(section)
            if (decMatch != null) {
                val v1 = decMatch.groupValues[1].toDoubleOrNull()
                val v2 = decMatch.groupValues[2].toDoubleOrNull()
                if (v1 != null && v2 != null && v1 in 20.0..55.0 && (v2 <= -60.0 || v2 >= 60.0)) {
                    lat = v1
                    lon = if (v2 < 0) v2 else -v2
                }
            }
        }

        // County
        val countyMatch = Regex("""(?:IN|NEAR|OF)\s+([A-Z][A-Z\s]+?)\s+COUNTY""", RegexOption.IGNORE_CASE).find(section)
        val county = countyMatch?.groupValues?.get(1)?.trim()

        // State
        val stateMatch = Regex("""\b([A-Z]{2})\s*(?:COUNTY|PARISH|\.{3}|$)""", RegexOption.IGNORE_CASE).find(section)
        val state = stateMatch?.groupValues?.get(1)?.uppercase()?.takeIf { it in STATE_CODES }

        // Fatalities
        val fatMatch = Regex("""(\d+)\s*(?:FATALIT|DEATH|KILLED)""", RegexOption.IGNORE_CASE).find(section)
        val fatalities = fatMatch?.groupValues?.get(1)?.toIntOrNull()

        // Injuries
        val injMatch = Regex("""(\d+)\s*INJUR""", RegexOption.IGNORE_CASE).find(section)
        val injuries = injMatch?.groupValues?.get(1)?.toIntOrNull()

        // Peak winds
        val windMatch = Regex("""(?:PEAK|MAX|EST)\s*(?:WINDS?|GUSTS?)\s*(?::|\.{3})?\s*(\d+)\s*MPH""", RegexOption.IGNORE_CASE).find(section)
        val peakWinds = windMatch?.let { "${it.groupValues[1]} mph" }

        // Summary
        val summary = section.trim().split("\n")
            .filter { it.trim().length > 10 }
            .firstOrNull()?.trim()?.take(200)

        val hasData = efRating != null || pathLength != null || lat != null || county != null || fatalities != null
        if (!hasData) return null

        return TornadoData(
            efRating = efRating,
            pathLength = pathLength,
            pathWidth = pathWidth,
            lat = lat,
            lon = lon,
            startLat = startLat,
            startLon = startLon,
            endLat = endLat,
            endLon = endLon,
            county = county,
            state = state,
            fatalities = fatalities,
            injuries = injuries,
            peakWinds = peakWinds,
            summary = summary
        )
    }

    fun parseNWSCoords(latStr: String, lonStr: String): LatLon? {
        if (latStr.length != 4) return null

        val lat = latStr.substring(0, 2).toIntOrNull()?.let { deg ->
            latStr.substring(2).toIntOrNull()?.let { min -> deg + min / 100.0 }
        } ?: return null

        val lon = when (lonStr.length) {
            4 -> lonStr.substring(0, 2).toIntOrNull()?.let { deg ->
                lonStr.substring(2).toIntOrNull()?.let { min -> -(deg + min / 100.0) }
            }
            5 -> lonStr.substring(0, 3).toIntOrNull()?.let { deg ->
                lonStr.substring(3).toIntOrNull()?.let { min -> -(deg + min / 100.0) }
            }
            else -> null
        } ?: return null

        // CONUS sanity check
        if (lat < 20 || lat > 55 || lon > -60 || lon < -135) return null

        return LatLon(lat, lon)
    }

    private fun detectPDS(upperText: String): Boolean {
        return "PARTICULARLY DANGEROUS SITUATION" in upperText
    }

    private fun hasTornadoKeywords(text: String): Boolean {
        val upper = text.uppercase()
        return listOf("TORNADO", "TORNADOES", "FUNNEL", "TWISTER", "WATERSPOUT").any { it in upper }
    }
}
