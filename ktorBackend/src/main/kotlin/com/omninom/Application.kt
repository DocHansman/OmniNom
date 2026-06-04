package com.omninom

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.omninom.models.DbSettings
import com.omninom.routes.*
import io.ktor.http.*
import io.ktor.http.auth.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.calllogging.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory
import java.time.Duration
import kotlin.time.Duration.Companion.seconds

private val logger = LoggerFactory.getLogger("Application")

fun main(args: Array<String>) {
    if (args.contains("generate-qr")) {
        com.omninom.utils.generateUserMain()
        return
    }
    val port = System.getenv("PORT")?.toIntOrNull() ?: 8080
    embeddedServer(Netty, port = port, host = "0.0.0.0", module = Application::module)
        .start(wait = true)
}

fun Application.module() {
    // 1. Initialize Database
    DbSettings.init()

    // 2. Configure Content Negotiation
    install(ContentNegotiation) {
        json(Json {
            prettyPrint = true
            isLenient = true
            ignoreUnknownKeys = true
        })
    }

    // 3. Configure CORS (allow local frontend dev server to connect)
    install(CORS) {
        anyHost() // In production, we route through Nginx so CORS is handled, but this is helpful for local dev
        allowHeader(HttpHeaders.ContentType)
        allowHeader(HttpHeaders.Authorization)
        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)
        allowCredentials = true
        exposeHeader(HttpHeaders.AccessControlAllowOrigin)
    }

    // 4. Configure WebSockets
    install(WebSockets) {
        pingPeriod = 15.seconds
        timeout = 15.seconds
        maxFrameSize = Long.MAX_VALUE
        masking = false
    }

    // 5. Configure Call Logging
    install(CallLogging)

    // 6. Configure Authentication
    val jwtSecret = System.getenv("JWT_SECRET") ?: "default_secret_key_which_must_be_changed"
    install(Authentication) {
        jwt("auth-jwt") {
            realm = "omninom"
            verifier(
                JWT.require(Algorithm.HMAC256(jwtSecret))
                    .build()
            )
            validate { credential ->
                val userId = credential.payload.getClaim("user_id").asString()
                val type = credential.payload.getClaim("type").asString()
                // Only allow access tokens for API requests
                if (userId != null && type == "access") {
                    JWTPrincipal(credential.payload)
                } else {
                    null
                }
            }
            authHeader { call ->
                // Check Authorization header first
                val authHeader = call.request.parseAuthorizationHeader()
                if (authHeader != null) return@authHeader authHeader

                // Check cookies (primarily access_token cookie for Nginx photo request verification)
                val cookieToken = call.request.cookies["access_token"]
                if (cookieToken != null) {
                    return@authHeader HttpAuthHeader.Single("Bearer", cookieToken)
                }
                null
            }
        }
    }

    // Initialize Active Session WebSocket Tracker
    val webSocketTracker = WebSocketTracker()

    // 7. Configure Routing
    routing {
        // Public Auth endpoints
        authRoutes(webSocketTracker)
        
        // Authenticated routes
        authenticate("auth-jwt") {
            syncRoutes(webSocketTracker)
            scraperRoutes()
            aiRoutes()
            photoRoutes()
            settingsRoutes()
            webSocketRoutes(webSocketTracker)
        }
    }
}
