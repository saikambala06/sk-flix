package com.skflip.core.network

import android.content.Context
import com.skflip.core.repository.AuthRepository
import com.skflip.core.repository.MovieRepository
import com.skflip.core.repository.WishlistRepository
import com.skflip.core.session.SessionManager
import com.skflip.core.util.Constants
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Simple singleton service locator. Call [init] once from your Application class
 * before any screen tries to use a repository.
 */
object ServiceLocator {

    lateinit var sessionManager: SessionManager
        private set
    lateinit var apiService: ApiService
        private set
    lateinit var authRepository: AuthRepository
        private set
    lateinit var movieRepository: MovieRepository
        private set
    lateinit var wishlistRepository: WishlistRepository
        private set

    private var initialized = false

    fun init(context: Context) {
        if (initialized) return

        val appContext = context.applicationContext
        sessionManager = SessionManager(appContext)

        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        val okHttpClient = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(sessionManager))
            .addInterceptor(logging)
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl(Constants.BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        apiService = retrofit.create(ApiService::class.java)

        authRepository = AuthRepository(apiService, sessionManager)
        movieRepository = MovieRepository(apiService)
        wishlistRepository = WishlistRepository(apiService)

        initialized = true
    }
}
