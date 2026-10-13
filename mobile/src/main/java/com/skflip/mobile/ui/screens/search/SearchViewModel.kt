package com.skflip.mobile.ui.screens.search

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

data class SearchUiState(
    val query: String = "",
    val isLoading: Boolean = true,
    val allMovies: List<Movie> = emptyList(),
    val results: List<Movie> = emptyList(),
    val error: String? = null
)

class SearchViewModel(private val movieRepository: MovieRepository) : ViewModel() {

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            when (val result = movieRepository.getMovies(limit = 200)) {
                is ApiResult.Success -> _uiState.update { it.copy(isLoading = false, allMovies = result.data) }
                is ApiResult.Error -> _uiState.update { it.copy(isLoading = false, error = result.message) }
            }
        }
    }

    fun onQueryChange(query: String) {
        _uiState.update {
            val results = if (query.isBlank()) emptyList() else it.allMovies.filter { m ->
                m.title.contains(query, ignoreCase = true) ||
                    m.genres.any { g -> g.contains(query, ignoreCase = true) }
            }
            it.copy(query = query, results = results)
        }
    }
}
