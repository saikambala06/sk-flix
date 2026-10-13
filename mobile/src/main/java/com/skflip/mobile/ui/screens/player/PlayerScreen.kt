package com.skflip.mobile.ui.screens.player

import android.app.Activity
import android.content.pm.ActivityInfo
import android.view.ViewGroup
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.compose.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.skflip.core.network.ServiceLocator

@Composable
fun PlayerScreen(
    movieId: String,
    initialEpisodeIndex: Int,
    onBack: () -> Unit
) {
    val viewModel: PlayerViewModel = viewModel(factory = viewModelFactory {
        initializer { PlayerViewModel(movieId, initialEpisodeIndex, ServiceLocator.movieRepository) }
    })
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val activity = context as? Activity

    // Lock landscape and go immersive while the player is on screen, restore on exit.
    DisposableEffect(Unit) {
        val originalOrientation = activity?.requestedOrientation
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        onDispose {
            activity?.requestedOrientation = originalOrientation ?: ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }

    val view = LocalView.current
    SideEffect {
        val window = activity?.window ?: return@SideEffect
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, view)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
    DisposableEffect(Unit) {
        onDispose {
            val window = activity?.window ?: return@onDispose
            WindowCompat.setDecorFitsSystemWindows(window, true)
            WindowInsetsControllerCompat(window, view).show(WindowInsetsCompat.Type.systemBars())
        }
    }

    val exoPlayer = remember {
        ExoPlayer.Builder(context).build()
    }
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
            state.error != null -> {
                Text(
                    state.error ?: "Playback error",
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp)
                )
            }
            state.playableUrl == null -> {
                Text(
                    "No playable source set for this title yet.",
                    color = Color.White,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp)
                )
            }
            else -> {
                AndroidView(
                    factory = {
                        PlayerView(it).apply {
                            player = exoPlayer
                            layoutParams = ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            )
                            useController = true
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )

                if (state.hasNextEpisode) {
                    Button(
                        onClick = { viewModel.playNextEpisode() },
                        modifier = Modifier.align(Alignment.BottomEnd).padding(24.dp)
                    ) {
                        Text("Next Episode")
                    }
                }
            }
        }
    }
}
