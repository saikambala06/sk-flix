package com.skflip.mobile.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.NavType
import androidx.compose.ui.unit.dp
import com.skflip.mobile.ui.screens.auth.LoginScreen
import com.skflip.mobile.ui.screens.auth.SignupScreen
import com.skflip.mobile.ui.screens.detail.DetailScreen
import com.skflip.mobile.ui.screens.home.HomeScreen
import com.skflip.mobile.ui.screens.player.PlayerScreen
import com.skflip.mobile.ui.screens.profile.ProfileScreen
import com.skflip.mobile.ui.screens.search.SearchScreen
import com.skflip.mobile.ui.screens.splash.SplashScreen
import com.skflip.mobile.ui.screens.wishlist.WishlistScreen

private data class BottomTab(val screen: Screen, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

private val bottomTabs = listOf(
    BottomTab(Screen.Home, "Home", Icons.Filled.Home),
    BottomTab(Screen.Search, "Search", Icons.Filled.Search),
    BottomTab(Screen.Wishlist, "Wishlist", Icons.Filled.Favorite),
    BottomTab(Screen.Profile, "Profile", Icons.Filled.Person)
)

@Composable
fun SkFlipNavGraph() {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val showBottomBar = bottomTabs.any { it.screen.route == currentRoute }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    bottomTabs.forEach { tab ->
                        val selected = backStackEntry?.destination?.hierarchy?.any { it.route == tab.screen.route } == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                navController.navigate(tab.screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label) }
                        )
                    }
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Splash.route,
            modifier = androidx.compose.ui.Modifier.padding(
                bottom = if (showBottomBar) padding.calculateBottomPadding() else 0.dp
            )
        ) {
            composable(Screen.Splash.route) {
                SplashScreen(onReady = { isLoggedIn ->
                    val destination = Screen.Home.route
                    navController.navigate(destination) {
                        popUpTo(Screen.Splash.route) { inclusive = true }
                    }
                })
            }

            composable(Screen.Login.route) {
                LoginScreen(
                    onLoginSuccess = { navController.popBackStack() },
                    onNavigateToSignup = { navController.navigate(Screen.Signup.route) }
                )
            }

            composable(Screen.Signup.route) {
                SignupScreen(
                    onSignupSuccess = { navController.popBackStack() },
                    onNavigateToLogin = { navController.navigate(Screen.Login.route) }
                )
            }

            composable(Screen.Home.route) {
                HomeScreen(onMovieClick = { movie ->
                    navController.navigate(Screen.Detail.createRoute(movie.id))
                })
            }

            composable(Screen.Search.route) {
                SearchScreen(onMovieClick = { movie ->
                    navController.navigate(Screen.Detail.createRoute(movie.id))
                })
            }

            composable(Screen.Wishlist.route) {
                WishlistScreen(onMovieClick = { movie ->
                    navController.navigate(Screen.Detail.createRoute(movie.id))
                })
            }

            composable(Screen.Profile.route) {
                ProfileScreen(
                    onNavigateToLogin = { navController.navigate(Screen.Login.route) },
                    onNavigateToSignup = { navController.navigate(Screen.Signup.route) },
                    onLoggedOut = { /* stay on Profile tab; it will redraw in guest state */ }
                )
            }

            composable(
                route = Screen.Detail.route,
                arguments = listOf(navArgument("movieId") { type = NavType.StringType })
            ) { backStack ->
                val movieId = backStack.arguments?.getString("movieId") ?: return@composable
                DetailScreen(
                    movieId = movieId,
                    onBack = { navController.popBackStack() },
                    onPlay = { id, episodeIndex ->
                        navController.navigate(Screen.Player.createRoute(id, episodeIndex))
                    }
                )
            }

            composable(
                route = Screen.Player.route,
                arguments = listOf(
                    navArgument("movieId") { type = NavType.StringType },
                    navArgument("episodeIndex") { type = NavType.IntType; defaultValue = -1 }
                )
            ) { backStack ->
                val movieId = backStack.arguments?.getString("movieId") ?: return@composable
                val episodeIndex = backStack.arguments?.getInt("episodeIndex") ?: -1
                PlayerScreen(
                    movieId = movieId,
                    initialEpisodeIndex = episodeIndex,
                    onBack = { navController.popBackStack() }
                )
            }
        }
    }
}
