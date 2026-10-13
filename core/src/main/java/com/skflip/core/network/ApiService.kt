package com.skflip.core.network

import com.skflip.core.model.*
import retrofit2.Response
import retrofit2.http.*

interface ApiService {

    // ---- Auth ----
    @POST("api/auth/signup")
    suspend fun signup(@Body request: SignupRequest): Response<AuthResponse>

    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>

    // ---- Content (public) ----
    @GET("api/movies")
    suspend fun getMovies(
        @Query("type") type: String? = null,
        @Query("limit") limit: Int = 100
    ): Response<MoviesResponse>

    @GET("api/movies/{id}")
    suspend fun getMovieById(@Path("id") id: String): Response<Movie>

    // ---- Wishlist (authenticated) ----
    @GET("api/wishlist")
    suspend fun getWishlist(): Response<WishlistResponse>

    @POST("api/wishlist/toggle/{movieId}")
    suspend fun toggleWishlist(@Path("movieId") movieId: String): Response<ToggleWishlistResponse>

    @PUT("api/wishlist")
    suspend fun updateWishlist(@Body request: UpdateWishlistRequest): Response<WishlistResponse>

    @POST("api/wishlist/claim")
    suspend fun claimOffer(): Response<ClaimResponse>
}
