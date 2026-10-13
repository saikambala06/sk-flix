package com.skflip.mobile.ui.screens.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.skflip.core.model.Movie
import com.skflip.core.network.ServiceLocator
import com.skflip.core.repository.MovieRepository
import com.skflip.core.repository.WishlistRepository
import com.skflip.core.util.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DetailUiState(
    val isLoading: Boolean = true,
    val movie: Movie? = null,
    val isInWishlist: Boolean = false,
    val isTogglingWishlist: Boolean = false,
    val error: String? = null
)

class DetailViewModel(
    private val movieId: String,
    private val movieRepository: MovieRepository,
    private val wishlistRepository: WishlistRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(DetailUiState())
    val uiState: StateFlow<DetailUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            when (val result = movieRepository.getMovieById(movieId)) {
                is ApiResult.Success -> _uiState.update { it.copy(isLoading = false, movie = result.data) }
                is ApiResult.Error -> _uiState.update { it.copy(isLoading = false, error = result.message) }
            }

            if (ServiceLocator.sessionManager.isLoggedIn.value) {
                when (val wishlist = wishlistRepository.getWishlist()) {
                    is ApiResult.Success -> _uiState.update {
                        it.copy(isInWishlist = movieId in wishlist.data.movieIds)
                    }
                    is ApiResult.Error -> Unit // non-fatal, leave wishlist state as-is
                }
            }
        }
    }

    fun toggleWishlist() {
        if (!ServiceLocator.sessionManager.isLoggedIn.value) return
        viewModelScope.launch {
            _uiState.update { it.copy(isTogglingWishlist = true) }
            when (val result = wishlistRepository.toggle(movieId)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(isTogglingWishlist = false, isInWishlist = result.data.added)
                }
                is ApiResult.Error -> _uiState.update { it.copy(isTogglingWishlist = false) }
            }
        }
    }
}
