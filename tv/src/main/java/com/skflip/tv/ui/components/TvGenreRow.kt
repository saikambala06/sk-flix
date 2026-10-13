package com.skflip.tv.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.skflip.core.model.Movie

@Composable
fun TvGenreRow(
    title: String,
    movies: List<Movie>,
    onMovieClick: (Movie) -> Unit
) {
    if (movies.isEmpty()) return
    Column(modifier = Modifier.padding(vertical = 10.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(start = 48.dp, bottom = 12.dp)
        )
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(horizontal = 48.dp)
        ) {
            items(movies, key = { it.id }) { movie ->
                TvMovieCard(movie = movie, onClick = { onMovieClick(movie) })
            }
        }
    }
}
