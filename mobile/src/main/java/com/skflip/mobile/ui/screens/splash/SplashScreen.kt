package com.skflip.mobile.ui.screens.splash

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.skflip.core.network.ServiceLocator
import com.skflip.mobile.ui.theme.SkGold
import kotlinx.coroutines.delay

@Composable
fun SplashScreen(
    onReady: (isLoggedIn: Boolean) -> Unit
) {
    LaunchedEffect(Unit) {
        // Small delay so the brand mark is visible; session restore already
        // kicked off in SkFlipApplication, this just waits for it to settle.
        delay(400)
        onReady(ServiceLocator.sessionManager.isLoggedIn.value)
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text("SkFlip", style = MaterialTheme.typography.headlineLarge, color = SkGold)
    }
}
