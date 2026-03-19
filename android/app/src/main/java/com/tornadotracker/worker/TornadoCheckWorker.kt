package com.tornadotracker.worker

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.tornadotracker.data.api.NwsApiService
import com.tornadotracker.data.db.NotifiedProduct
import com.tornadotracker.data.db.NotifiedProductDao
import com.tornadotracker.domain.parser.NwsTextParser
import com.tornadotracker.notification.NotificationHelper
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

@HiltWorker
class TornadoCheckWorker @AssistedInject constructor(
    @Assisted private val context: Context,
    @Assisted params: WorkerParameters,
    private val api: NwsApiService,
    private val parser: NwsTextParser,
    private val notifiedDao: NotifiedProductDao
) : CoroutineWorker(context, params) {

    companion object {
        private val TYPES_TO_CHECK = listOf("TOR", "PNS", "LSR")
        private const val SEVEN_DAYS_MS = 7L * 24 * 60 * 60 * 1000
    }

    override suspend fun doWork(): Result {
        return try {
            checkForNewProducts()
            pruneOldEntries()
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    private suspend fun checkForNewProducts() {
        var notificationId = System.currentTimeMillis().toInt()

        for (type in TYPES_TO_CHECK) {
            try {
                val response = api.getProducts(type, 20)
                for (summary in response.graph) {
                    if (notifiedDao.exists(summary.id)) continue

                    // Mark as seen regardless of whether we notify
                    notifiedDao.insert(NotifiedProduct(productId = summary.id))

                    // Fetch detail and parse
                    try {
                        val detail = api.getProduct(summary.id)
                        val parsed = parser.parseProductText(detail.productText, detail.productCode ?: type)

                        val shouldNotify = when {
                            // All TOR products get notifications
                            type == "TOR" -> true
                            // PDS warnings always notify
                            parsed.isPDS -> true
                            // Damage surveys
                            parsed.subType == "PNS_SURVEY" -> true
                            // PNS with actual tornado data
                            parsed.subType == "PNS_TORNADO" -> true
                            // LSR tornado reports
                            type == "LSR" && parsed.hasTornadoContent -> true
                            else -> false
                        }

                        if (shouldNotify) {
                            val office = extractOffice(summary.issuingOffice)
                            val title = buildTitle(type, parsed.subType, parsed.isPDS, office)
                            val body = buildBody(parsed)

                            NotificationHelper.showNotification(
                                context = context,
                                id = notificationId++,
                                title = title,
                                body = body,
                                productId = summary.id
                            )
                        }
                    } catch (_: Exception) {
                        // Skip individual product failures
                    }
                }
            } catch (_: Exception) {
                // Skip type if fetch fails
            }
        }
    }

    private suspend fun pruneOldEntries() {
        val cutoff = System.currentTimeMillis() - SEVEN_DAYS_MS
        notifiedDao.deleteOlderThan(cutoff)
    }

    private fun buildTitle(type: String, subType: String?, isPDS: Boolean, office: String): String {
        return when {
            isPDS && type == "TOR" -> "PDS Tornado Warning - $office"
            type == "TOR" -> "Tornado Warning - $office"
            subType == "PNS_SURVEY" -> "NWS Damage Survey - $office"
            subType == "PNS_TORNADO" -> "Tornado Report - $office"
            type == "LSR" -> "Tornado LSR - $office"
            else -> "Tornado Alert - $office"
        }
    }

    private fun buildBody(parsed: com.tornadotracker.domain.model.ParseResult): String {
        val tornado = parsed.tornadoes.firstOrNull()
        return buildString {
            tornado?.efRating?.let { append("$it ") }
            tornado?.county?.let { append("in $it County") }
            tornado?.pathLength?.let {
                if (isNotEmpty()) append(" · ")
                append("Path: $it")
            }
            if (isEmpty()) append("New tornado product detected")
        }
    }

    private fun extractOffice(office: String?): String {
        if (office.isNullOrBlank()) return "NWS"
        val match = Regex("""/offices/(\w+)""").find(office)
        return match?.groupValues?.get(1) ?: "NWS"
    }
}
