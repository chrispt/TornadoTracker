package com.tornadotracker.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.tornadotracker.domain.model.ProductType
import com.tornadotracker.ui.theme.TextPrimary

@Composable
fun FilterChips(
    selectedTypes: Set<String>,
    onToggle: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        ProductType.entries.forEach { type ->
            val selected = type.code in selectedTypes
            FilterChip(
                selected = selected,
                onClick = { onToggle(type.code) },
                label = { Text(type.code) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = type.color.copy(alpha = 0.25f),
                    selectedLabelColor = TextPrimary,
                    labelColor = TextPrimary.copy(alpha = 0.6f),
                    containerColor = Color.Transparent
                )
            )
        }
    }
}
