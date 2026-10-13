package com.skflip.tv.ui.screens.login

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.compose.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import androidx.tv.material3.Button
import androidx.tv.material3.CircularProgressIndicator
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import androidx.tv.material3.TextButton
import com.skflip.core.network.ServiceLocator
import com.skflip.core.util.ApiResult
import com.skflip.tv.ui.theme.SkGold
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private data class TvLoginUiState(
    val isSignupMode: Boolean = false,
    val isLoading: Boolean = false,
    val error: String? = null,
    val success: Boolean = false
)

private class TvLoginViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(TvLoginUiState())
    val uiState: StateFlow<TvLoginUiState> = _uiState.asStateFlow()

    fun toggleMode() = _uiState.update { it.copy(isSignupMode = !it.isSignupMode, error = null) }

    fun submit(name: String, email: String, password: String) {
        if (email.isBlank() || password.isBlank() || (_uiState.value.isSignupMode && name.isBlank())) {
            _uiState.update { it.copy(error = "Fill in all fields.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val result = if (_uiState.value.isSignupMode) {
                ServiceLocator.authRepository.signup(name.trim(), email.trim(), password)
            } else {
                ServiceLocator.authRepository.login(email.trim(), password)
            }
            when (result) {
                is ApiResult.Success -> _uiState.update { it.copy(isLoading = false, success = true) }
                is ApiResult.Error -> _uiState.update { it.copy(isLoading = false, error = result.message) }
            }
        }
    }
}

@Composable
fun TvLoginScreen(
    onDone: () -> Unit,
    onSkip: () -> Unit
) {
    val viewModel: TvLoginViewModel = viewModel(factory = viewModelFactory {
        initializer { TvLoginViewModel() }
    })
    val state by viewModel.uiState.collectAsState()

    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    LaunchedEffect(state.success) {
        if (state.success) onDone()
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Surface(modifier = Modifier.widthIn(max = 480.dp)) {
            Column(
                modifier = Modifier.padding(40.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("SkFlip", style = MaterialTheme.typography.displaySmall, color = SkGold)
                Spacer(Modifier.height(8.dp))
                Text(if (state.isSignupMode) "Create an account" else "Sign in to sync your wishlist")
                Spacer(Modifier.height(28.dp))

                if (state.isSignupMode) {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(12.dp))
                }
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth()
                )

                state.error?.let {
                    Spacer(Modifier.height(12.dp))
                    Text(it, color = MaterialTheme.colorScheme.error)
                }

                Spacer(Modifier.height(24.dp))
                Button(
                    onClick = { viewModel.submit(name, email, password) },
                    enabled = !state.isLoading,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (state.isLoading) {
                        CircularProgressIndicator()
                    } else {
                        Text(if (state.isSignupMode) "Sign Up" else "Sign In")
                    }
                }
                Spacer(Modifier.height(12.dp))
                TextButton(onClick = { viewModel.toggleMode() }) {
                    Text(if (state.isSignupMode) "Already have an account? Sign in" else "New here? Create an account")
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = onSkip, modifier = Modifier.fillMaxWidth()) {
                    Text("Skip for now")
                }
            }
        }
    }
}
