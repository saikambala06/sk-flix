package com.skflip.mobile.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.skflip.core.model.Movie

@Composable
fun GenreRow(
    title: String,
    movies: List<Movie>,
    onMovieClick: (Movie) -> Unit
) {
    if (movies.isEmpty()) return
    Column(modifier = Modifier.padding(vertical = 8.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(start = 16.dp, bottom = 10.dp)
        )
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(horizontal = 16.dp)
        ) {
            items(movies, key = { it.id }) { movie ->
                MovieCard(movie = movie, onClick = { onMovieClick(movie) })
            }
        }
    }
}
