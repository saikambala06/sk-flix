package com.skflip.core.repository

import com.skflip.core.model.Movie
import com.skflip.core.network.ApiService
import com.skflip.core.util.ApiResult
import com.skflip.core.util.safeApiCall

class MovieRepository(private val api: ApiService) {

    /** Last successfully loaded catalog, kept around so Search/Wishlist screens
     * don't have to re-fetch everything from the network. */
    @Volatile var cachedMovies: List<Movie> = emptyList()
        private set

    suspend fun getMovies(type: String? = null, limit: Int = 200): ApiResult<List<Movie>> {
        val result = safeApiCall { api.getMovies(type, limit) }
        return when (result) {
            is ApiResult.Success -> {
                if (type == null) cachedMovies = result.data.movies
                ApiResult.Success(result.data.movies)
            }
            is ApiResult.Error -> result
        }
    }

    suspend fun getMovieById(id: String): ApiResult<Movie> {
        // Serve from cache instantly if we already have it (faster detail-screen open).
        cachedMovies.firstOrNull { it.id == id }?.let { return ApiResult.Success(it) }
        return safeApiCall { api.getMovieById(id) }
    }
}
