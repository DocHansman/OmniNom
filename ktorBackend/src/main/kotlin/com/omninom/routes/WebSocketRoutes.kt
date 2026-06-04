package com.omninom.routes

import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import java.util.*
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("WebSocketRoutes")

fun Route.webSocketRoutes(webSocketTracker: WebSocketTracker) {
    webSocket("/ws/sync") {
        val principal = call.principal<JWTPrincipal>()
        val userIdStr = principal?.payload?.getClaim("user_id")?.asString()
        if (userIdStr == null) {
            close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Nicht autorisiert"))
            return@webSocket
        }
        
        val userId = try {
            UUID.fromString(userIdStr)
        } catch (e: Exception) {
            close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Ungültiges User-Format"))
            return@webSocket
        }

        webSocketTracker.addSession(userId, this)

        try {
            // Keep connection open and read frames (Ktor requires consuming 'incoming' 
            // to keep the WebSocket active and detect disconnects)
            for (frame in incoming) {
                if (frame is Frame.Text) {
                    val text = frame.readText()
                    logger.info("Received WebSocket frame from user $userId: $text")
                    // We don't require client messages since syncing is done via HTTP POST,
                    // but we can echo or verify ping if sent manually.
                    send(Frame.Text("acknowledged"))
                }
            }
        } catch (e: Exception) {
            logger.warn("WebSocket session interrupted for user $userId: ${e.message}")
        } finally {
            webSocketTracker.removeSession(userId, this)
            logger.info("WebSocket session closed for user $userId")
        }
    }
}
