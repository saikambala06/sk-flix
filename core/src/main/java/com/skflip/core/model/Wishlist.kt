package com.skflip.core.model

data class WishlistResponse(
    val movieIds: List<String> = emptyList(),
    val offerClaimed: Boolean = false
)

data class ToggleWishlistResponse(
    val movieIds: List<String> = emptyList(),
    val added: Boolean = false
)

data class UpdateWishlistRequest(val movieIds: List<String>)

data class ClaimResponse(val offerClaimed: Boolean = false)
