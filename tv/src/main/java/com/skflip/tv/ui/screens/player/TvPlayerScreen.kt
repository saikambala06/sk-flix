package com.skflip.tv.ui.screens.player

import android.view.ViewGroup
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.compose.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Button
import androidx.tv.material3.CircularProgressIndicator
import androidx.tv.material3.Text
import com.skflip.core.network.ServiceLocator

@Composable
fun TvPlayerScreen(
    movieId: String,
    initialEpisodeIndex: Int
) {
    val viewModel: TvPlayerViewModel = viewModel(factory = viewModelFactory {
        initializer { TvPlayerViewModel(movieId, initialEpisodeIndex, ServiceLocator.movieRepository) }
    })
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    val exoPlayer = remember { ExoPlayer.Builder(context).build() }
    DisposableEffect(Unit) {
        onDispose { exoPlayer.release() }
    }

    LaunchedEffect(state.playableUrl) {
        val url = state.playableUrl
        if (!url.isNullOrBlank()) {
            exoPlayer.setMediaItem(MediaItem.fromUri(url))
            exoPlayer.prepare()
            exoPlayer.playWhenReady = true
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null -> Text(
                state.error ?: "Playback error",
                color = androidx.tv.material3.MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(24.dp)
            )
            state.playableUrl == null -> Text(
                "No playable source set for this title yet.",
                color = Color.White,
                modifier = Modifier.align(Alignment.Center).padding(24.dp)
            )
            else -> {
                // PlayerView's built-in controller already responds to D-pad / media remote keys.
                AndroidView(
                    factory = {
                        PlayerView(it).apply {
                            player = exoPlayer
                            layoutParams = ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            )
                            useController = true
                            requestFocus()
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )

                if (state.hasNextEpisode) {
                    Button(
                        onClick = { viewModel.playNextEpisode() },
                        modifier = Modifier.align(Alignment.BottomEnd).padding(32.dp)
                    ) {
                        Text("Next Episode")
                    }
                }
            }
        }
    }
}
