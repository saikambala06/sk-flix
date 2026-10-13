package com.skflip.tv.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.item
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.compose.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import androidx.tv.material3.Button
import androidx.tv.material3.CircularProgressIndicator
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.skflip.core.model.Movie
import com.skflip.core.network.ServiceLocator
import com.skflip.tv.ui.components.TvGenreRow

@Composable
fun TvHomeScreen(
    onMovieClick: (Movie) -> Unit,
    onPlayClick: (Movie) -> Unit,
    onLoginClick: () -> Unit
) {
    val viewModel: TvHomeViewModel = viewModel(factory = viewModelFactory {
        initializer { TvHomeViewModel(ServiceLocator.movieRepository) }
    })
    val state by viewModel.uiState.collectAsState()
    val isLoggedIn by ServiceLocator.sessionManager.isLoggedIn.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null -> Text(
                state.error ?: "Something went wrong",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(24.dp)
            )
            else -> {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    state.featured?.let { featured ->
                        item {
                            TvHeroBanner(
                                movie = featured,
                                isLoggedIn = isLoggedIn,
                                onPlay = { onPlayClick(featured) },
                                onInfo = { onMovieClick(featured) },
                                onLogin = onLoginClick
                            )
                        }
                    }
                    item { Spacer(Modifier.height(8.dp)) }
                    item { TvGenreRow("SkFlip Originals", state.originals, onMovieClick) }
                    item { TvGenreRow("Series", state.series, onMovieClick) }
                    item { TvGenreRow("Movies", state.films, onMovieClick) }
                    items(state.genreRows) { (genre, movies) ->
                        TvGenreRow(genre, movies, onMovieClick)
                    }
                    item { Spacer(Modifier.height(32.dp)) }
                }
            }
        }
    }
}

@Composable
private fun TvHeroBanner(
    movie: Movie,
    isLoggedIn: Boolean,
    onPlay: () -> Unit,
    onInfo: () -> Unit,
    onLogin: () -> Unit
) {
    Box(modifier = Modifier.fillMaxWidth().height(520.dp)) {
        AsyncImage(
            model = movie.backdropUrl ?: movie.posterUrl,
            contentDescription = movie.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )
        Box(
            modifier = Modifier.fillMaxSize().background(
                Brush.horizontalGradient(
                    colors = listOf(Color.Black.copy(alpha = 0.9f), Color.Transparent),
                    endX = 900f
                )
            )
        )
        Box(
            modifier = Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.9f)),
                    startY = 300f
                )
            )
        )

        if (!isLoggedIn) {
            OutlinedButton(
                onClick = onLogin,
                modifier = Modifier.align(Alignment.TopEnd).padding(32.dp)
            ) {
                Text("Sign In")
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(48.dp)
                .widthIn(max = 640.dp)
        ) {
            Text(movie.title, style = MaterialTheme.typography.displaySmall, color = Color.White)
            movie.description?.let {
                Spacer(Modifier.height(12.dp))
                Text(
                    it,
                    color = Color.White.copy(alpha = 0.85f),
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyLarge
                )
            }
            Spacer(Modifier.height(20.dp))
            Row {
                Button(onClick = onPlay) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Play")
                }
                Spacer(Modifier.width(16.dp))
                OutlinedButton(onClick = onInfo) {
                    Text("More Info")
                }
            }
        }
    }
}
