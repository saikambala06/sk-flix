package com.skflip.core.model

import com.google.gson.annotations.SerializedName

data class Movie(
    @SerializedName("_id") val id: String = "",
    val title: String = "",
    val type: String = "movie", // "movie" | "series" | "original"
    val releaseYear: Int? = null,
    val rating: String? = null,
    val genres: List<String> = emptyList(),
    val description: String? = null,
    val posterUrl: String? = null,
    val backdropUrl: String? = null,
    val hlsUrl: String? = null,
    val videoUrl: String? = null,
    val duration: Int? = null,
    val episodes: List<Episode> = emptyList(),
    val episodeCount: Int? = null,
    val seasonCount: Int? = null,
    val audioLanguages: List<String> = emptyList(),
    val subtitleLanguages: List<String> = emptyList(),
    val isPublished: Boolean = true
) {
    val isSeries: Boolean get() = type == "series" || episodes.isNotEmpty()

    /** Prefer HLS if the admin set one, otherwise fall back to the direct file URL. */
    val playableUrl: String?
        get() = hlsUrl?.takeIf { it.isNotBlank() } ?: videoUrl?.takeIf { it.isNotBlank() }

    /** Episodes grouped by season number, sorted, for the episode-picker UI. */
    val episodesBySeason: Map<Int, List<Episode>>
        get() = episodes.groupBy { it.season }.toSortedMap()
}

data class MoviesResponse(val movies: List<Movie> = emptyList())
