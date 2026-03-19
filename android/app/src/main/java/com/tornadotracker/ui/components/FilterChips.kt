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
import com.tornadotracker.domain.model.Category
import com.tornadotracker.ui.theme.TextPrimary

@Composable
fun FilterChips(
    selectedCategories: Set<String>,
    onToggle: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Category.entries.forEach { cat ->
            val selected = cat.key in selectedCategories
            FilterChip(
                selected = selected,
                onClick = { onToggle(cat.key) },
                label = { Text(cat.label) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = cat.color.copy(alpha = 0.25f),
                    selectedLabelColor = TextPrimary,
                    labelColor = TextPrimary.copy(alpha = 0.6f),
                    containerColor = Color.Transparent
                )
            )
        }
    }
}
