package com.skflip.mobile.navigation

sealed class Screen(val route: String) {
    data object Splash : Screen("splash")
    data object Login : Screen("login")
    data object Signup : Screen("signup")
    data object Home : Screen("home")
    data object Search : Screen("search")
    data object Wishlist : Screen("wishlist")
    data object Profile : Screen("profile")

    data object Detail : Screen("detail/{movieId}") {
        fun createRoute(movieId: String) = "detail/$movieId"
    }

    data object Player : Screen("player/{movieId}?episodeIndex={episodeIndex}") {
        fun createRoute(movieId: String, episodeIndex: Int = -1) =
            "player/$movieId?episodeIndex=$episodeIndex"
    }
}
