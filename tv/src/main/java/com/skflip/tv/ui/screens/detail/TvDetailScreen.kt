package com.skflip.tv.ui.screens.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.item
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.compose.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import androidx.tv.material3.Button
import androidx.tv.material3.CircularProgressIndicator
import androidx.tv.material3.Icon
import androidx.tv.material3.IconButton
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.skflip.core.model.Episode
import com.skflip.core.network.ServiceLocator
import com.skflip.tv.ui.theme.SkBg3
import com.skflip.tv.ui.theme.SkGold
import com.skflip.tv.ui.theme.SkMuted

@Composable
fun TvDetailScreen(
    movieId: String,
    onPlay: (movieId: String, episodeIndex: Int) -> Unit
) {
    val viewModel: TvDetailViewModel = viewModel(factory = viewModelFactory {
        initializer { TvDetailViewModel(movieId, ServiceLocator.movieRepository, ServiceLocator.wishlistRepository) }
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
                        Box(modifier = Modifier.fillMaxWidth().height(420.dp)) {
                            AsyncImage(
                                model = movie.backdropUrl ?: movie.posterUrl,
                                contentDescription = movie.title,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            )
                            Box(
                                modifier = Modifier.fillMaxSize().background(
                                    Brush.verticalGradient(
                                        colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.92f)),
                                        startY = 150f
                                    )
                                )
                            )
                            Column(modifier = Modifier.align(Alignment.BottomStart).padding(48.dp).widthIn(max = 700.dp)) {
                                Text(movie.title, style = MaterialTheme.typography.displaySmall, color = Color.White)
                                Spacer(Modifier.height(8.dp))
                                val meta = listOfNotNull(
                                    movie.releaseYear?.toString(),
                                    movie.rating,
                                    if (movie.isSeries) "${movie.seasonCount ?: movie.episodesBySeason.size} Season(s)" else null
                                ).joinToString("  •  ")
                                if (meta.isNotBlank()) {
                                    Text(meta, color = SkMuted, style = MaterialTheme.typography.bodyMedium)
                                }
                                movie.description?.let {
                                    Spacer(Modifier.height(10.dp))
                                    Text(it, color = Color.White.copy(alpha = 0.85f), maxLines = 3, style = MaterialTheme.typography.bodyLarge)
                                }
                                Spacer(Modifier.height(18.dp))
                                Row {
                                    Button(onClick = { onPlay(movie.id, -1) }) {
                                        Icon(Icons.Filled.PlayArrow, contentDescription = null)
                                        Spacer(Modifier.width(8.dp))
                                        Text(if (movie.isSeries) "Play S1E1" else "Play")
                                    }
                                    Spacer(Modifier.width(16.dp))
                                    IconButton(onClick = { viewModel.toggleWishlist() }) {
                                        Icon(
                                            if (state.isInWishlist) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                            contentDescription = "Wishlist",
                                            tint = if (state.isInWishlist) SkGold else Color.White
                                        )
                                    }
                                }
                            }
                        }
                    }

                    if (movie.isSeries && movie.episodes.isNotEmpty()) {
                        movie.episodesBySeason.forEach { (season, episodes) ->
                            item {
                                Text(
                                    "Season $season",
                                    style = MaterialTheme.typography.titleMedium,
                                    modifier = Modifier.padding(start = 48.dp, top = 16.dp, bottom = 8.dp)
                                )
                            }
                            items(episodes) { episode ->
                                val globalIndex = movie.episodes.indexOf(episode)
                                TvEpisodeRow(episode = episode, onClick = { onPlay(movie.id, globalIndex) })
                            }
                        }
                    }

                    item { Spacer(Modifier.height(32.dp)) }
                }
            }
        }
    }
}

@Composable
private fun TvEpisodeRow(episode: Episode, onClick: () -> Unit) {
    var isFocused by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 48.dp, vertical = 6.dp)
            .border(
                width = if (isFocused) 2.dp else 0.dp,
                color = if (isFocused) SkGold else Color.Transparent,
                shape = RoundedCornerShape(8.dp)
            )
            .background(if (isFocused) SkBg3 else Color.Transparent, RoundedCornerShape(8.dp))
            .onFocusChanged { isFocused = it.isFocused }
            .focusable()
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        AsyncImage(
            model = episode.thumbnailUrl,
            contentDescription = episode.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .width(160.dp)
                .height(90.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(SkBg3)
        )
        Spacer(Modifier.width(16.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                "Episode ${episode.episodeNumber ?: ""}${if (!episode.title.isNullOrBlank()) " · ${episode.title}" else ""}",
                style = MaterialTheme.typography.titleMedium,
                color = if (isFocused) SkGold else MaterialTheme.colorScheme.onSurface,
                maxLines = 1
            )
            episode.description?.let {
                Spacer(Modifier.height(4.dp))
                Text(it, style = MaterialTheme.typography.bodyMedium, color = SkMuted, maxLines = 2)
            }
        }
    }
}
