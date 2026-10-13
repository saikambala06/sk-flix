package com.skflip.mobile.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.skflip.core.repository.AuthRepository
import com.skflip.core.util.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AuthUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val success: Boolean = false
)

class AuthViewModel(private val authRepository: AuthRepository) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(error = "Enter your email and password.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            when (val result = authRepository.login(email.trim(), password)) {
                is ApiResult.Success -> _uiState.update { it.copy(isLoading = false, success = true) }
                is ApiResult.Error -> _uiState.update { it.copy(isLoading = false, error = result.message) }
            }
        }
    }

    fun signup(name: String, email: String, password: String) {
        if (name.isBlank() || email.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(error = "Fill in all fields.") }
            return
        }
        if (password.length < 6) {
            _uiState.update { it.copy(error = "Password must be at least 6 characters.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            when (val result = authRepository.signup(name.trim(), email.trim(), password)) {
                is ApiResult.Success -> _uiState.update { it.copy(isLoading = false, success = true) }
                is ApiResult.Error -> _uiState.update { it.copy(isLoading = false, error = result.message) }
            }
        }
    }

    fun clearError() = _uiState.update { it.copy(error = null) }
}
