package com.skflip.mobile.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.skflip.core.model.Movie
import com.skflip.mobile.ui.theme.SkSurface

@Composable
fun MovieCard(
    movie: Movie,
    onClick: () -> Unit,
    cardWidth: Dp = 120.dp
) {
    Column(modifier = Modifier.width(cardWidth)) {
        AsyncImage(
            model = movie.posterUrl,
            contentDescription = movie.title,
            contentScale = ContentScale.Cover,
            modifier = Modifier
                .width(cardWidth)
                .aspectRatio(2f / 3f)
                .clip(RoundedCornerShape(10.dp))
                .background(SkSurface)
                .clickable(onClick = onClick)
        )
        Text(
            text = movie.title,
            style = MaterialTheme.typography.labelLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(cardWidth)
        )
    }
}
