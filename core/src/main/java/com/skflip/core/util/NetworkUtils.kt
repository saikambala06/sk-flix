package com.skflip.core.util

import com.google.gson.Gson
import retrofit2.Response

private data class ErrorBody(val error: String? = null)
private val gson = Gson()

/**
 * Runs a suspending Retrofit call and converts it into an [ApiResult],
 * decoding the backend's `{ "error": "message" }` shape on failure.
 */
suspend fun <T> safeApiCall(block: suspend () -> Response<T>): ApiResult<T> {
    return try {
        val response = block()
        val body = response.body()
        if (response.isSuccessful && body != null) {
            ApiResult.Success(body)
        } else {
            ApiResult.Error(extractError(response), response.code())
        }
    } catch (e: Exception) {
        ApiResult.Error(e.message ?: "Network error. Check your connection and try again.")
    }
}

private fun <T> extractError(response: Response<T>): String {
    return try {
        val raw = response.errorBody()?.string()
        if (!raw.isNullOrBlank()) {
            gson.fromJson(raw, ErrorBody::class.java)?.error ?: "Request failed (${response.code()})"
        } else {
            "Request failed (${response.code()})"
        }
    } catch (e: Exception) {
        "Request failed (${response.code()})"
    }
}
