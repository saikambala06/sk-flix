package com.skflip.tv.ui.screens.player

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

data class TvPlayerUiState(
    val isLoading: Boolean = true,
    val movie: Movie? = null,
    val currentEpisodeIndex: Int = -1,
    val error: String? = null
) {
    val playableUrl: String?
        get() {
            val m = movie ?: return null
            return if (currentEpisodeIndex in m.episodes.indices) {
                m.episodes[currentEpisodeIndex].playableUrl
            } else {
                m.playableUrl
            }
        }

    val hasNextEpisode: Boolean
        get() {
            val m = movie ?: return false
            return currentEpisodeIndex in 0 until m.episodes.size - 1
        }
}

class TvPlayerViewModel(
    private val movieId: String,
    initialEpisodeIndex: Int,
    private val movieRepository: MovieRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(TvPlayerUiState(currentEpisodeIndex = initialEpisodeIndex))
    val uiState: StateFlow<TvPlayerUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            when (val result = movieRepository.getMovieById(movieId)) {
                is ApiResult.Success -> {
                    val movie = result.data
                    val startIndex = if (initialEpisodeIndex < 0 && movie.episodes.isNotEmpty()) 0 else initialEpisodeIndex
                    _uiState.update { it.copy(isLoading = false, movie = movie, currentEpisodeIndex = startIndex) }
                }
                is ApiResult.Error -> _uiState.update { it.copy(isLoading = false, error = result.message) }
            }
        }
    }

    fun playNextEpisode() {
        _uiState.update { if (it.hasNextEpisode) it.copy(currentEpisodeIndex = it.currentEpisodeIndex + 1) else it }
    }
}
