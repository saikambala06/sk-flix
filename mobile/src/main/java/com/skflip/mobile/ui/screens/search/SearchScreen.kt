package com.skflip.mobile.ui.screens.search

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.compose.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import com.skflip.core.model.Movie
import com.skflip.core.network.ServiceLocator
import com.skflip.mobile.ui.components.MovieCard
import com.skflip.mobile.ui.theme.SkMuted

@Composable
fun SearchScreen(onMovieClick: (Movie) -> Unit) {
    val viewModel: SearchViewModel = viewModel(factory = viewModelFactory {
        initializer { SearchViewModel(ServiceLocator.movieRepository) }
    })
    val state by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize().padding(top = 8.dp)) {
        OutlinedTextField(
            value = state.query,
            onValueChange = { viewModel.onQueryChange(it) },
            placeholder = { Text("Search titles or genres") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
        )
        Spacer(Modifier.height(16.dp))

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.query.isBlank() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Search for movies and shows", color = SkMuted)
            }
            state.results.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No results for \"${state.query}\"", color = SkMuted)
            }
            else -> LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                items(state.results, key = { it.id }) { movie ->
                    MovieCard(movie = movie, onClick = { onMovieClick(movie) }, cardWidth = 110.dp)
                }
            }
        }
    }
}
