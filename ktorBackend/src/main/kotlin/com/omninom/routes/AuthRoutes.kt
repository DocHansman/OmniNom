package com.omninom.routes

import com.omninom.models.Users
import com.omninom.models.InviteTokens
import com.omninom.utils.JwtConfig
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalDateTime
import java.util.*

private val googleHttpClient = HttpClient(CIO)

@Serializable
data class GoogleUserInfo(val googleId: String, val email: String, val name: String?)

@Serializable
data class LoginRequest(val user_id: String, val auth_key_hash: String)

@Serializable
data class LoginResponse(val access_token: String)

@Serializable
data class InviteResponse(val token: String)

@Serializable
data class InviteVerifyResponse(val server_url: String, val user_id: String)

@Serializable
data class GoogleCallbackRequest(val id_token: String)

@Serializable
data class GoogleCallbackResponse(
    val access_token: String,
    val master_key_hex: String,
    val user_id: String
)

fun Route.authRoutes(webSocketTracker: WebSocketTracker) {
    
    // Google OAuth Callback Endpoint
    post("/auth/google/callback") {
        try {
            val req = call.receive<GoogleCallbackRequest>()
            val userInfo = verifyGoogleToken(req.id_token)
            if (userInfo == null) {
                call.respond(HttpStatusCode.Unauthorized, "Ungültiges Token")
                return@post
            }

            // Check if email is in GOOGLE_ALLOWED_EMAILS
            val allowedEmailsStr = System.getenv("GOOGLE_ALLOWED_EMAILS") ?: ""
            val allowedEmails = allowedEmailsStr.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            if (!allowedEmails.contains(userInfo.email)) {
                call.respond(HttpStatusCode.Forbidden, "Zugang nicht erlaubt")
                return@post
            }

            // Check if user exists
            val existingUser = transaction {
                Users.selectAll().where { Users.googleId eq userInfo.googleId }.firstOrNull()
            }

            val (userId, encryptedKey) = if (existingUser == null) {
                // Create user
                transaction {
                    val newId = UUID.randomUUID()
                    val secureRandom = java.security.SecureRandom()
                    val keyBytes = ByteArray(32)
                    secureRandom.nextBytes(keyBytes)
                    val masterKeyHex = keyBytes.joinToString("") { "%02x".format(it) }
                    val encrypted = com.omninom.utils.MasterKeyEncryption.encryptMasterKey(masterKeyHex)

                    Users.insert {
                        it[id] = newId
                        it[authKeyHash] = ""
                        it[googleId] = userInfo.googleId
                        it[email] = userInfo.email
                        it[encryptedMasterKey] = encrypted
                    }
                    Pair(newId, encrypted)
                }
            } else {
                Pair(
                    existingUser[Users.id],
                    existingUser[Users.encryptedMasterKey] ?: throw IllegalStateException("Nutzer hat keinen Master-Schlüssel")
                )
            }

            // Decrypt master key
            val masterKeyHex = com.omninom.utils.MasterKeyEncryption.decryptMasterKey(encryptedKey)

            // Generate JWT tokens
            val accessToken = JwtConfig.generateAccessToken(userId)
            val refreshToken = JwtConfig.generateRefreshToken(userId)

            // Place HttpOnly JWT cookies
            call.response.cookies.append(
                name = "refresh_token",
                value = refreshToken,
                httpOnly = true,
                secure = false, // set to true if running over HTTPS behind reverse proxy
                path = "/",
                maxAge = 30L * 24 * 60 * 60 // 30 days
            )

            call.response.cookies.append(
                name = "access_token",
                value = accessToken,
                httpOnly = true,
                secure = false,
                path = "/",
                maxAge = 15 * 60 // 15 minutes
            )

            call.respond(GoogleCallbackResponse(
                access_token = accessToken,
                master_key_hex = masterKeyHex,
                user_id = userId.toString()
            ))

        } catch (e: Exception) {
            call.respond(HttpStatusCode.BadRequest, "Fehler beim Google Login: ${e.message}")
        }
    }

    // Login Endpoint
    post("/auth/login") {
        try {
            val req = call.receive<LoginRequest>()
            val userId = try {
                UUID.fromString(req.user_id)
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, "Invalid user_id format")
                return@post
            }

            val user = transaction {
                Users.selectAll().where { Users.id eq userId }.firstOrNull()
            }

            if (user != null && user[Users.authKeyHash] == req.auth_key_hash) {
                val accessToken = JwtConfig.generateAccessToken(userId)
                val refreshToken = JwtConfig.generateRefreshToken(userId)

                // Place HttpOnly JWT cookies
                call.response.cookies.append(
                    name = "refresh_token",
                    value = refreshToken,
                    httpOnly = true,
                    secure = false, // set to true if running over HTTPS behind reverse proxy
                    path = "/",
                    maxAge = 30L * 24 * 60 * 60 // 30 days
                )

                call.response.cookies.append(
                    name = "access_token",
                    value = accessToken,
                    httpOnly = true,
                    secure = false,
                    path = "/",
                    maxAge = 15 * 60 // 15 minutes
                )

                call.respond(LoginResponse(accessToken))
            } else {
                call.respond(HttpStatusCode.Unauthorized, "Ungültige Anmeldedaten")
            }
        } catch (e: Exception) {
            call.respond(HttpStatusCode.BadRequest, "Parsing-Fehler: ${e.message}")
        }
    }

    // Token Refresh Endpoint
    post("/auth/refresh") {
        val refreshToken = call.request.cookies["refresh_token"]
        if (refreshToken == null) {
            call.respond(HttpStatusCode.Unauthorized, "Fehlendes Refresh-Token")
            return@post
        }

        val userId = JwtConfig.verifyRefreshToken(refreshToken)
        if (userId != null) {
            val accessToken = JwtConfig.generateAccessToken(userId)

            call.response.cookies.append(
                name = "access_token",
                value = accessToken,
                httpOnly = true,
                secure = false,
                path = "/",
                maxAge = 15 * 60
            )

            call.respond(LoginResponse(accessToken))
        } else {
            call.respond(HttpStatusCode.Unauthorized, "Ungültiges oder abgelaufenes Refresh-Token")
        }
    }

    // Public Invite Verification Endpoint (Device 2 calls this to obtain Server URL + User ID)
    get("/auth/invite/{token}") {
        val tokenStr = call.parameters["token"]
        if (tokenStr == null) {
            call.respond(HttpStatusCode.BadRequest, "Fehlender Einladungstoken")
            return@get
        }

        val tokenUuid = try {
            UUID.fromString(tokenStr)
        } catch (e: Exception) {
            call.respond(HttpStatusCode.BadRequest, "Ungültiges Token-Format")
            return@get
        }

        val invite = transaction {
            InviteTokens.selectAll().where { InviteTokens.token eq tokenUuid }.firstOrNull()
        }

        if (invite != null) {
            val expiresAt = invite[InviteTokens.expiresAt]
            if (expiresAt.isAfter(LocalDateTime.now())) {
                val inviteUserId = invite[InviteTokens.userId]
                val serverUrl = System.getenv("SERVER_URL") ?: "http://localhost"
                call.respond(InviteVerifyResponse(serverUrl, inviteUserId.toString()))
            } else {
                call.respond(HttpStatusCode.Gone, "Der Einladungslink ist abgelaufen (Gültigkeit: 5 min)")
            }
        } else {
            call.respond(HttpStatusCode.NotFound, "Einladungstoken nicht gefunden")
        }
    }

    // Authenticated Invite Creation Endpoint (Device 1 calls this)
    authenticate("auth-jwt") {
        post("/auth/invite") {
            val principal = call.principal<JWTPrincipal>()
            val userIdStr = principal?.payload?.getClaim("user_id")?.asString()
            if (userIdStr == null) {
                call.respond(HttpStatusCode.Unauthorized)
                return@post
            }
            val userId = UUID.fromString(userIdStr)

            val token = UUID.randomUUID()
            val expiresAt = LocalDateTime.now().plusMinutes(5)

            transaction {
                InviteTokens.insert {
                    it[id] = UUID.randomUUID()
                    it[this.token] = token
                    it[this.userId] = userId
                    it[this.expiresAt] = expiresAt
                }
            }
            call.respond(InviteResponse(token.toString()))
        }
    }
}

suspend fun verifyGoogleToken(idToken: String): GoogleUserInfo? {
    return try {
        val url = "https://oauth2.googleapis.com/tokeninfo?id_token=$idToken"
        val response = googleHttpClient.get(url)
        if (response.status != HttpStatusCode.OK) {
            return null
        }
        val responseText = response.bodyAsText()
        val json = Json.parseToJsonElement(responseText).jsonObject

        val aud = json["aud"]?.jsonPrimitive?.content
        val emailVerified = json["email_verified"]?.jsonPrimitive?.content
        val googleId = json["sub"]?.jsonPrimitive?.content
        val email = json["email"]?.jsonPrimitive?.content
        val name = json["name"]?.jsonPrimitive?.content

        val googleClientId = System.getenv("GOOGLE_CLIENT_ID")
        if (googleClientId.isNullOrBlank() || aud != googleClientId) {
            return null
        }

        if (emailVerified != "true") {
            return null
        }

        if (googleId != null && email != null) {
            GoogleUserInfo(googleId = googleId, email = email, name = name)
        } else {
            null
        }
    } catch (e: Exception) {
        null
    }
}

