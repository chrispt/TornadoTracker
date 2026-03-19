package com.tornadotracker.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tornadotracker.domain.model.Category
import com.tornadotracker.domain.model.NwsProduct
import com.tornadotracker.ui.theme.MarkerDefault
import com.tornadotracker.ui.theme.TextPrimary
import com.tornadotracker.ui.theme.TextSecondary
import java.time.Duration
import java.time.Instant

private val SUB_TYPE_LABELS = mapOf(
    "TOR" to "Tornado Warning",
    "TOR_PDS" to "PDS Tornado Warning",
    "PNS_SURVEY" to "NWS Damage Survey",
    "PNS_TORNADO" to "Tornado Report",
    "LSR" to "Local Storm Report"
)

@Composable
fun ProductCard(
    product: NwsProduct,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val cat = product.category
    val badgeColor = cat?.color ?: MarkerDefault
    val badgeLabel = cat?.label ?: product.productCode
    val office = extractOffice(product.issuingOffice)
    val subLabel = SUB_TYPE_LABELS[product.subType]

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Category badge
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(badgeColor)
                    .padding(horizontal = 6.dp, vertical = 3.dp)
            ) {
                Text(
                    text = badgeLabel,
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(modifier = Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = office,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )

                if (subLabel != null) {
                    Text(
                        text = subLabel,
                        fontSize = 12.sp,
                        color = badgeColor,
                        fontWeight = FontWeight.Medium
                    )
                }

                Spacer(modifier = Modifier.height(2.dp))

                Text(
                    text = timeAgo(product.issuanceTime),
                    style = MaterialTheme.typography.bodySmall
                )

                if (product.productName.isNotBlank()) {
                    Text(
                        text = product.productName,
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

private fun extractOffice(office: String): String {
    if (office.isBlank()) return "---"
    // Extract 4-letter code from URL like "https://api.weather.gov/offices/KBMX"
    val match = Regex("""/offices/(\w+)""").find(office)
    return match?.groupValues?.get(1) ?: office.takeLast(4)
}

fun timeAgo(isoTime: String): String {
    return try {
        val then = Instant.parse(isoTime)
        val now = Instant.now()
        val duration = Duration.between(then, now)
        when {
            duration.toMinutes() < 1 -> "just now"
            duration.toMinutes() < 60 -> "${duration.toMinutes()}m ago"
            duration.toHours() < 24 -> "${duration.toHours()}h ago"
            duration.toDays() < 7 -> "${duration.toDays()}d ago"
            else -> "${duration.toDays() / 7}w ago"
        }
    } catch (e: Exception) {
        ""
    }
}
