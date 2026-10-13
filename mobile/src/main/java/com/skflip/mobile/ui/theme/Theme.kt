package com.skflip.mobile.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val SkFlipDarkColors = darkColorScheme(
    primary = SkGold,
    onPrimary = Color.Black,
    secondary = SkCyan,
    background = SkBg,
    surface = SkSurface,
    onBackground = SkText,
    onSurface = SkText,
    error = SkRed
)

@Composable
fun SkFlipTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = SkFlipDarkColors // SkFlip is dark-themed only, matching the website

    val view = LocalView.current
    if (!view.isInEditMode) {
        val window = (view.context as? android.app.Activity)?.window
        window?.let {
            it.statusBarColor = SkBg.toArgb()
            it.navigationBarColor = SkBg.toArgb()
            WindowCompat.getInsetsController(it, view).isAppearanceLightStatusBars = false
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = SkFlipTypography,
        content = content
    )
}
