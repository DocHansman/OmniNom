package com.omninom.utils

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import java.util.*

object JwtConfig {
    private val secret = System.getenv("JWT_SECRET") ?: "default_secret_key_which_must_be_changed"
    private val algorithm = Algorithm.HMAC256(secret)

    fun generateAccessToken(userId: UUID): String {
        return JWT.create()
            .withClaim("user_id", userId.toString())
            .withClaim("type", "access")
            .withExpiresAt(Date(System.currentTimeMillis() + 15 * 60 * 1000)) // 15 minutes
            .sign(algorithm)
    }

    fun generateRefreshToken(userId: UUID): String {
        return JWT.create()
            .withClaim("user_id", userId.toString())
            .withClaim("type", "refresh")
            .withExpiresAt(Date(System.currentTimeMillis() + 30L * 24 * 60 * 60 * 1000)) // 30 days
            .sign(algorithm)
    }

    fun verifyRefreshToken(token: String): UUID? {
        return try {
            val verifier = JWT.require(algorithm).build()
            val decoded = verifier.verify(token)
            val type = decoded.getClaim("type").asString()
            val userId = decoded.getClaim("user_id").asString()
            if (type == "refresh" && userId != null) {
                UUID.fromString(userId)
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }
}
