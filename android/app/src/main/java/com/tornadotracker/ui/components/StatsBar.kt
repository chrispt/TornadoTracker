package com.tornadotracker.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tornadotracker.domain.model.NwsProduct
import com.tornadotracker.domain.model.TornadoMarker
import com.tornadotracker.ui.theme.LsrColor
import com.tornadotracker.ui.theme.PnsColor
import com.tornadotracker.ui.theme.TextSecondary
import com.tornadotracker.ui.theme.TorColor

data class FeedStats(
    val total: Int = 0,
    val pnsCount: Int = 0,
    val torCount: Int = 0,
    val lsrCount: Int = 0,
    val pdsCount: Int = 0,
    val markerCount: Int = 0
)

fun computeStats(products: List<NwsProduct>, markers: List<TornadoMarker>): FeedStats {
    return FeedStats(
        total = products.size,
        pnsCount = products.count { it.productCode == "PNS" },
        torCount = products.count { it.productCode == "TOR" },
        lsrCount = products.count { it.productCode == "LSR" },
        pdsCount = products.count { it.isPDS },
        markerCount = markers.size
    )
}

@Composable
fun StatsBar(stats: FeedStats, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "${stats.total}",
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.onSurface
        )

        StatDot(color = PnsColor, label = "${stats.pnsCount}")
        StatDot(color = TorColor, label = "${stats.torCount}")
        StatDot(color = LsrColor, label = "${stats.lsrCount}")

        if (stats.pdsCount > 0) {
            Text(text = "PDS:${stats.pdsCount}", fontSize = 11.sp, color = TorColor, fontWeight = FontWeight.Bold)
        }

        if (stats.markerCount > 0) {
            Text(text = "${stats.markerCount} markers", fontSize = 11.sp, color = TextSecondary)
        }
    }
}

@Composable
private fun StatDot(color: androidx.compose.ui.graphics.Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(color))
        Text(text = label, fontSize = 11.sp, color = TextSecondary)
    }
}
