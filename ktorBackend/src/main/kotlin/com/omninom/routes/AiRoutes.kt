package com.omninom.routes

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.statement.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.utils.io.readRemaining
import kotlinx.io.readByteArray
import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory
import java.util.*
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO
import java.awt.image.BufferedImage
import org.jetbrains.exposed.sql.selectAll
import com.omninom.models.AiSettings


private val logger = LoggerFactory.getLogger("AiRoutes")

// Client with request timeout (AI model processing takes time)
private val httpClient = HttpClient(CIO) {
    install(ContentNegotiation) {
        json(Json {
            ignoreUnknownKeys = true
            isLenient = true
        })
    }
    install(HttpTimeout) {
        requestTimeoutMillis = 40000 // 40 seconds
        connectTimeoutMillis = 10000
    }
}

data class AiConfig(
    val provider: String,
    val apiKey: String,
    val models: Map<String, String>
)

val defaultModels = mapOf(
    "photoScan" to "google/gemini-2.5-flash",
    "inventoryScan" to "google/gemini-2.5-flash",
    "enrich" to "google/gemini-2.5-flash",
    "suggest" to "google/gemini-2.5-flash",
    "imageGen" to "black-forest-labs/flux.2-flex"
)

private fun loadAiSettings(): AiConfig {
    val settingsRow = org.jetbrains.exposed.sql.transactions.transaction {
        AiSettings.selectAll().where { AiSettings.id eq "global" }.firstOrNull()
    }
    
    return if (settingsRow == null) {
        AiConfig("openrouter", System.getenv("OPENROUTER_API_KEY") ?: "", defaultModels)
    } else {
        try {
            val encryptedPayload = settingsRow[AiSettings.encryptedPayload]
            val decrypted = com.omninom.utils.MasterKeyEncryption.decryptMasterKey(encryptedPayload)
            val parsed = Json.parseToJsonElement(decrypted).jsonObject
            val provider = parsed["provider"]?.jsonPrimitive?.content ?: "openrouter"
            val apiKey = parsed["apiKey"]?.jsonPrimitive?.content ?: ""
            val modelsObj = parsed["models"]?.jsonObject ?: buildJsonObject {}
            val modelsMap = defaultModels.toMutableMap()
            modelsObj.forEach { (key, value) ->
                modelsMap[key] = value.jsonPrimitive.content
            }
            AiConfig(provider, apiKey, modelsMap)
        } catch (e: Exception) {
            logger.error("Failed to load/decrypt global AI settings, using default/env: ", e)
            AiConfig("openrouter", System.getenv("OPENROUTER_API_KEY") ?: "", defaultModels)
        }
    }
}

fun Route.aiRoutes() {
    post("/api/recipe/from-photo") {
        val aiConfig = loadAiSettings()
        if (aiConfig.apiKey.isBlank()) {
            call.respond(HttpStatusCode.InternalServerError, "KI-API-Schlüssel ist auf dem Server nicht konfiguriert")
            return@post
        }

        try {
            val multipart = call.receiveMultipart()
            var imageBytes: ByteArray? = null
            var contentType: String? = null

            multipart.forEachPart { part ->
                if (part is PartData.FileItem) {
                    contentType = part.contentType?.toString()
                    imageBytes = part.provider().readRemaining().readByteArray()
                }
                part.dispose()
            }

            if (imageBytes == null || imageBytes!!.isEmpty()) {
                call.respond(HttpStatusCode.BadRequest, "Keine Bilddatei empfangen")
                return@post
            }

            // Limit image size to 5MB
            if (imageBytes!!.size > 5 * 1024 * 1024) {
                call.respond(HttpStatusCode.BadRequest, "Bilddatei überschreitet das Limit von 5MB")
                return@post
            }

            val mime = contentType ?: "image/jpeg"
            val base64Image = Base64.getEncoder().encodeToString(imageBytes)

            logger.info("Sending photo to Vision API (${aiConfig.provider} -> ${aiConfig.models["photoScan"]})...")

            val systemPrompt = "Du bist ein präziser Rezept-Extraktor. Analysiere das Bild und antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt. Verwende KEINE Markdown-Codeblöcke wie ```json."
            val userPrompt = """
                Extrahiere das Rezept aus diesem Bild im folgenden JSON-Schema:
                {
                  "title": "Rezeptname (String)",
                  "servings": Portionenanzahl (Zahl),
                  "cookingTimeMinutes": Gesamte Kochzeit in Minuten (Zahl),
                  "source": "Name des Buchs oder leer (String)",
                  "dietaryTags": ["vegan", "vegetarisch", "glutenfrei", "laktosefrei", "low-carb"] (Array von passenden Tags, alle kleingeschrieben),
                  "ingredients": [
                    { "name": "Zutatenname (String)", "amount": Menge (Zahl), "unit": "g|kg|ml|l|TL|EL|Stück|Prise|Tasse" }
                  ],
                  "steps": [
                    { "order": Schrittnummer (Zahl), "description": "Beschreibung (String)", "timerMinutes": Timer in Minuten oder null (Zahl/null) }
                  ],
                  "nutrition": {
                    "caloriesPerServing": Kalorien pro Portion (Zahl),
                    "proteinG": Protein in g (Zahl),
                    "fatG": Fett in g (Zahl),
                    "carbsG": Kohlenhydrate in g (Zahl)
                  },
                  "imageCropCoordinates": { "ymin": (Zahl, 0-100), "xmin": (Zahl, 0-100), "ymax": (Zahl, 0-100), "xmax": (Zahl, 0-100) } oder null (die prozentualen Ausmaße des Gerichts-Fotos auf dem Bild)
                }
                Achte darauf:
                1. Alle Zutatenmengen müssen in sinnvolle numerische Werte konvertiert werden.
                2. Fehlen Nährwertangaben auf dem Bild, schätze sie grob auf Basis der extrahierten Zutaten.
                3. Falls ein Foto des fertigen Gerichts auf dem Bild sichtbar ist, gib die prozentualen Koordinaten (0-100) für den Ausschnitt unter "imageCropCoordinates" an. Sonst setze das Feld auf null.
                4. Antworte ausschließlich mit purem JSON.
            """.trimIndent()

            val cleanContent = callVisionModel(
                provider = aiConfig.provider,
                apiKey = aiConfig.apiKey,
                model = aiConfig.models["photoScan"] ?: "google/gemini-2.5-flash",
                systemPrompt = systemPrompt,
                userPrompt = userPrompt,
                imageBase64 = base64Image,
                imageMime = mime,
                httpClient = httpClient
            )

            try {
                // Parse to check correctness, then return
                val parsedRecipe = Json.parseToJsonElement(cleanContent) as JsonObject
                
                // Crop image if coordinates are present
                var enrichedRecipe = parsedRecipe
                val cropCoords = parsedRecipe["imageCropCoordinates"]?.jsonObject
                if (cropCoords != null) {
                    try {
                        val ymin = cropCoords["ymin"]?.jsonPrimitive?.content?.toDoubleOrNull()
                        val xmin = cropCoords["xmin"]?.jsonPrimitive?.content?.toDoubleOrNull()
                        val ymax = cropCoords["ymax"]?.jsonPrimitive?.content?.toDoubleOrNull()
                        val xmax = cropCoords["xmax"]?.jsonPrimitive?.content?.toDoubleOrNull()

                        if (ymin != null && xmin != null && ymax != null && xmax != null) {
                            val bais = ByteArrayInputStream(imageBytes)
                            val bufferedImage: BufferedImage? = ImageIO.read(bais)
                            if (bufferedImage != null) {
                                val originalWidth = bufferedImage.width
                                val originalHeight = bufferedImage.height

                                val x = (xmin / 100.0 * originalWidth).toInt().coerceIn(0, originalWidth - 1)
                                val y = (ymin / 100.0 * originalHeight).toInt().coerceIn(0, originalHeight - 1)
                                val w = (((xmax - xmin) / 100.0) * originalWidth).toInt().coerceIn(1, originalWidth - x)
                                val h = (((ymax - ymin) / 100.0) * originalHeight).toInt().coerceIn(1, originalHeight - y)

                                if (w > 0 && h > 0) {
                                    val cropped = bufferedImage.getSubimage(x, y, w, h)
                                    val photoDir = java.io.File("/data/photos")
                                    if (!photoDir.exists()) {
                                        photoDir.mkdirs()
                                    }
                                    val uniqueName = "${UUID.randomUUID()}.jpg"
                                    val file = java.io.File(photoDir, uniqueName)
                                    ImageIO.write(cropped, "jpg", file)
                                    
                                    enrichedRecipe = buildJsonObject {
                                        parsedRecipe.forEach { (key, value) ->
                                            put(key, value)
                                        }
                                        put("photo_path", "/photos/$uniqueName")
                                    }
                                    logger.info("Successfully cropped recipe image and saved to: ${file.absolutePath}")
                                }
                            }
                        }
                    } catch (cropEx: Exception) {
                        logger.error("Failed to crop scanned recipe image: ", cropEx)
                    }
                }

                call.respond(enrichedRecipe)
            } catch (e: Exception) {
                logger.error("Failed to parse AI output as JSON. Raw AI response: $cleanContent", e)
                call.respond(HttpStatusCode.UnprocessableEntity, "Das KI-Modell lieferte kein gültiges Rezept-JSON. Bitte versuchen Sie es erneut.")
            }

        } catch (e: Exception) {
            logger.error("Error calling AI: ", e)
            call.respond(HttpStatusCode.InternalServerError, "Serverfehler bei AI-Anfrage: ${e.message}")
        }
    }

    post("/api/inventory/scan") {
        val aiConfig = loadAiSettings()
        if (aiConfig.apiKey.isBlank()) {
            call.respond(HttpStatusCode.InternalServerError, "KI-API-Schlüssel ist auf dem Server nicht konfiguriert")
            return@post
        }

        try {
            val multipart = call.receiveMultipart()
            var fileBytes: ByteArray? = null
            var contentType: String? = null

            multipart.forEachPart { part ->
                if (part is PartData.FileItem) {
                    contentType = part.contentType?.toString()
                    fileBytes = part.provider().readRemaining().readByteArray()
                }
                part.dispose()
            }

            if (fileBytes == null || fileBytes!!.isEmpty()) {
                call.respond(HttpStatusCode.BadRequest, "Keine Bild- oder PDF-Datei empfangen")
                return@post
            }

            // Limit file size to 10MB
            if (fileBytes!!.size > 10 * 1024 * 1024) {
                call.respond(HttpStatusCode.BadRequest, "Datei überschreitet das Limit von 10MB")
                return@post
            }

            val mime = contentType ?: "image/jpeg"
            val base64File = Base64.getEncoder().encodeToString(fileBytes)

            logger.info("Sending document/image to Vision API (${aiConfig.provider} -> ${aiConfig.models["inventoryScan"]})...")

            val systemPrompt = "Du bist ein präziser System-Scanner für Lebensmittelvorräte. Analysiere das Dokument/Bild und antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt. Verwende KEINE Markdown-Codeblöcke wie ```json."
            
            val userPrompt = """
                Analysiere das hochgeladene Bild oder PDF (z. B. Kühlschrankinhalt, Obstkorb, Einkaufszettel oder Bon) und extrahiere alle vorhandenen Lebensmittel/Zutaten.

                Regeln für die Extraktion:
                1. Verwende saubere, generische Zutatennamen auf Deutsch.
                2. Entferne alle Markennamen (z.B. "Milch" statt "Weihenstephan Milch", "Tomaten" statt "Mutti Tomaten").
                3. Ermittle die richtige Menge (Zahl) und Einheit (z.B. g, kg, ml, l, Stück, Prise, Tasse, Dose, Flasche, Bund).
                4. Wenn eine Zutat angebrochen ist oder die Menge unsicher/unklar ist (z.B. halbe Flasche Milch, angebrochene Butter), schätze die verbleibende Menge und setze das Feld "isEstimate" auf true. Sonst false.
                5. Weise jeder Zutat eine passende Kategorie zu. Gültige Kategorien sind: "Kühlschrank", "Konserven", "Trocken", "Gewürze", "Frische Kräuter", "Tiefkühl", "Sonstiges".
                6. Falls es sich um einen Kassenbon handelt, extrahiere nur die tatsächlich gekauften Lebensmittel (keine Non-Food Artikel wie Zahnpasta oder Batterien).

                Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt im folgenden Format:
                {
                  "ingredients": [
                    {
                      "name": "Zutatenname (String)",
                      "amount": Menge (Zahl),
                      "unit": "g|kg|ml|l|TL|EL|Stück|Prise|Dose|Flasche|Bund",
                      "category": "Kühlschrank|Konserven|Trocken|Gewürze|Frische Kräuter|Tiefkühl|Sonstiges",
                      "isEstimate": true|false
                    }
                  ]
                }
                Antworte ausschließlich mit purem JSON.
            """.trimIndent()

            val cleanContent = callVisionModel(
                provider = aiConfig.provider,
                apiKey = aiConfig.apiKey,
                model = aiConfig.models["inventoryScan"] ?: "google/gemini-2.5-flash",
                systemPrompt = systemPrompt,
                userPrompt = userPrompt,
                imageBase64 = base64File,
                imageMime = mime,
                httpClient = httpClient
            )

            try {
                val parsedResult = Json.parseToJsonElement(cleanContent) as JsonObject
                call.respond(parsedResult)
            } catch (e: Exception) {
                logger.error("Failed to parse AI output as JSON. Raw AI response: $cleanContent", e)
                call.respond(HttpStatusCode.UnprocessableEntity, "Das KI-Modell lieferte kein gültiges Vorrats-JSON. Bitte versuchen Sie es erneut.")
            }

        } catch (e: Exception) {
            logger.error("Error scanning inventory: ", e)
            call.respond(HttpStatusCode.InternalServerError, "Serverfehler bei AI-Anfrage: ${e.message}")
        }
    }

    post("/api/recipe/generate-image") {
        val aiConfig = loadAiSettings()
        val openRouterApiKey = if (aiConfig.provider.lowercase() == "openrouter" && aiConfig.apiKey.isNotBlank()) {
            aiConfig.apiKey
        } else {
            System.getenv("OPENROUTER_API_KEY") ?: ""
        }

        if (openRouterApiKey.isBlank()) {
            call.respond(HttpStatusCode.InternalServerError, "OpenRouter API Key ist auf dem Server nicht konfiguriert")
            return@post
        }

        try {
            val request = call.receive<JsonObject>()
            val title = request["title"]?.jsonPrimitive?.content ?: ""
            val ingredients = request["ingredients"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList()

            if (title.isBlank()) {
                call.respond(HttpStatusCode.BadRequest, "Rezepttitel fehlt")
                return@post
            }

            val prompt = "A professional, high-quality, appetising food photograph of $title, featuring ${ingredients.joinToString(", ")}. Studio lighting, clean plating, delicious visual styling."
            logger.info("Generating AI recipe image with prompt: $prompt")

            val requestBody = buildJsonObject {
                put("model", "black-forest-labs/flux.2-flex")
                putJsonArray("messages") {
                    addJsonObject {
                        put("role", "user")
                        put("content", prompt)
                    }
                }
                putJsonArray("modalities") {
                    add("image")
                }
            }

            val httpResponse = httpClient.post("https://openrouter.ai/api/v1/chat/completions") {
                header(HttpHeaders.Authorization, "Bearer $openRouterApiKey")
                header(HttpHeaders.ContentType, ContentType.Application.Json)
                setBody(requestBody)
            }

            if (httpResponse.status != HttpStatusCode.OK) {
                val errText = httpResponse.bodyAsText()
                logger.error("OpenRouter Flux failed: ${httpResponse.status}. Details: $errText")
                call.respond(HttpStatusCode.BadGateway, "Fehler bei der Bildgenerierung: ${httpResponse.status}")
                return@post
            }

            val responseJson = httpResponse.body<JsonObject>()
            val choices = responseJson["choices"]?.jsonArray
            val message = choices?.firstOrNull()?.jsonObject?.get("message")?.jsonObject
            val images = message?.get("images")?.jsonArray
            val imageUrl = images?.firstOrNull()?.jsonObject?.get("image_url")?.jsonObject?.get("url")?.jsonPrimitive?.content

            if (!imageUrl.isNullOrBlank()) {
                val imageBytes = if (imageUrl.startsWith("data:")) {
                    val base64Data = imageUrl.substringAfter(",")
                    Base64.getDecoder().decode(base64Data)
                } else {
                    httpClient.get(imageUrl).bodyAsBytes()
                }

                val photoDir = java.io.File("/data/photos")
                if (!photoDir.exists()) {
                    photoDir.mkdirs()
                }
                val uniqueName = "${UUID.randomUUID()}.png"
                val file = java.io.File(photoDir, uniqueName)
                file.writeBytes(imageBytes)
                
                val photoPath = "/photos/$uniqueName"
                logger.info("Saved generated AI recipe image to $photoPath")

                call.respond(buildJsonObject {
                    put("photo_path", photoPath)
                })
            } else {
                call.respond(HttpStatusCode.BadGateway, "Kein Bild in der Antwort von OpenRouter gefunden")
            }
        } catch (e: Exception) {
            logger.error("Error generating image: ", e)
            call.respond(HttpStatusCode.InternalServerError, "Fehler bei der Bildgenerierung: ${e.message}")
        }
    }

    post("/api/recipe/enrich") {
        val aiConfig = loadAiSettings()
        if (aiConfig.apiKey.isBlank()) {
            call.respond(HttpStatusCode.InternalServerError, "KI-API-Schlüssel ist auf dem Server nicht konfiguriert")
            return@post
        }

        try {
            val request = call.receive<JsonObject>()
            val title = request["title"]?.jsonPrimitive?.content ?: ""

            if (title.isBlank()) {
                call.respond(HttpStatusCode.BadRequest, "Rezepttitel fehlt")
                return@post
            }

            val prompt = """
                Du bist ein Ernährungsberater und Koch-Experte.
                Analysiere dieses Rezept und vervollständige oder korrigiere die folgenden Felder:
                1. Portionen (servings)
                2. Gesamte Zubereitungszeit in Minuten (cookingTimeMinutes)
                3. Passende Diät-Tags (dietaryTags) aus: ["vegan", "vegetarisch", "glutenfrei", "laktosefrei", "low-carb"]
                4. Nährwerte pro Portion (nutrition): Kalorien (caloriesPerServing), Protein (proteinG), Fett (fatG), Kohlenhydrate (carbsG). Schätze diese basierend auf den Zutaten und Portionen.

                Rezept-Daten:
                ${Json { prettyPrint = true }.encodeToString(JsonObject.serializer(), request)}

                Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt im folgenden Format:
                {
                  "servings": (Zahl),
                  "cookingTimeMinutes": (Zahl),
                  "dietaryTags": [Array von Strings],
                  "nutrition": {
                    "caloriesPerServing": (Zahl),
                    "proteinG": (Zahl),
                    "fatG": (Zahl),
                    "carbsG": (Zahl)
                  }
                }
                Antworte ausschließlich mit purem JSON. Verwende keine Markdown-Codeblöcke!
            """.trimIndent()

            logger.info("Enriching recipe with API (${aiConfig.provider} -> ${aiConfig.models["enrich"]})...")

            val cleanContent = callTextModel(
                provider = aiConfig.provider,
                apiKey = aiConfig.apiKey,
                model = aiConfig.models["enrich"] ?: "google/gemini-2.5-flash",
                systemPrompt = "Du bist ein präziser Rezept-Ergänzer. Analysiere die Rezeptdaten und antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt. Verwende KEINE Markdown-Codeblöcke wie ```json.",
                userPrompt = prompt,
                httpClient = httpClient
            )

            val parsedEnrichment = Json.parseToJsonElement(cleanContent) as JsonObject
            call.respond(parsedEnrichment)
        } catch (e: Exception) {
            logger.error("Enrichment error: ", e)
            call.respond(HttpStatusCode.InternalServerError, "Fehler bei der Rezept-Ergänzung: ${e.message}")
        }
    }

    // AI Recipe Suggestion Endpoint
    post("/api/recipe/suggest") {
        val aiConfig = loadAiSettings()
        if (aiConfig.apiKey.isBlank()) {
            call.respond(HttpStatusCode.InternalServerError, "KI-API-Schlüssel ist auf dem Server nicht konfiguriert")
            return@post
        }

        try {
            val request = call.receive<JsonObject>()
            val availableIngredients = request["availableIngredients"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList()
            val selectedIngredients = request["selectedIngredients"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList()
            val daysCount = request["daysCount"]?.jsonPrimitive?.intOrNull ?: 1
            val allowShopping = request["allowShopping"]?.jsonPrimitive?.booleanOrNull ?: false
            val preferences = request["preferences"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList()

            val prompt = """
                Du bist ein Chefkoch und Ernährungsberater.
                Deine Aufgabe ist es, kreative und leckere Rezeptvorschläge basierend auf den vorhandenen Zutaten des Nutzers zu machen.

                Zutaten im Vorrat des Nutzers:
                ${availableIngredients.joinToString(", ")}

                Speziell ausgewählte Zutaten, die unbedingt verwendet werden sollen:
                ${selectedIngredients.joinToString(", ")}

                Anzahl der Tage, für die geplant werden soll: $daysCount Tag(e).
                Einkaufen erlaubt (Zusätzliche Zutaten hinzufügen): ${if (allowShopping) "Ja" else "Nein (Nutze nur Zutaten aus dem Vorrat. Wasser, Salz, Pfeffer, Öl, einfache Gewürze sind okay. Keine anderen Zutaten!)"}.

                Wünsche/Vorlieben des Nutzers (z.B. vegan, asiatisch, low-carb):
                ${preferences.joinToString(", ")}

                Generiere genau $daysCount Hauptgericht(e) - eines für jeden Tag (z.B. Tag 1, Tag 2...).
                Achte darauf, dass jedes Rezept vollständig ist und im JSON-Format ausgegeben wird.

                Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt im folgenden Format. Verwende KEINE Markdown-Codeblöcke wie ```json!

                JSON-Schema:
                {
                  "suggestions": [
                    {
                      "assignedDay": "Tag 1" (oder "Tag 2", ... - entsprechend der Tageanzahl. Wenn daysCount = 1 ist, setze das Feld auf null),
                      "title": "Rezeptname",
                      "servings": 2,
                      "cookingTimeMinutes": 30,
                      "dietaryTags": ["vegan", "vegetarisch", "glutenfrei", "laktosefrei", "low-carb"],
                      "ingredients": [
                        {
                          "name": "Zutatenname",
                          "amount": 250,
                          "unit": "g|kg|ml|l|TL|EL|Stück|Prise|Tasse",
                          "isMissing": false
                        }
                      ],
                      "steps": [
                        { "order": 1, "description": "Schrittbeschreibung" }
                      ],
                      "nutrition": {
                        "caloriesPerServing": 450,
                        "proteinG": 15,
                        "fatG": 10,
                        "carbsG": 55
                      }
                    }
                  ]
                }
            """.trimIndent()

            logger.info("Suggesting recipe from stock via API (${aiConfig.provider} -> ${aiConfig.models["suggest"]})...")

            val cleanContent = callTextModel(
                provider = aiConfig.provider,
                apiKey = aiConfig.apiKey,
                model = aiConfig.models["suggest"] ?: "google/gemini-2.5-flash",
                systemPrompt = "Du bist ein präziser Rezept-Planer. Analysiere den Vorrat und antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt. Verwende KEINE Markdown-Codeblöcke wie ```json.",
                userPrompt = prompt,
                httpClient = httpClient
            )

            val parsedSuggestions = Json.parseToJsonElement(cleanContent) as JsonObject
            call.respond(parsedSuggestions)
        } catch (e: Exception) {
            logger.error("Suggest error: ", e)
            call.respond(HttpStatusCode.InternalServerError, "Fehler bei der Rezept-Generierung: ${e.message}")
        }
    }
}
