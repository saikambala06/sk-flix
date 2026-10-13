package com.skflip.tv.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.skflip.core.model.Movie
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.skflip.tv.ui.theme.SkGold
import com.skflip.tv.ui.theme.SkSurface

@Composable
fun TvMovieCard(
    movie: Movie,
    onClick: () -> Unit,
    cardWidth: Dp = 160.dp,
    modifier: Modifier = Modifier
) {
    var isFocused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (isFocused) 1.08f else 1f, label = "card-scale")
    val interactionSource = remember { MutableInteractionSource() }

    Column(modifier = modifier.width(cardWidth)) {
        AsyncImage(
            model = movie.posterUrl,
            contentDescription = movie.title,
            contentScale = ContentScale.Cover,
            modifier = Modifier
                .width(cardWidth)
                .aspectRatio(2f / 3f)
                .scale(scale)
                .clip(RoundedCornerShape(8.dp))
                .background(SkSurface)
                .border(
                    width = if (isFocused) 3.dp else 0.dp,
                    color = if (isFocused) SkGold else Color.Transparent,
                    shape = RoundedCornerShape(8.dp)
                )
                .onFocusChanged { isFocused = it.isFocused }
                .focusable(interactionSource = interactionSource)
                .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
        )
        Text(
            text = movie.title,
            style = MaterialTheme.typography.bodyMedium,
            color = if (isFocused) SkGold else MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(cardWidth)
        )
    }
}
