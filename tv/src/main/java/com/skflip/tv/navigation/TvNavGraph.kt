package com.skflip.tv.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.skflip.tv.ui.screens.detail.TvDetailScreen
import com.skflip.tv.ui.screens.home.TvHomeScreen
import com.skflip.tv.ui.screens.login.TvLoginScreen
import com.skflip.tv.ui.screens.player.TvPlayerScreen

@Composable
fun SkFlipTvNavGraph() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = TvScreen.Home.route) {

        composable(TvScreen.Home.route) {
            TvHomeScreen(
                onMovieClick = { movie -> navController.navigate(TvScreen.Detail.createRoute(movie.id)) },
                onPlayClick = { movie -> navController.navigate(TvScreen.Player.createRoute(movie.id, -1)) },
                onLoginClick = { navController.navigate(TvScreen.Login.route) }
            )
        }

        composable(TvScreen.Login.route) {
            TvLoginScreen(
                onDone = { navController.popBackStack() },
                onSkip = { navController.popBackStack() }
            )
        }

        composable(
            route = TvScreen.Detail.route,
            arguments = listOf(navArgument("movieId") { type = NavType.StringType })
        ) { backStack ->
            val movieId = backStack.arguments?.getString("movieId") ?: return@composable
            TvDetailScreen(
                movieId = movieId,
                onPlay = { id, episodeIndex ->
                    navController.navigate(TvScreen.Player.createRoute(id, episodeIndex))
                }
            )
        }

        composable(
            route = TvScreen.Player.route,
            arguments = listOf(
                navArgument("movieId") { type = NavType.StringType },
                navArgument("episodeIndex") { type = NavType.IntType; defaultValue = -1 }
            )
        ) { backStack ->
            val movieId = backStack.arguments?.getString("movieId") ?: return@composable
            val episodeIndex = backStack.arguments?.getInt("episodeIndex") ?: -1
            TvPlayerScreen(movieId = movieId, initialEpisodeIndex = episodeIndex)
        }
    }
}
