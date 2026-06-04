package com.omninom.routes

import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.*
import java.util.concurrent.ConcurrentHashMap
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("WebSocketTracker")

class WebSocketTracker {
    private val sessions = ConcurrentHashMap<UUID, MutableSet<DefaultWebSocketServerSession>>()

    fun addSession(userId: UUID, session: DefaultWebSocketServerSession) {
        sessions.computeIfAbsent(userId) { ConcurrentHashMap.newKeySet() }.add(session)
        logger.info("Added WebSocket session for user $userId. Active sessions: ${sessions[userId]?.size}")
    }

    fun removeSession(userId: UUID, session: DefaultWebSocketServerSession) {
        sessions[userId]?.remove(session)
        if (sessions[userId]?.isEmpty() == true) {
            sessions.remove(userId)
        }
        logger.info("Removed WebSocket session for user $userId.")
    }

    suspend fun broadcast(userId: UUID, entityType: String, id: UUID) {
        val userSessions = sessions[userId] ?: return
        val message = Json.encodeToString(buildJsonObject {
            put("entity_type", entityType)
            put("id", id.toString())
        })
        
        logger.info("Broadcasting update ($entityType, $id) to ${userSessions.size} active sessions for user $userId")
        
        val closedSessions = mutableListOf<DefaultWebSocketServerSession>()
        for (session in userSessions) {
            try {
                session.send(Frame.Text(message))
            } catch (e: Exception) {
                closedSessions.add(session)
            }
        }
        closedSessions.forEach { removeSession(userId, it) }
    }
}
