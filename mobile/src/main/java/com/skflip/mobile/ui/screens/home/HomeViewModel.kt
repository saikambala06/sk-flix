package com.skflip.mobile.ui.screens.home

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

data class HomeUiState(
    val isLoading: Boolean = true,
    val featured: Movie? = null,
    val originals: List<Movie> = emptyList(),
    val series: List<Movie> = emptyList(),
    val films: List<Movie> = emptyList(),
    val genreRows: List<Pair<String, List<Movie>>> = emptyList(),
    val error: String? = null
)

class HomeViewModel(private val movieRepository: MovieRepository) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        loadContent()
    }

    fun loadContent() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            when (val result = movieRepository.getMovies(limit = 200)) {
                is ApiResult.Success -> {
                    val movies = result.data
                    val genreRows = movies
                        .flatMap { it.genres }
                        .distinct()
                        .take(8)
                        .map { genre -> genre to movies.filter { genre in it.genres } }
                        .filter { it.second.isNotEmpty() }

                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            featured = movies.firstOrNull(),
                            originals = movies.filter { m -> m.type == "original" },
                            series = movies.filter { m -> m.type == "series" },
                            films = movies.filter { m -> m.type == "movie" },
                            genreRows = genreRows
                        )
                    }
                }
                is ApiResult.Error -> _uiState.update { it.copy(isLoading = false, error = result.message) }
            }
        }
    }
}
