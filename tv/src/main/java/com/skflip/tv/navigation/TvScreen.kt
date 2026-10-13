package com.skflip.tv.navigation

sealed class TvScreen(val route: String) {
    data object Home : TvScreen("home")
    data object Login : TvScreen("login")

    data object Detail : TvScreen("detail/{movieId}") {
        fun createRoute(movieId: String) = "detail/$movieId"
    }

    data object Player : TvScreen("player/{movieId}?episodeIndex={episodeIndex}") {
        fun createRoute(movieId: String, episodeIndex: Int = -1) =
            "player/$movieId?episodeIndex=$episodeIndex"
    }
}
