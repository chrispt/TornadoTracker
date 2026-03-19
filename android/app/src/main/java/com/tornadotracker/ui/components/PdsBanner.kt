package com.tornadotracker.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tornadotracker.ui.theme.PdsBannerBg
import com.tornadotracker.ui.theme.PdsBannerText

@Composable
fun PdsBanner(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(PdsBannerBg)
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "PARTICULARLY DANGEROUS SITUATION",
            color = PdsBannerText,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
        )
    }
}
