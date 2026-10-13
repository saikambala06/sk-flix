package com.skflip.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

val SkBg = Color(0xFF08080F)
val SkBg2 = Color(0xFF0E0E1C)
val SkBg3 = Color(0xFF13131F)
val SkSurface = Color(0xFF1A1A2E)
val SkGold = Color(0xFFE0A830)
val SkGold2 = Color(0xFFF5C842)
val SkCyan = Color(0xFF00D4FF)
val SkText = Color(0xFFF0F0F8)
val SkMuted = Color(0xFF8888AA)

private val SkFlipTvColors = darkColorScheme(
    primary = SkGold,
    onPrimary = Color.Black,
    secondary = SkCyan,
    background = SkBg,
    surface = SkSurface,
    onBackground = SkText,
    onSurface = SkText
)

@Composable
fun SkFlipTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = SkFlipTvColors,
        content = content
    )
}
