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
import com.tornadotracker.domain.model.Category
import com.tornadotracker.domain.model.NwsProduct
import com.tornadotracker.ui.theme.TextSecondary

data class FeedStats(
    val total: Int = 0,
    val categoryCounts: Map<Category, Int> = emptyMap()
)

fun computeStats(products: List<NwsProduct>): FeedStats {
    val catCounts = mutableMapOf<Category, Int>()
    products.forEach { p ->
        val cat = p.category ?: return@forEach
        catCounts[cat] = (catCounts[cat] ?: 0) + 1
    }
    return FeedStats(
        total = products.size,
        categoryCounts = catCounts
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

        Category.entries.forEach { cat ->
            val count = stats.categoryCounts[cat] ?: 0
            if (count > 0) {
                StatDot(color = cat.color, label = "$count")
            }
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
