package com.skflip.mobile.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.item
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
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
import coil.compose.AsyncImage
import com.skflip.core.model.Movie
import com.skflip.core.network.ServiceLocator
import com.skflip.mobile.ui.components.GenreRow
import com.skflip.mobile.ui.theme.SkGold

@Composable
fun HomeScreen(
    onMovieClick: (Movie) -> Unit
) {
    val viewModel: HomeViewModel = viewModel(factory = viewModelFactory {
        initializer { HomeViewModel(ServiceLocator.movieRepository) }
    })
    val state by viewModel.uiState.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            }
            state.error != null -> {
                Column(
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(state.error ?: "Something went wrong", color = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { viewModel.loadContent() }) { Text("Retry") }
                }
            }
            else -> {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    state.featured?.let { featured ->
                        item { HeroBanner(featured, onClick = { onMovieClick(featured) }) }
                    }
                    item { Spacer(Modifier.height(8.dp)) }
                    item { GenreRow("SkFlip Originals", state.originals, onMovieClick) }
                    item { GenreRow("Series", state.series, onMovieClick) }
                    item { GenreRow("Movies", state.films, onMovieClick) }
                    items(state.genreRows) { (genre, movies) ->
                        GenreRow(genre, movies, onMovieClick)
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
}

@Composable
private fun HeroBanner(movie: Movie, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(420.dp)
    ) {
        AsyncImage(
            model = movie.backdropUrl ?: movie.posterUrl,
            contentDescription = movie.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f)),
                        startY = 100f
                    )
                )
        )
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(20.dp)
        ) {
            Text(
                text = movie.title,
                style = MaterialTheme.typography.headlineMedium,
                color = Color.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            movie.description?.let {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = it,
                    color = Color.White.copy(alpha = 0.8f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            Spacer(Modifier.height(14.dp))
            Button(
                onClick = onClick,
                colors = ButtonDefaults.buttonColors(containerColor = SkGold, contentColor = Color.Black)
            ) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("View")
            }
        }
    }
}
