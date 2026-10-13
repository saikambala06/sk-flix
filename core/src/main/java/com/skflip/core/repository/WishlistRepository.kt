package com.skflip.core.repository

import com.skflip.core.model.ClaimResponse
import com.skflip.core.model.ToggleWishlistResponse
import com.skflip.core.model.UpdateWishlistRequest
import com.skflip.core.model.WishlistResponse
import com.skflip.core.network.ApiService
import com.skflip.core.util.ApiResult
import com.skflip.core.util.safeApiCall

class WishlistRepository(private val api: ApiService) {

    suspend fun getWishlist(): ApiResult<WishlistResponse> =
        safeApiCall { api.getWishlist() }

    suspend fun toggle(movieId: String): ApiResult<ToggleWishlistResponse> =
        safeApiCall { api.toggleWishlist(movieId) }

    suspend fun replaceAll(movieIds: List<String>): ApiResult<WishlistResponse> =
        safeApiCall { api.updateWishlist(UpdateWishlistRequest(movieIds)) }

    suspend fun claimOffer(): ApiResult<ClaimResponse> =
        safeApiCall { api.claimOffer() }
}
