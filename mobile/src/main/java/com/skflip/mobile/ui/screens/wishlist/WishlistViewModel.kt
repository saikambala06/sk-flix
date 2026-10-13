package com.skflip.mobile.ui.screens.wishlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.skflip.core.model.Movie
import com.skflip.core.repository.MovieRepository
import com.skflip.core.repository.WishlistRepository
import com.skflip.core.util.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class WishlistUiState(
    val isLoading: Boolean = true,
    val movies: List<Movie> = emptyList(),
    val error: String? = null
)

class WishlistViewModel(
    private val movieRepository: MovieRepository,
    private val wishlistRepository: WishlistRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(WishlistUiState())
    val uiState: StateFlow<WishlistUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val wishlistResult = wishlistRepository.getWishlist()
            if (wishlistResult is ApiResult.Error) {
                _uiState.update { it.copy(isLoading = false, error = wishlistResult.message) }
                return@launch
            }
            val ids = (wishlistResult as ApiResult.Success).data.movieIds.toSet()

            val moviesResult = movieRepository.getMovies(limit = 200)
            when (moviesResult) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(isLoading = false, movies = moviesResult.data.filter { m -> m.id in ids })
                }
                is ApiResult.Error -> _uiState.update { it.copy(isLoading = false, error = moviesResult.message) }
            }
        }
    }

    fun removeFromWishlist(movieId: String) {
        viewModelScope.launch {
            wishlistRepository.toggle(movieId)
            _uiState.update { it.copy(movies = it.movies.filter { m -> m.id != movieId }) }
        }
    }
}
