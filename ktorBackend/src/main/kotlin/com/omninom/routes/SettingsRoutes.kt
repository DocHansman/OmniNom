package com.omninom.routes

import com.omninom.models.AiSettings
import com.omninom.models.Users
import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import org.slf4j.LoggerFactory
import java.time.LocalDateTime
import java.time.Instant
import java.time.Duration
import java.util.*

private val logger = LoggerFactory.getLogger("SettingsRoutes")

private val localHttpClient = HttpClient(CIO) {
    install(ContentNegotiation) {
        json(Json {
            ignoreUnknownKeys = true
            isLenient = true
        })
    }
    install(HttpTimeout) {
        requestTimeoutMillis = 15000
        connectTimeoutMillis = 10000
    }
}

object AiModelsCache {
    private var lastFetched: Instant? = null
    private var cachedModelsJson: JsonArray? = null

    suspend fun getAvailableModels(httpClient: HttpClient): JsonArray {
        val now = Instant.now()
        val cacheDuration = Duration.ofHours(24)
        
        synchronized(this) {
            if (cachedModelsJson != null && lastFetched != null && 
                Duration.between(lastFetched, now).compareTo(cacheDuration) < 0) {
                return cachedModelsJson!!
            }
        }
        
        try {
            logger.info("Fetching live models from OpenRouter...")
            val response = httpClient.get("https://openrouter.ai/api/v1/models")
            if (response.status == HttpStatusCode.OK) {
                val parsed = parseOpenRouterModels(response.bodyAsText())
                synchronized(this) {
                    cachedModelsJson = parsed
                    lastFetched = now
                }
                return parsed
            } else {
                logger.warn("OpenRouter models request failed: ${response.status}")
            }
        } catch (e: Exception) {
            logger.error("Failed to fetch available models: ", e)
        }
        
        return cachedModelsJson ?: getStaticFallbackModels()
    }

    private fun parseOpenRouterModels(jsonString: String): JsonArray {
        val root = Json.parseToJsonElement(jsonString).jsonObject
        val data = root["data"]?.jsonArray ?: return buildJsonArray {}
        
        return buildJsonArray {
            for (item in data) {
                val obj = item.jsonObject
                val id = obj["id"]?.jsonPrimitive?.content ?: continue
                val name = obj["name"]?.jsonPrimitive?.content ?: id
                
                val pricing = obj["pricing"]?.jsonObject
                val promptCost = pricing?.get("prompt")?.jsonPrimitive?.contentOrNull?.toDoubleOrNull() ?: 0.0
                val completionCost = pricing?.get("completion")?.jsonPrimitive?.contentOrNull?.toDoubleOrNull() ?: 0.0
                
                val inputCostPerMillion = promptCost * 1_000_000
                val outputCostPerMillion = completionCost * 1_000_000
                
                val architecture = obj["architecture"]?.jsonObject
                val inputModalities = architecture?.get("input_modalities")?.jsonArray
                val hasImageInput = inputModalities?.any { it.jsonPrimitive.content == "image" } ?: false
                
                // Derive provider classification based on ID prefix
                val provider = when {
                    id.startsWith("openai/") -> "openai"
                    id.startsWith("anthropic/") -> "anthropic"
                    id.startsWith("google/") -> "gemini"
                    else -> "openrouter"
                }
                
                addJsonObject {
                    put("id", id)
                    put("name", name)
                    put("inputCostPerMillion", inputCostPerMillion)
                    put("outputCostPerMillion", outputCostPerMillion)
                    put("supportsVision", hasImageInput)
                    put("provider", provider)
                }
            }
        }
    }

    private fun getStaticFallbackModels(): JsonArray {
        return buildJsonArray {
            addJsonObject {
                put("id", "google/gemini-2.5-flash")
                put("name", "Google: Gemini 2.5 Flash")
                put("inputCostPerMillion", 0.075)
                put("outputCostPerMillion", 0.3)
                put("supportsVision", true)
                put("provider", "gemini")
            }
            addJsonObject {
                put("id", "google/gemini-2.0-flash")
                put("name", "Google: Gemini 2.0 Flash")
                put("inputCostPerMillion", 0.075)
                put("outputCostPerMillion", 0.3)
                put("supportsVision", true)
                put("provider", "gemini")
            }
            addJsonObject {
                put("id", "google/gemini-1.5-pro")
                put("name", "Google: Gemini 1.5 Pro")
                put("inputCostPerMillion", 1.25)
                put("outputCostPerMillion", 5.0)
                put("supportsVision", true)
                put("provider", "gemini")
            }
            addJsonObject {
                put("id", "anthropic/claude-sonnet-4-6")
                put("name", "Anthropic: Claude 3.5 Sonnet")
                put("inputCostPerMillion", 3.0)
                put("outputCostPerMillion", 15.0)
                put("supportsVision", true)
                put("provider", "anthropic")
            }
            addJsonObject {
                put("id", "openai/gpt-4o")
                put("name", "OpenAI: GPT-4o")
                put("inputCostPerMillion", 2.5)
                put("outputCostPerMillion", 10.0)
                put("supportsVision", true)
                put("provider", "openai")
            }
            addJsonObject {
                put("id", "openai/gpt-4o-mini")
                put("name", "OpenAI: GPT-4o Mini")
                put("inputCostPerMillion", 0.15)
                put("outputCostPerMillion", 0.6)
                put("supportsVision", true)
                put("provider", "openai")
            }
        }
    }
}

fun isAdminUser(userId: UUID): Boolean {
    val adminEmailsEnv = System.getenv("ADMIN_EMAILS") ?: ""
    if (adminEmailsEnv.isBlank()) {
        return true
    }
    val allowedEmails = adminEmailsEnv.split(",").map { it.trim().lowercase() }
    val userEmail = transaction {
        Users.selectAll().where { Users.id eq userId }.firstOrNull()?.get(Users.email)?.lowercase()
    }
    return userEmail != null && allowedEmails.contains(userEmail)
}

fun Route.settingsRoutes() {
    
    // GET /api/me - Get current user profile meta (check admin status)
    get("/api/me") {
        val principal = call.principal<JWTPrincipal>()
        val userIdStr = principal?.payload?.getClaim("user_id")?.asString() ?: return@get call.respond(HttpStatusCode.Unauthorized)
        val userId = UUID.fromString(userIdStr)
        val isAdmin = isAdminUser(userId)
        call.respond(mapOf("isAdmin" to isAdmin))
    }

    // GET /api/settings/ai - Fetch global AI settings (masked key)
    get("/api/settings/ai") {
        val settingsRow = transaction {
            AiSettings.selectAll().where { AiSettings.id eq "global" }.firstOrNull()
        }

        val responseJson = if (settingsRow == null) {
            buildJsonObject {
                put("provider", "openrouter")
                put("apiKey", "")
                putJsonObject("models") {
                    put("photoScan", "google/gemini-2.5-flash")
                    put("inventoryScan", "google/gemini-2.5-flash")
                    put("enrich", "google/gemini-2.5-flash")
                    put("suggest", "google/gemini-2.5-flash")
                    put("imageGen", "black-forest-labs/flux.2-flex")
                }
            }
        } else {
            try {
                val encryptedPayload = settingsRow[AiSettings.encryptedPayload]
                val decrypted = com.omninom.utils.MasterKeyEncryption.decryptMasterKey(encryptedPayload)
                val parsed = Json.parseToJsonElement(decrypted).jsonObject
                
                val apiKey = parsed["apiKey"]?.jsonPrimitive?.content ?: ""
                val maskedKey = if (apiKey.isNotEmpty()) {
                    if (apiKey.length >= 4) {
                        "•".repeat(8) + apiKey.takeLast(4)
                    } else {
                        "•".repeat(8) + apiKey
                    }
                } else {
                    ""
                }
                
                buildJsonObject {
                    parsed.forEach { (key, value) ->
                        if (key == "apiKey") {
                            put("apiKey", maskedKey)
                        } else {
                            put(key, value)
                        }
                    }
                }
            } catch (e: Exception) {
                logger.error("Failed to decrypt global settings for UI read:", e)
                buildJsonObject {
                    put("provider", "openrouter")
                    put("apiKey", "")
                    putJsonObject("models") {
                        put("photoScan", "google/gemini-2.5-flash")
                        put("inventoryScan", "google/gemini-2.5-flash")
                        put("enrich", "google/gemini-2.5-flash")
                        put("suggest", "google/gemini-2.5-flash")
                        put("imageGen", "black-forest-labs/flux.2-flex")
                    }
                }
            }
        }

        call.respond(responseJson)
    }

    // POST /api/settings/ai - Save global AI settings (restricted to Admin)
    post("/api/settings/ai") {
        val principal = call.principal<JWTPrincipal>()
        val userIdStr = principal?.payload?.getClaim("user_id")?.asString() ?: return@post call.respond(HttpStatusCode.Unauthorized)
        val userId = UUID.fromString(userIdStr)

        if (!isAdminUser(userId)) {
            call.respond(HttpStatusCode.Forbidden, "Keine Admin-Berechtigung")
            return@post
        }

        val body = call.receive<JsonObject>()
        val provider = body["provider"]?.jsonPrimitive?.content ?: "openrouter"
        var apiKey = body["apiKey"]?.jsonPrimitive?.content ?: ""
        val models = body["models"]?.jsonObject ?: buildJsonObject {}

        // Re-use existing API key if masked pattern was sent back
        if (apiKey.startsWith("•")) {
            val existingRow = transaction {
                AiSettings.selectAll().where { AiSettings.id eq "global" }.firstOrNull()
            }
            if (existingRow != null) {
                try {
                    val decrypted = com.omninom.utils.MasterKeyEncryption.decryptMasterKey(existingRow[AiSettings.encryptedPayload])
                    val parsed = Json.parseToJsonElement(decrypted).jsonObject
                    apiKey = parsed["apiKey"]?.jsonPrimitive?.content ?: ""
                } catch (e: Exception) {
                    logger.error("Failed to restore existing encrypted API key:", e)
                    apiKey = ""
                }
            } else {
                apiKey = ""
            }
        }

        val payloadToSave = buildJsonObject {
            put("provider", provider)
            put("apiKey", apiKey)
            put("models", models)
        }

        val jsonString = Json.encodeToString(JsonObject.serializer(), payloadToSave)
        val encrypted = com.omninom.utils.MasterKeyEncryption.encryptMasterKey(jsonString)

        transaction {
            val count = AiSettings.selectAll().where { AiSettings.id eq "global" }.count()
            if (count > 0) {
                AiSettings.update({ AiSettings.id eq "global" }) {
                    it[encryptedPayload] = encrypted
                    it[updatedAt] = LocalDateTime.now()
                }
            } else {
                AiSettings.insert {
                    it[id] = "global"
                    it[encryptedPayload] = encrypted
                    it[updatedAt] = LocalDateTime.now()
                }
            }
        }

        call.respond(HttpStatusCode.OK, mapOf("status" to "success"))
    }

    // POST /api/settings/ai/test-connection - Test provider connection & API key configuration (restricted to Admin)
    post("/api/settings/ai/test-connection") {
        val principal = call.principal<JWTPrincipal>()
        val userIdStr = principal?.payload?.getClaim("user_id")?.asString() ?: return@post call.respond(HttpStatusCode.Unauthorized)
        val userId = UUID.fromString(userIdStr)

        if (!isAdminUser(userId)) {
            call.respond(HttpStatusCode.Forbidden, "Keine Admin-Berechtigung")
            return@post
        }

        var provider = "openrouter"
        try {
            val body = call.receive<JsonObject>()
            provider = body["provider"]?.jsonPrimitive?.content ?: "openrouter"
            var apiKey = body["apiKey"]?.jsonPrimitive?.content ?: ""
            val models = body["models"]?.jsonObject ?: buildJsonObject {}

            // Re-use existing API key if masked pattern was sent back
            if (apiKey.startsWith("•")) {
                val existingRow = transaction {
                    AiSettings.selectAll().where { AiSettings.id eq "global" }.firstOrNull()
                }
                if (existingRow != null) {
                    try {
                        val decrypted = com.omninom.utils.MasterKeyEncryption.decryptMasterKey(existingRow[AiSettings.encryptedPayload])
                        val parsed = Json.parseToJsonElement(decrypted).jsonObject
                        apiKey = parsed["apiKey"]?.jsonPrimitive?.content ?: ""
                    } catch (e: Exception) {
                        logger.error("Failed to restore existing encrypted API key for test:", e)
                        apiKey = ""
                    }
                } else {
                    apiKey = ""
                }
            }

            if (apiKey.isBlank()) {
                call.respond(HttpStatusCode.OK, mapOf("status" to "error", "message" to "API-Schlüssel ist leer oder unvollständig."))
                return@post
            }

            // Determine model to test connection with (prefer 'enrich' or first text model)
            val testModel = models["enrich"]?.jsonPrimitive?.content 
                ?: models["suggest"]?.jsonPrimitive?.content
                ?: "google/gemini-2.5-flash"

            logger.info("Testing connection to $provider with model $testModel...")
            
            // Run the API call with a 15 second timeout to fail early on network blockages
            val responseText = kotlinx.coroutines.withTimeout(15000) {
                callTextModel(
                    provider = provider,
                    apiKey = apiKey,
                    model = testModel,
                    systemPrompt = "You are a connection testing agent. Respond ONLY with the word OK.",
                    userPrompt = "Please respond with OK.",
                    httpClient = localHttpClient
                )
            }

            logger.info("Connection test successful! Model responded: $responseText")
            call.respond(HttpStatusCode.OK, mapOf("status" to "success", "message" to "Verbindung erfolgreich! Modell antwortete: $responseText"))
        } catch (timeout: kotlinx.coroutines.TimeoutCancellationException) {
            logger.error("Connection test timed out after 15 seconds")
            call.respond(HttpStatusCode.OK, mapOf(
                "status" to "error",
                "message" to "Verbindung fehlgeschlagen: Die Anfrage an den Provider ($provider) dauerte länger als 15 Sekunden (Timeout). Prüfe die Server-Netzwerkverbindung."
            ))
        } catch (e: Exception) {
            logger.error("Connection test failed: ", e)
            call.respond(HttpStatusCode.OK, mapOf(
                "status" to "error",
                "message" to "Verbindung fehlgeschlagen: ${e.message}"
            ))
        }
    }

    // GET /api/settings/ai/models - Return list of simplified available models
    get("/api/settings/ai/models") {
        val modelsList = AiModelsCache.getAvailableModels(localHttpClient)
        call.respond(modelsList)
    }
}
