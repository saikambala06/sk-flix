package com.skflip.core.model

import com.google.gson.annotations.SerializedName

data class User(
    @SerializedName("_id") val id: String = "",
    val name: String = "",
    val email: String = "",
    val role: String = "user" // "user" | "admin"
) {
    val isAdmin: Boolean get() = role == "admin"
}

data class AuthResponse(
    val token: String = "",
    val user: User = User()
)

data class LoginRequest(val email: String, val password: String)
data class SignupRequest(val name: String, val email: String, val password: String)
