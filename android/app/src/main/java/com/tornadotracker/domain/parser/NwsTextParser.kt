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

        // Extract tornado sections
        val tornadoes = if (isSurvey) {
            // Damage surveys use .Name... or ...Name... section headers
            val surveyRegex = Regex(
                """\n\s*\.{1,3}([^.\n][^.]*?)\.{3}\s*\n([\s\S]*?)(?=\n\s*\.{1,3}[^.\n][^.]*?\.{3}\s*\n|&&|\$\$|$)""",
                RegexOption.IGNORE_CASE
            )
            val nonTornadoPattern = Regex("""\b(?:hail|wind|flood|snow|ice|lightning|rain)\b""", RegexOption.IGNORE_CASE)
            surveyRegex.findAll(text).mapNotNull { match ->
                if (nonTornadoPattern.containsMatchIn(match.groupValues[1])) return@mapNotNull null
                val rawName = match.groupValues[1].trim()
                parseTornadoSection(match.groupValues[2], rawName)
            }.toList()
        } else {
            // Standard PNS — ...TORNADO... section headers
            val tornadoRegex = Regex(
                """\.\.\.\s*TORNADO\s*\.\.\.([\s\S]*?)(?=\.\.\.\s*(?:TORNADO|HAIL|WIND|FLOOD|SNOW|ICE|FIRE|LIGHTNING)\s*\.\.\.|$)""",
                RegexOption.IGNORE_CASE
            )
            tornadoRegex.findAll(text).mapNotNull { match ->
                parseTornadoSection(match.groupValues[1])
            }.toList()
        }

        val hasTornadoContent = tornadoes.isNotEmpty() || isSurvey || hasTornadoKeywords(upperText)
        val subType = if (isSurvey) "PNS_SURVEY" else if (tornadoes.isNotEmpty()) "PNS_TORNADO" else "PNS"

        return ParseResult(tornadoes, hasTornadoContent, subType, isPDS)
    }

    private val STATE_NAME_TO_CODE = mapOf(
        "alabama" to "AL","alaska" to "AK","arizona" to "AZ","arkansas" to "AR",
        "california" to "CA","colorado" to "CO","connecticut" to "CT","delaware" to "DE",
        "florida" to "FL","georgia" to "GA","hawaii" to "HI","idaho" to "ID",
        "illinois" to "IL","indiana" to "IN","iowa" to "IA","kansas" to "KS",
        "kentucky" to "KY","louisiana" to "LA","maine" to "ME","maryland" to "MD",
        "massachusetts" to "MA","michigan" to "MI","minnesota" to "MN","mississippi" to "MS",
        "missouri" to "MO","montana" to "MT","nebraska" to "NE","nevada" to "NV",
        "new hampshire" to "NH","new jersey" to "NJ","new mexico" to "NM","new york" to "NY",
        "north carolina" to "NC","north dakota" to "ND","ohio" to "OH","oklahoma" to "OK",
        "oregon" to "OR","pennsylvania" to "PA","rhode island" to "RI","south carolina" to "SC",
        "south dakota" to "SD","tennessee" to "TN","texas" to "TX","utah" to "UT",
        "vermont" to "VT","virginia" to "VA","washington" to "WA","west virginia" to "WV",
        "wisconsin" to "WI","wyoming" to "WY"
    )

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

        // Extract area description from "* Tornado Warning for...\n  <area>..."
        var summary: String? = null
        var county: String? = null
        var state: String? = null
        val areaMatch = Regex("""\*\s*Tornado Warning for\.\.\.?\s*\n([\s\S]*?)(?=\n\s*\*|\n\n)""", RegexOption.IGNORE_CASE).find(text)
        if (areaMatch != null) {
            summary = areaMatch.groupValues[1].replace(Regex("\\s+"), " ").replace(Regex("\\.{3,}"), "").trim()
            val countyMatch = Regex("""([A-Za-z\s]+?)\s+County""", RegexOption.IGNORE_CASE).find(summary)
            if (countyMatch != null) county = countyMatch.groupValues[1].trim()
            val stateNameMatch = Regex("""\bin\s+(?:[\w\s]+?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*$""").find(summary)
            if (stateNameMatch != null) {
                state = STATE_NAME_TO_CODE[stateNameMatch.groupValues[1].lowercase()]
            }
            if (state == null) {
                val codeMatch = Regex("""\b([A-Z]{2})\b""").find(summary)
                if (codeMatch != null && codeMatch.groupValues[1] in STATE_CODES) {
                    state = codeMatch.groupValues[1]
                }
            }
        }

        // Extract end time from "* Until <time>."
        val untilMatch = Regex("""\*\s*Until\s+(\d{3,4}\s+[AP]M\s+[A-Z]{2,4})\.?""", RegexOption.IGNORE_CASE).find(text)
        val endTime = untilMatch?.groupValues?.get(1)?.trim()

        // Extract HAZARD, SOURCE, IMPACT
        val hazard = Regex("""HAZARD\.{3}\s*(.+)""", RegexOption.IGNORE_CASE).find(text)
            ?.groupValues?.get(1)?.trimEnd('.')?.trim()
        val source = Regex("""SOURCE\.{3}\s*(.+)""", RegexOption.IGNORE_CASE).find(text)
            ?.groupValues?.get(1)?.trimEnd('.')?.trim()
        val impact = Regex("""IMPACT\.{3}\s*([\s\S]*?)(?=\n\s*\n|LAT\.\.\.LON|PRECAUTIONARY)""", RegexOption.IGNORE_CASE).find(text)
            ?.groupValues?.get(1)?.replace(Regex("\\s+"), " ")?.trimEnd('.')?.trim()

        // Extract motion description from "* At <time>..." paragraph
        val motionMatch = Regex("""\*\s*At\s+\d{3,4}\s+[AP]M[\s\S]*?(?=\n\s*\n|HAZARD)""", RegexOption.IGNORE_CASE).find(text)
        val motionDescription = motionMatch?.value?.replaceFirst(Regex("""^\*\s*"""), "")?.replace(Regex("\\s+"), " ")?.trim()

        val tornadoes = if (polygon.isNotEmpty()) {
            val centroid = LatLon(
                lat = polygon.map { it.lat }.average(),
                lon = polygon.map { it.lon }.average()
            )
            listOf(
                TornadoData(
                    lat = centroid.lat,
                    lon = centroid.lon,
                    county = county,
                    state = state,
                    endTime = endTime,
                    summary = summary ?: "Tornado Warning",
                    source = source,
                    hazard = hazard,
                    impact = impact,
                    motionDescription = motionDescription,
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
            // LSR tabular rows always start with a time like "1248 AM" — require it
            // so we don't pick up the word "tornado" in remarks/free-text lines.
            if (!Regex("""^\s*\d{3,4}\s+[AP]M\b""", RegexOption.IGNORE_CASE).containsMatchIn(line)) continue
            if (!line.contains("TORNADO", ignoreCase = true) || line.contains("WATERSPOUT", ignoreCase = true)) continue

            val line1 = line.trim()

            // Extract time from start of line (e.g., "1103 PM")
            val timeMatch = Regex("""^(\d{3,4}\s+[AP]M)\b""", RegexOption.IGNORE_CASE).find(line1)
            val startTime = timeMatch?.groupValues?.get(1)?.trim()

            // Extract location description (between event type and coordinates)
            val locMatch = Regex("""TORNADO\s{2,}(.+?)\s{2,}\d""", RegexOption.IGNORE_CASE).find(line1)
            val location = locMatch?.groupValues?.get(1)?.trim()

            // Extract coordinates (decimal with N/S/E/W suffixes or plain decimal)
            var lat: Double? = null
            var lon: Double? = null
            val nwsCoordMatch = Regex("""(\d+\.\d+)\s*([NS])\s+(\d+\.\d+)\s*([WE])""", RegexOption.IGNORE_CASE).find(line1)
            if (nwsCoordMatch != null) {
                lat = nwsCoordMatch.groupValues[1].toDoubleOrNull()
                if (nwsCoordMatch.groupValues[2].uppercase() == "S") lat = lat?.let { -it }
                lon = nwsCoordMatch.groupValues[3].toDoubleOrNull()
                if (nwsCoordMatch.groupValues[4].uppercase() == "W") lon = lon?.let { -it }
            } else {
                val decCoordMatch = Regex("""([-]?\d{2,3}\.\d+)\s+([-]?\d{2,3}\.\d+)""").find(line1)
                if (decCoordMatch != null) {
                    lat = decCoordMatch.groupValues[1].toDoubleOrNull()
                    lon = decCoordMatch.groupValues[2].toDoubleOrNull()
                    if (lon != null && lon > 0) lon = -lon
                }
            }

            // Parse continuation line for county, state, source
            var county: String? = null
            var state: String? = null
            var source: String? = null
            if (i + 1 < lines.size) {
                val line2 = lines[i + 1]
                val contMatch = Regex("""^\s*\d{2}/\d{2}/\d{4}\s+(.*)""").find(line2)
                if (contMatch != null) {
                    val rest = contMatch.groupValues[1]
                    val fieldsMatch = Regex("""^\s*([A-Za-z\s.'-]+?)\s{2,}([A-Z]{2})\s{2,}(.+)""").find(rest)
                    if (fieldsMatch != null) {
                        county = fieldsMatch.groupValues[1].trim()
                        val stCode = fieldsMatch.groupValues[2].trim()
                        if (stCode in STATE_CODES) state = stCode
                        source = fieldsMatch.groupValues[3].trim()
                    }
                }
            }

            // Build rich summary
            val parts = mutableListOf<String>()
            if (startTime != null) parts.add(startTime)
            parts.add("Tornado")
            if (location != null) parts.add(location)
            if (county != null) {
                val loc = "$county County" + if (state != null) ", $state" else ""
                parts.add(loc)
            }
            if (source != null) parts.add("($source)")

            tornadoes.add(
                TornadoData(
                    lat = lat,
                    lon = lon,
                    county = county,
                    state = state,
                    startTime = startTime,
                    summary = parts.joinToString(" - "),
                    source = source,
                    location = location
                )
            )
        }

        return ParseResult(
            tornadoes = tornadoes,
            hasTornadoContent = tornadoes.isNotEmpty() || hasTornadoKeywords(text),
            subType = "LSR",
            isPDS = false
        )
    }

    fun parseTornadoSection(section: String?, eventName: String? = null): TornadoData? {
        if (section.isNullOrBlank()) return null
        val cleanedEventName = cleanEventName(eventName)

        // EF Rating
        val efMatch = Regex("""(?:RATING|EF\s*SCALE|RATED)\s*(?::|\.{3})?\s*(EF[0-5U]|F[0-5])""", RegexOption.IGNORE_CASE).find(section)
        var efRating = efMatch?.groupValues?.get(1)?.uppercase()
        if (efRating != null && efRating.startsWith("F") && !efRating.startsWith("EF")) {
            efRating = "E$efRating"
        }

        // Path length
        val lengthMatch = Regex("""PATH\s*LENGTH\s*(?:/[^/]*/)??\s*(?::|\.{3})?\s*([\d.]+)\s*(MILES?|MI|KM)""", RegexOption.IGNORE_CASE).find(section)
        val pathLength = lengthMatch?.let { "${it.groupValues[1]} ${it.groupValues[2].lowercase()}" }

        // Path width
        val widthMatch = Regex("""PATH\s*WIDTH\s*(?:/[^/]*/)??\s*(?::|\.{3})?\s*([\d.]+)\s*(YARDS?|YDS?|FEET|FT|METERS?|M)\b""", RegexOption.IGNORE_CASE).find(section)
        val pathWidth = widthMatch?.let { "${it.groupValues[1]} ${it.groupValues[2].lowercase()}" }

        // Coordinates — try labeled decimal first (damage surveys), then compressed, then positional
        var startLat: Double? = null
        var startLon: Double? = null
        var endLat: Double? = null
        var endLon: Double? = null

        // Try labeled decimal: Start Lat/Lon: 37.1765 / -92.0689
        val startDecMatch = Regex("""START\s*LAT/?LON[:\s]+([-]?\d{2,3}\.\d+)\s*[,/]\s*([-]?\d{2,3}\.\d+)""", RegexOption.IGNORE_CASE).find(section)
        if (startDecMatch != null) {
            startLat = startDecMatch.groupValues[1].toDoubleOrNull()
            startLon = startDecMatch.groupValues[2].toDoubleOrNull()
            if (startLon != null && startLon > 0) startLon = -startLon
        }
        val endDecMatch = Regex("""END\s*LAT/?LON[:\s]+([-]?\d{2,3}\.\d+)\s*[,/]\s*([-]?\d{2,3}\.\d+)""", RegexOption.IGNORE_CASE).find(section)
        if (endDecMatch != null) {
            endLat = endDecMatch.groupValues[1].toDoubleOrNull()
            endLon = endDecMatch.groupValues[2].toDoubleOrNull()
            if (endLon != null && endLon > 0) endLon = -endLon
        }

        // Try labeled compressed format: START LAT/LON 3456 8912
        if (startLat == null) {
            val startMatch = Regex("""START\s*LAT/?LON[:\s]+(\d{4})\s+(\d{4,5})""", RegexOption.IGNORE_CASE).find(section)
            if (startMatch != null) {
                val sc = parseNWSCoords(startMatch.groupValues[1], startMatch.groupValues[2])
                if (sc != null) { startLat = sc.lat; startLon = sc.lon }
            }
        }
        if (endLat == null) {
            val endCoordMatch = Regex("""END\s*LAT/?LON[:\s]+(\d{4})\s+(\d{4,5})""", RegexOption.IGNORE_CASE).find(section)
            if (endCoordMatch != null) {
                val ec = parseNWSCoords(endCoordMatch.groupValues[1], endCoordMatch.groupValues[2])
                if (ec != null) { endLat = ec.lat; endLon = ec.lon }
            }
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
        var county = countyMatch?.groupValues?.get(1)?.trim()
        // Fallback: extract county from location lines like "/ Texas County / MO"
        if (county == null) {
            val locMatch = Regex("""/\s*([A-Za-z\s]+?)\s+County\s*/""", RegexOption.IGNORE_CASE).find(section)
            if (locMatch != null) county = locMatch.groupValues[1].trim()
        }

        // State
        val stateMatch = Regex("""\b([A-Z]{2})\s*(?:COUNTY|PARISH|\.{3}|$)""", RegexOption.IGNORE_CASE).find(section)
        var state = stateMatch?.groupValues?.get(1)?.uppercase()?.takeIf { it in STATE_CODES }
        // Fallback: extract state from location lines like "County / MO"
        if (state == null) {
            val stateLocMatch = Regex("""County\s*/\s*([A-Z]{2})\b""", RegexOption.IGNORE_CASE).find(section)
            if (stateLocMatch != null) {
                val code = stateLocMatch.groupValues[1].uppercase()
                if (code in STATE_CODES) state = code
            }
        }

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

        val hasData = efRating != null || pathLength != null || lat != null
            || county != null || fatalities != null || cleanedEventName != null
        if (!hasData) return null

        return TornadoData(
            eventName = cleanedEventName,
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

    /** Normalize a survey section header. Skip uninformative bare "tornado" labels. */
    private fun cleanEventName(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val cleaned = raw.trimEnd('.').trim()
        if (cleaned.isEmpty()) return null
        if (Regex("""^tornado(es)?$""", RegexOption.IGNORE_CASE).matches(cleaned)) return null
        return cleaned
    }
}
