package com.skflip.core.model

data class Episode(
    val season: Int = 1,
    val episodeNumber: Int? = null,
    val title: String? = null,
    val description: String? = null,
    val thumbnailUrl: String? = null,
    val videoUrl: String? = null,
    val hlsUrl: String? = null,
    val duration: Int? = null,
    val airDate: String? = null
) {
    /** Prefer HLS if the admin set one, otherwise fall back to the direct file URL. */
    val playableUrl: String?
        get() = hlsUrl?.takeIf { it.isNotBlank() } ?: videoUrl?.takeIf { it.isNotBlank() }
}
