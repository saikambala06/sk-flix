package com.skflip.mobile.ui.screens.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.skflip.core.network.ServiceLocator
import com.skflip.mobile.ui.theme.SkGold
import com.skflip.mobile.ui.theme.SkMuted
import kotlinx.coroutines.launch

/**
 * Browsing the catalog never requires auth (GET /api/movies is public),
 * so a person can use the app as a guest. Wishlist actions need a session,
 * so this screen offers Login/Signup when there's no user, and account info
 * + Log Out when there is one.
 */
@Composable
fun ProfileScreen(
    onNavigateToLogin: () -> Unit,
    onNavigateToSignup: () -> Unit,
    onLoggedOut: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val isLoggedIn by ServiceLocator.sessionManager.isLoggedIn.collectAsState()
    val user = ServiceLocator.sessionManager.currentUser

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(40.dp))
        Surface(shape = CircleShape, color = SkGold) {
            Box(modifier = Modifier.size(84.dp), contentAlignment = Alignment.Center) {
                Text(
                    text = (user?.name?.take(2) ?: "?").uppercase(),
                    color = Color.Black,
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.headlineMedium
                )
            }
        }
        Spacer(Modifier.height(16.dp))

        if (isLoggedIn && user != null) {
            Text(user.name, style = MaterialTheme.typography.titleLarge)
            Text(user.email, color = SkMuted, style = MaterialTheme.typography.bodyMedium)
            if (user.isAdmin) {
                Spacer(Modifier.height(4.dp))
                Text("Admin", color = SkGold, style = MaterialTheme.typography.labelLarge)
            }
            Spacer(Modifier.height(40.dp))
            Button(
                onClick = {
                    scope.launch {
                        ServiceLocator.authRepository.logout()
                        onLoggedOut()
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Log Out")
            }
        } else {
            Text("You're browsing as a guest", style = MaterialTheme.typography.titleLarge)
            Text(
                "Log in to save titles to your wishlist and sync across devices.",
                color = SkMuted,
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(Modifier.height(32.dp))
            Button(onClick = onNavigateToLogin, modifier = Modifier.fillMaxWidth()) {
                Text("Log In")
            }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = onNavigateToSignup, modifier = Modifier.fillMaxWidth()) {
                Text("Create Account")
            }
        }
    }
}
