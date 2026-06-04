package com.omninom.routes

import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import org.jsoup.Jsoup
import org.slf4j.LoggerFactory
import java.net.InetAddress
import java.net.URL
import java.time.Duration

private val logger = LoggerFactory.getLogger("ScraperRoutes")

private val httpClient = HttpClient(CIO) {
    install(io.ktor.client.plugins.HttpTimeout) {
        requestTimeoutMillis = 15000 // 15 seconds
        connectTimeoutMillis = 5000
    }
}

@Serializable
data class ScrapeRequest(val url: String)

@Serializable
data class ScrapedRecipe(
    val title: String,
    val servings: Int,
    val cookingTimeMinutes: Int,
    val source: String,
    val dietaryTags: List<String>,
    val ingredients: List<ScrapedIngredient>,
    val steps: List<ScrapedStep>,
    val nutrition: ScrapedNutrition,
    val photo_path: String? = null
)

@Serializable
data class ScrapedIngredient(
    val name: String,
    val amount: Double,
    val unit: String
)

@Serializable
data class ScrapedStep(
    val order: Int,
    val description: String,
    val timerMinutes: Int? = null
)

@Serializable
data class ScrapedNutrition(
    val caloriesPerServing: Double,
    val proteinG: Double,
    val fatG: Double,
    val carbsG: Double
)

fun Route.scraperRoutes() {
    post("/api/scrape") {
        try {
            val req = call.receive<ScrapeRequest>()
            val urlString = req.url
            val url = try {
                URL(urlString)
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, "Ungültiges URL-Format")
                return@post
            }

            // 1. SSRF Protection: Resolve IP address and check if it is private
            val host = url.host
            val ipAddresses = try {
                InetAddress.getAllByName(host)
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, "Host konnte nicht aufgelöst werden: ${e.message}")
                return@post
            }

            for (ip in ipAddresses) {
                if (isPrivateIp(ip)) {
                    logger.warn("Blocked SSRF attempt to private IP: ${ip.hostAddress} for host: $host")
                    call.respond(HttpStatusCode.Forbidden, "Zugriff auf lokale/private IP-Adressen ist untersagt")
                    return@post
                }
            }

            // 2. Fetch and parse HTML with Jsoup
            logger.info("Scraping recipe from URL: $urlString")
            val doc = Jsoup.connect(urlString)
                .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .timeout(10000)
                .get()

            val jsonLdScripts = doc.select("script[type=application/ld+json]")
            var foundRecipeJson: JsonObject? = null

            for (script in jsonLdScripts) {
                try {
                    val scriptContent = script.html().trim()
                    val jsonElement = Json.parseToJsonElement(scriptContent)
                    
                    foundRecipeJson = findRecipeInJson(jsonElement)
                    if (foundRecipeJson != null) {
                        break
                    }
                } catch (e: Exception) {
                    // Skip malformed script tags
                    logger.warn("Failed to parse script tag JSON-LD: ${e.message}")
                }
            }

            if (foundRecipeJson == null) {
                call.respond(HttpStatusCode.UnprocessableEntity, "Keine strukturierten Rezept-Metadaten (Schema.org JSON-LD) auf dieser Seite gefunden.")
                return@post
            }

            // 3. Map JSON-LD Recipe fields
            val scrapedRecipe = parseRecipeJsonLd(foundRecipeJson, urlString)
            
            // Extract and download image if present
            var localPhotoPath: String? = null
            val imageUrl = extractImageUrl(foundRecipeJson["image"])
            if (!imageUrl.isNullOrBlank()) {
                try {
                    logger.info("Scraper downloading image from: $imageUrl")
                    val imageBytes = httpClient.get(imageUrl).bodyAsBytes()
                    
                    // Save to /data/photos
                    val photoDir = java.io.File("/data/photos")
                    if (!photoDir.exists()) {
                        photoDir.mkdirs()
                    }
                    val ext = imageUrl.substringAfterLast('.', "jpg").substringBefore('?').lowercase().takeIf { it.length in 3..4 } ?: "jpg"
                    val uniqueName = "${java.util.UUID.randomUUID()}.$ext"
                    val file = java.io.File(photoDir, uniqueName)
                    file.writeBytes(imageBytes)
                    localPhotoPath = "/photos/$uniqueName"
                    logger.info("Scraper saved image to $localPhotoPath")
                } catch (e: Exception) {
                    logger.warn("Failed to download image from scraped URL $imageUrl: ${e.message}")
                }
            }

            call.respond(scrapedRecipe.copy(photo_path = localPhotoPath))

        } catch (e: Exception) {
            logger.error("Scraper error: ", e)
            call.respond(HttpStatusCode.InternalServerError, "Fehler beim Scraping: ${e.message}")
        }
    }
}

// Extract image URL from Schema.org JSON-LD elements
fun extractImageUrl(imageElement: JsonElement?): String? {
    if (imageElement == null) return null
    return when (imageElement) {
        is JsonPrimitive -> imageElement.content
        is JsonObject -> imageElement["url"]?.jsonPrimitive?.content
        is JsonArray -> {
            imageElement.firstOrNull()?.let { extractImageUrl(it) }
        }
        else -> null
    }
}

// Check if IP is in private/loopback space
fun isPrivateIp(ip: InetAddress): Boolean {
    val address = ip.hostAddress
    return ip.isLoopbackAddress ||
           ip.isLinkLocalAddress ||
           ip.isSiteLocalAddress ||
           address.startsWith("10.") ||
           address.startsWith("192.168.") ||
           address.startsWith("127.") ||
           address.startsWith("0.") ||
           (address.startsWith("172.") && address.split(".").let { it.size >= 2 && it[1].toIntOrNull() in 16..31 }) ||
           address == "::1" ||
           address.startsWith("fe80:") ||
           address.startsWith("fc00:") ||
           address.startsWith("fd00:")
}

// Find object with "@type" == "Recipe" recursively
fun findRecipeInJson(element: JsonElement): JsonObject? {
    when (element) {
        is JsonObject -> {
            val type = element["@type"]?.jsonPrimitive?.content
            if (type == "Recipe") {
                return element
            }
            // Check nested arrays or objects
            for (key in element.keys) {
                val found = findRecipeInJson(element[key]!!)
                if (found != null) return found
            }
        }
        is JsonArray -> {
            for (item in element) {
                val found = findRecipeInJson(item)
                if (found != null) return found
            }
        }
        else -> {}
    }
    return null
}

// Parse Recipe JSON-LD fields into unified format
fun parseRecipeJsonLd(recipe: JsonObject, url: String): ScrapedRecipe {
    val title = recipe["name"]?.jsonPrimitive?.content ?: "Unbenanntes Rezept"
    
    val servings = recipe["recipeYield"]?.let { yieldElement ->
        when (yieldElement) {
            is JsonPrimitive -> {
                // Yield can be "4" or "4 portions"
                val match = "\\d+".toRegex().find(yieldElement.content)
                match?.value?.toIntOrNull() ?: 2
            }
            is JsonArray -> {
                yieldElement.firstOrNull()?.jsonPrimitive?.content?.toIntOrNull() ?: 2
            }
            else -> 2
        }
    } ?: 2

    // Parse cooking times
    val prepTimeMin = parseIsoDuration(recipe["prepTime"]?.jsonPrimitive?.content)
    val cookTimeMin = parseIsoDuration(recipe["cookTime"]?.jsonPrimitive?.content)
    val totalTimeMin = parseIsoDuration(recipe["totalTime"]?.jsonPrimitive?.content)

    val calculatedTime = (prepTimeMin ?: 0) + (cookTimeMin ?: 0)
    val finalTime = if (totalTimeMin != null && totalTimeMin > 0) totalTimeMin else if (calculatedTime > 0) calculatedTime else 30

    // Parse ingredients
    val rawIngredients = recipe["recipeIngredient"] as? JsonArray
        ?: recipe["ingredients"] as? JsonArray
        ?: JsonArray(emptyList())

    val ingredients = rawIngredients.map { element ->
        val line = element.jsonPrimitive.content
        parseIngredientLine(line)
    }

    // Parse steps/instructions
    val steps = mutableListOf<ScrapedStep>()
    val rawInstructions = recipe["recipeInstructions"]
    if (rawInstructions != null) {
        var order = 1
        when (rawInstructions) {
            is JsonArray -> {
                for (ins in rawInstructions) {
                    if (ins is JsonObject) {
                        // HowToStep or HowToSection
                        val type = ins["@type"]?.jsonPrimitive?.content
                        if (type == "HowToStep") {
                            val text = ins["text"]?.jsonPrimitive?.content ?: ins["description"]?.jsonPrimitive?.content ?: ""
                            if (text.isNotEmpty()) {
                                steps.add(ScrapedStep(order++, text))
                            }
                        } else if (type == "HowToSection") {
                            // Section has an array of steps
                            val itemSeq = ins["itemListElement"] as? JsonArray
                            if (itemSeq != null) {
                                for (stepItem in itemSeq) {
                                    if (stepItem is JsonObject) {
                                        val text = stepItem["text"]?.jsonPrimitive?.content ?: stepItem["description"]?.jsonPrimitive?.content ?: ""
                                        if (text.isNotEmpty()) {
                                            steps.add(ScrapedStep(order++, text))
                                        }
                                    }
                                }
                            }
                        }
                    } else if (ins is JsonPrimitive) {
                        steps.add(ScrapedStep(order++, ins.content))
                    }
                }
            }
            is JsonPrimitive -> {
                // Single block of text
                val splitSteps = rawInstructions.content.split("\n").filter { it.trim().isNotEmpty() }
                for (s in splitSteps) {
                    steps.add(ScrapedStep(order++, s.trim()))
                }
            }
            else -> {}
        }
    }

    // Parse nutrition
    val rawNutrition = recipe["nutrition"] as? JsonObject
    val caloriesVal = rawNutrition?.get("calories")?.jsonPrimitive?.content
        ?.filter { it.isDigit() || it == '.' }?.toDoubleOrNull() ?: 0.0
    val proteinVal = rawNutrition?.get("proteinContent")?.jsonPrimitive?.content
        ?.filter { it.isDigit() || it == '.' }?.toDoubleOrNull() ?: 0.0
    val fatVal = rawNutrition?.get("fatContent")?.jsonPrimitive?.content
        ?.filter { it.isDigit() || it == '.' }?.toDoubleOrNull() ?: 0.0
    val carbsVal = rawNutrition?.get("carbohydrateContent")?.jsonPrimitive?.content
        ?.filter { it.isDigit() || it == '.' }?.toDoubleOrNull() ?: 0.0

    val nutrition = ScrapedNutrition(
        caloriesPerServing = caloriesVal,
        proteinG = proteinVal,
        fatG = fatVal,
        carbsG = carbsVal
    )

    // Suggest tags based on titles/ingredients for standard tags
    val tags = mutableListOf<String>()
    val searchStr = (title + " " + ingredients.joinToString(" ") { it.name }).lowercase()
    if (searchStr.contains("vegan")) tags.add("vegan")
    else if (searchStr.contains("vegetarisch") || searchStr.contains("veggie")) tags.add("vegetarisch")
    
    if (searchStr.contains("glutenfrei") || searchStr.contains("gluten-free")) tags.add("glutenfrei")
    if (searchStr.contains("laktosefrei") || searchStr.contains("lactose-free")) tags.add("laktosefrei")
    if (searchStr.contains("low carb") || searchStr.contains("low-carb")) tags.add("low-carb")
    if (finalTime <= 30) tags.add("<30min")

    return ScrapedRecipe(
        title = title,
        servings = servings,
        cookingTimeMinutes = finalTime,
        source = url,
        dietaryTags = tags,
        ingredients = ingredients,
        steps = steps,
        nutrition = nutrition
    )
}

// Convert ISO-8601 Duration (e.g. PT30M, PT1H15M) to minutes
fun parseIsoDuration(durationStr: String?): Int? {
    if (durationStr == null || durationStr.isEmpty()) return null
    return try {
        val duration = Duration.parse(durationStr)
        duration.toMinutes().toInt()
    } catch (e: Exception) {
        // Fallback: match digits next to letters, e.g. "30m", "1h"
        val numberRegex = "\\d+".toRegex()
        val match = numberRegex.find(durationStr)
        match?.value?.toIntOrNull()
    }
}

// Crude regex/keyword-based parser to separate ingredient strings into amount, unit, and name
fun parseIngredientLine(line: String): ScrapedIngredient {
    val trimmed = line.trim()
    // Standard match format: e.g. "500 g Mehl", "2 EL Zucker", "3 Eier"
    val regex = """^([\d.,/\s½⅓¼¾]+)\s*(kg|g|ml|l|TL|EL|Tassen?|Tasse|Stück|Stk\.?|Prisen?|Prise|Zehen?|Zehe)?\s+(.+)$""".toRegex(RegexOption.IGNORE_CASE)
    val matchResult = regex.matchEntire(trimmed)
    
    if (matchResult != null) {
        val amountStr = matchResult.groupValues[1].trim()
        val unitStr = matchResult.groupValues[2].trim()
        val nameStr = matchResult.groupValues[3].trim()

        val amount = parseAmount(amountStr)
        val unit = normalizeUnit(unitStr)

        return ScrapedIngredient(nameStr, amount, unit)
    }

    // Alternate match: e.g. "Mehl (500g)"
    val altRegex = """^(.+)\s+\(([\d.,/\s½⅓¼¾]+)\s*(kg|g|ml|l|TL|EL|Tassen?|Tasse|Stück|Stk\.?|Prisen?|Prise)?\)$""".toRegex(RegexOption.IGNORE_CASE)
    val altMatch = altRegex.matchEntire(trimmed)
    if (altMatch != null) {
        val nameStr = altMatch.groupValues[1].trim()
        val amountStr = altMatch.groupValues[2].trim()
        val unitStr = altMatch.groupValues[3].trim()

        val amount = parseAmount(amountStr)
        val unit = normalizeUnit(unitStr)

        return ScrapedIngredient(nameStr, amount, unit)
    }

    // Default fallback: amount = 1, unit = Stück, name = original line
    // But check if the line starts with a number (e.g. "3 Eier")
    val numPrefixRegex = """^([\d.,/\s½⅓¼¾]+)\s+(.+)$""".toRegex()
    val numPrefixMatch = numPrefixRegex.matchEntire(trimmed)
    if (numPrefixMatch != null) {
        val amountStr = numPrefixMatch.groupValues[1].trim()
        val nameStr = numPrefixMatch.groupValues[2].trim()
        return ScrapedIngredient(nameStr, parseAmount(amountStr), "Stück")
    }

    return ScrapedIngredient(trimmed, 1.0, "Stück")
}

fun parseAmount(amountStr: String): Double {
    val clean = amountStr.replace(",", ".").replace(" ", "").trim()
    if (clean.contains("/")) {
        val parts = clean.split("/")
        if (parts.size == 2) {
            val num = parts[0].toDoubleOrNull()
            val den = parts[1].toDoubleOrNull()
            if (num != null && den != null && den != 0.0) {
                return num / den
            }
        }
    }
    // Handle standard Unicode fractions
    val fractionalValue = when (clean) {
        "½" -> 0.5
        "⅓" -> 0.33
        "¼" -> 0.25
        "¾" -> 0.75
        else -> null
    }
    if (fractionalValue != null) return fractionalValue

    return clean.toDoubleOrNull() ?: 1.0
}

fun normalizeUnit(unit: String): String {
    val clean = unit.lowercase().trim()
    return when {
        clean.startsWith("k") -> "kg"
        clean.startsWith("g") -> "g"
        clean.startsWith("ml") -> "ml"
        clean.startsWith("l") -> "l"
        clean.contains("tl") || clean.contains("teelöffel") -> "TL"
        clean.contains("el") || clean.contains("esslöffel") -> "EL"
        clean.contains("pr") || clean.contains("prise") -> "Prise"
        clean.contains("tasse") || clean.contains("cup") -> "Tasse"
        else -> "Stück"
    }
}
