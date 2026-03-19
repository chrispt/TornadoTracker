package com.tornadotracker.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tornadotracker.domain.model.TornadoData
import com.tornadotracker.ui.theme.TextSecondary
import com.tornadotracker.ui.theme.efColor

data class HighlightField(
    val label: String,
    val value: String,
    val color: androidx.compose.ui.graphics.Color? = null
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TornadoHighlights(tornado: TornadoData, index: Int = 0, modifier: Modifier = Modifier) {
    val fields = buildList {
        tornado.efRating?.let { add(HighlightField("EF Rating", it, efColor(it))) }
        tornado.pathLength?.let { add(HighlightField("Path Length", it)) }
        tornado.pathWidth?.let { add(HighlightField("Path Width", it)) }
        tornado.peakWinds?.let { add(HighlightField("Peak Winds", it)) }
        tornado.county?.let { add(HighlightField("County", it)) }
        tornado.state?.let { add(HighlightField("State", it)) }
        tornado.fatalities?.let { add(HighlightField("Fatalities", it.toString())) }
        tornado.injuries?.let { add(HighlightField("Injuries", it.toString())) }
        if (tornado.lat != null && tornado.lon != null) {
            add(HighlightField("Location", "%.2f, %.2f".format(tornado.lat, tornado.lon)))
        }
    }

    if (fields.isEmpty()) return

    Column(modifier = modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
        Text(
            text = if (index > 0) "Tornado Report #${index + 1}" else "Tornado Report",
            style = MaterialTheme.typography.titleMedium
        )

        Spacer(modifier = Modifier.height(8.dp))

        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            fields.forEach { field ->
                Column {
                    Text(text = field.label, fontSize = 10.sp, color = TextSecondary)
                    Text(
                        text = field.value,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = field.color ?: MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }

        tornado.summary?.let { summary ->
            Spacer(modifier = Modifier.height(6.dp))
            Text(text = summary, fontSize = 12.sp, color = TextSecondary)
        }
    }
}
