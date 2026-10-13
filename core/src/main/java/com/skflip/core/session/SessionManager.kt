package com.skflip.core.session

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.gson.Gson
import com.skflip.core.model.AuthResponse
import com.skflip.core.model.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first

private val Context.sessionDataStore by preferencesDataStore(name = "skflip_session")

/**
 * Holds the current auth token + user in memory (read synchronously by [AuthInterceptor])
 * and mirrors it to DataStore so the session survives app restarts.
 */
class SessionManager(private val context: Context) {

    companion object {
        private val TOKEN_KEY = stringPreferencesKey("token")
        private val USER_KEY = stringPreferencesKey("user_json")
    }

    private val gson = Gson()

    @Volatile var token: String? = null
        private set

    @Volatile var currentUser: User? = null
        private set

    private val _isLoggedIn = MutableStateFlow(false)
    val isLoggedIn: StateFlow<Boolean> = _isLoggedIn

    /** Call once on app startup to restore a previous session. */
    suspend fun restore() {
        val prefs = context.sessionDataStore.data.first()
        token = prefs[TOKEN_KEY]
        currentUser = prefs[USER_KEY]?.let {
            runCatching { gson.fromJson(it, User::class.java) }.getOrNull()
        }
        _isLoggedIn.value = !token.isNullOrBlank()
    }

    suspend fun saveSession(auth: AuthResponse) {
        token = auth.token
        currentUser = auth.user
        context.sessionDataStore.edit {
            it[TOKEN_KEY] = auth.token
            it[USER_KEY] = gson.toJson(auth.user)
        }
        _isLoggedIn.value = true
    }

    suspend fun clearSession() {
        token = null
        currentUser = null
        context.sessionDataStore.edit { it.clear() }
        _isLoggedIn.value = false
    }
}
