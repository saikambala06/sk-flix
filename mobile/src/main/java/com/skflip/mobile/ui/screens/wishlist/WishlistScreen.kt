package com.skflip.mobile.ui.screens.wishlist

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.compose.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import com.skflip.core.model.Movie
import com.skflip.core.network.ServiceLocator
import com.skflip.mobile.ui.components.MovieCard
import com.skflip.mobile.ui.theme.SkMuted

@Composable
fun WishlistScreen(onMovieClick: (Movie) -> Unit) {
    val viewModel: WishlistViewModel = viewModel(factory = viewModelFactory {
        initializer { WishlistViewModel(ServiceLocator.movieRepository, ServiceLocator.wishlistRepository) }
    })
    val state by viewModel.uiState.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null -> Text(
                state.error ?: "Failed to load wishlist",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(24.dp)
            )
            state.movies.isEmpty() -> Text(
                "Your wishlist is empty.\nTap the heart on any title to save it here.",
                color = SkMuted,
                modifier = Modifier.align(Alignment.Center).padding(24.dp)
            )
            else -> LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(state.movies, key = { it.id }) { movie ->
                    Box {
                        MovieCard(movie = movie, onClick = { onMovieClick(movie) }, cardWidth = 110.dp)
                        IconButton(
                            onClick = { viewModel.removeFromWishlist(movie.id) },
                            modifier = Modifier.align(Alignment.TopEnd).size(28.dp)
                        ) {
                            Icon(Icons.Filled.Close, contentDescription = "Remove", tint = SkMuted)
                        }
                    }
                }
            }
        }
    }
}
