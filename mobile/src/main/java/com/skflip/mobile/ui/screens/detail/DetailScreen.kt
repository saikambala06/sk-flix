package com.skflip.mobile.ui.screens.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.item
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.compose.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import coil.compose.AsyncImage
import com.skflip.core.model.Episode
import com.skflip.core.network.ServiceLocator
import com.skflip.mobile.ui.theme.SkBg3
import com.skflip.mobile.ui.theme.SkGold
import com.skflip.mobile.ui.theme.SkMuted

@Composable
fun DetailScreen(
    movieId: String,
    onBack: () -> Unit,
    onPlay: (movieId: String, episodeIndex: Int) -> Unit
) {
    val viewModel: DetailViewModel = viewModel(factory = viewModelFactory {
        initializer {
            DetailViewModel(movieId, ServiceLocator.movieRepository, ServiceLocator.wishlistRepository)
        }
    })
    val state by viewModel.uiState.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null -> Text(
                state.error ?: "Failed to load",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(24.dp)
            )
            state.movie != null -> {
                val movie = state.movie!!
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    item {
                        Box(modifier = Modifier.fillMaxWidth().height(280.dp)) {
                            AsyncImage(
                                model = movie.backdropUrl ?: movie.posterUrl,
                                contentDescription = movie.title,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            )
                            Box(
                                modifier = Modifier.fillMaxSize().background(
                                    Brush.verticalGradient(
                                        colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.9f))
                                    )
                                )
                            )
                            IconButton(onClick = onBack, modifier = Modifier.padding(8.dp)) {
                                Icon(Icons.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                            }
                        }
                    }

                    item {
                        Column(modifier = Modifier.padding(20.dp)) {
                            Text(movie.title, style = MaterialTheme.typography.headlineMedium)
                            Spacer(Modifier.height(6.dp))
                            val meta = listOfNotNull(
                                movie.releaseYear?.toString(),
                                movie.rating,
                                if (movie.isSeries) "${movie.seasonCount ?: movie.episodesBySeason.size} Season(s)" else null
                            ).joinToString("  •  ")
                            if (meta.isNotBlank()) {
                                Text(meta, style = MaterialTheme.typography.bodyMedium, color = SkMuted)
                            }
                            if (movie.genres.isNotEmpty()) {
                                Spacer(Modifier.height(4.dp))
                                Text(movie.genres.joinToString(", "), style = MaterialTheme.typography.bodyMedium, color = SkMuted)
                            }
                            Spacer(Modifier.height(16.dp))

                            Row {
                                Button(
                                    onClick = { onPlay(movie.id, -1) },
                                    enabled = movie.playableUrl != null || movie.episodes.isNotEmpty(),
                                    colors = ButtonDefaults.buttonColors(containerColor = SkGold, contentColor = Color.Black),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(Icons.Filled.PlayArrow, contentDescription = null)
                                    Spacer(Modifier.width(6.dp))
                                    Text(if (movie.isSeries) "Play S1E1" else "Play")
                                }
                                Spacer(Modifier.width(12.dp))
                                OutlinedIconButton(
                                    onClick = { viewModel.toggleWishlist() },
                                    enabled = !state.isTogglingWishlist
                                ) {
                                    Icon(
                                        if (state.isInWishlist) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                        contentDescription = "Wishlist",
                                        tint = if (state.isInWishlist) SkGold else MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }

                            movie.description?.let {
                                Spacer(Modifier.height(16.dp))
                                Text(it, style = MaterialTheme.typography.bodyLarge)
                            }
                        }
                    }

                    if (movie.isSeries && movie.episodes.isNotEmpty()) {
                        movie.episodesBySeason.forEach { (season, episodes) ->
                            item {
                                Text(
                                    "Season $season",
                                    style = MaterialTheme.typography.titleMedium,
                                    modifier = Modifier.padding(start = 20.dp, top = 8.dp, bottom = 8.dp)
                                )
                            }
                            items(episodes) { episode ->
                                val globalIndex = movie.episodes.indexOf(episode)
                                EpisodeRow(episode = episode, onClick = { onPlay(movie.id, globalIndex) })
                            }
                        }
                    }

                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
}

@Composable
private fun EpisodeRow(episode: Episode, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        AsyncImage(
            model = episode.thumbnailUrl,
            contentDescription = episode.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .width(120.dp)
                .height(68.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(SkBg3)
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                "Episode ${episode.episodeNumber ?: ""}${if (!episode.title.isNullOrBlank()) " · ${episode.title}" else ""}",
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1
            )
            episode.description?.let {
                Spacer(Modifier.height(2.dp))
                Text(it, style = MaterialTheme.typography.bodyMedium, color = SkMuted, maxLines = 2)
            }
        }
    }
}
