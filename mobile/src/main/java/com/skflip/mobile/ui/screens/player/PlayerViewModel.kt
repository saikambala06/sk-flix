package com.skflip.mobile.ui.screens.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.skflip.core.model.Movie
import com.skflip.core.repository.MovieRepository
import com.skflip.core.util.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PlayerUiState(
    val isLoading: Boolean = true,
    val movie: Movie? = null,
    val currentEpisodeIndex: Int = -1, // -1 means "play the movie itself", not an episode
    val error: String? = null
) {
    /** URL to feed to ExoPlayer for whatever is currently selected. */
    val playableUrl: String?
        get() {
            val m = movie ?: return null
            return if (currentEpisodeIndex >= 0 && currentEpisodeIndex < m.episodes.size) {
                m.episodes[currentEpisodeIndex].playableUrl
            } else {
                m.playableUrl
            }
        }

    val title: String
        get() {
            val m = movie ?: return ""
            val ep = m.episodes.getOrNull(currentEpisodeIndex)
            return if (ep != null) "${m.title} — S${ep.season}E${ep.episodeNumber ?: ""} ${ep.title.orEmpty()}".trim() else m.title
        }

    val hasNextEpisode: Boolean
        get() {
            val m = movie ?: return false
            return currentEpisodeIndex in 0 until m.episodes.size - 1
        }
}

class PlayerViewModel(
    private val movieId: String,
    initialEpisodeIndex: Int,
    private val movieRepository: MovieRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(PlayerUiState(currentEpisodeIndex = initialEpisodeIndex))
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            when (val result = movieRepository.getMovieById(movieId)) {
                is ApiResult.Success -> {
                    val movie = result.data
                    // If caller didn't specify an episode but this is a series, default to episode 0.
                    val startIndex = if (initialEpisodeIndex < 0 && movie.episodes.isNotEmpty()) 0 else initialEpisodeIndex
                    _uiState.update { it.copy(isLoading = false, movie = movie, currentEpisodeIndex = startIndex) }
                }
                is ApiResult.Error -> _uiState.update { it.copy(isLoading = false, error = result.message) }
            }
        }
    }

    fun playNextEpisode() {
        _uiState.update {
            if (it.hasNextEpisode) it.copy(currentEpisodeIndex = it.currentEpisodeIndex + 1) else it
        }
    }
}
