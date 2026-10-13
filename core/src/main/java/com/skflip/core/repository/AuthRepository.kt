package com.skflip.core.repository

import com.skflip.core.model.AuthResponse
import com.skflip.core.model.LoginRequest
import com.skflip.core.model.SignupRequest
import com.skflip.core.model.User
import com.skflip.core.network.ApiService
import com.skflip.core.session.SessionManager
import com.skflip.core.util.ApiResult
import com.skflip.core.util.safeApiCall

class AuthRepository(
    private val api: ApiService,
    private val sessionManager: SessionManager
) {
    suspend fun login(email: String, password: String): ApiResult<User> =
        handleAuth(safeApiCall { api.login(LoginRequest(email, password)) })

    suspend fun signup(name: String, email: String, password: String): ApiResult<User> =
        handleAuth(safeApiCall { api.signup(SignupRequest(name, email, password)) })

    private suspend fun handleAuth(result: ApiResult<AuthResponse>): ApiResult<User> {
        return when (result) {
            is ApiResult.Success -> {
                sessionManager.saveSession(result.data)
                ApiResult.Success(result.data.user)
            }
            is ApiResult.Error -> ApiResult.Error(result.message, result.code)
        }
    }

    suspend fun logout() {
        sessionManager.clearSession()
    }

    val isLoggedIn get() = sessionManager.isLoggedIn
    val currentUser: User? get() = sessionManager.currentUser
}
