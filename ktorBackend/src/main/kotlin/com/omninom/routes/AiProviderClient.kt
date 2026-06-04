package com.omninom.routes

import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.serialization.json.*

suspend fun callTextModel(
    provider: String,
    apiKey: String,
    model: String,
    systemPrompt: String,
    userPrompt: String,
    httpClient: HttpClient
): String {
    val finalModel = if (provider.lowercase() != "openrouter" && model.contains("/")) {
        model.substringAfter("/")
    } else {
        model
    }

    val response = when (provider.lowercase()) {
        "openrouter" -> {
            httpClient.post("https://openrouter.ai/api/v1/chat/completions") {
                header(HttpHeaders.Authorization, "Bearer $apiKey")
                header(HttpHeaders.ContentType, ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("model", finalModel)
                    putJsonArray("messages") {
                        addJsonObject {
                            put("role", "system")
                            put("content", systemPrompt)
                        }
                        addJsonObject {
                            put("role", "user")
                            put("content", userPrompt)
                        }
                    }
                })
            }
        }
        "anthropic" -> {
            httpClient.post("https://api.anthropic.com/v1/messages") {
                header("x-api-key", apiKey)
                header("anthropic-version", "2023-06-01")
                header(HttpHeaders.ContentType, ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("model", finalModel)
                    put("max_tokens", 4096)
                    put("system", systemPrompt)
                    putJsonArray("messages") {
                        addJsonObject {
                            put("role", "user")
                            put("content", userPrompt)
                        }
                    }
                })
            }
        }
        "gemini" -> {
            httpClient.post("https://generativelanguage.googleapis.com/v1beta/models/$finalModel:generateContent?key=$apiKey") {
                header(HttpHeaders.ContentType, ContentType.Application.Json)
                setBody(buildJsonObject {
                    putJsonArray("contents") {
                        addJsonObject {
                            put("role", "user")
                            putJsonArray("parts") {
                                addJsonObject {
                                    put("text", systemPrompt + "\n\n" + userPrompt)
                                }
                            }
                        }
                    }
                })
            }
        }
        "openai" -> {
            httpClient.post("https://api.openai.com/v1/chat/completions") {
                header(HttpHeaders.Authorization, "Bearer $apiKey")
                header(HttpHeaders.ContentType, ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("model", finalModel)
                    putJsonArray("messages") {
                        addJsonObject {
                            put("role", "system")
                            put("content", systemPrompt)
                        }
                        addJsonObject {
                            put("role", "user")
                            put("content", userPrompt)
                        }
                    }
                })
            }
        }
        else -> throw IllegalArgumentException("Unbekannter KI-Anbieter: $provider")
    }

    if (response.status != HttpStatusCode.OK) {
        val errorMsg = response.bodyAsText()
        throw Exception("API-Fehler von $provider (${response.status}): $errorMsg")
    }

    val responseJson = Json.parseToJsonElement(response.bodyAsText()).jsonObject
    val rawText = when (provider.lowercase()) {
        "openrouter", "openai" -> {
            responseJson["choices"]?.jsonArray?.firstOrNull()?.jsonObject
                ?.get("message")?.jsonObject?.get("content")?.jsonPrimitive?.content ?: ""
        }
        "anthropic" -> {
            responseJson["content"]?.jsonArray?.firstOrNull()?.jsonObject
                ?.get("text")?.jsonPrimitive?.content ?: ""
        }
        "gemini" -> {
            responseJson["candidates"]?.jsonArray?.firstOrNull()?.jsonObject
                ?.get("content")?.jsonObject?.get("parts")?.jsonArray?.firstOrNull()?.jsonObject
                ?.get("text")?.jsonPrimitive?.content ?: ""
        }
        else -> ""
    }

    return cleanMarkdownJson(rawText)
}

suspend fun callVisionModel(
    provider: String,
    apiKey: String,
    model: String,
    systemPrompt: String,
    userPrompt: String,
    imageBase64: String,
    imageMime: String,
    httpClient: HttpClient
): String {
    val finalModel = if (provider.lowercase() != "openrouter" && model.contains("/")) {
        model.substringAfter("/")
    } else {
        model
    }

    val response = when (provider.lowercase()) {
        "openrouter" -> {
            httpClient.post("https://openrouter.ai/api/v1/chat/completions") {
                header(HttpHeaders.Authorization, "Bearer $apiKey")
                header(HttpHeaders.ContentType, ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("model", finalModel)
                    putJsonArray("messages") {
                        addJsonObject {
                            put("role", "system")
                            put("content", systemPrompt)
                        }
                        addJsonObject {
                            put("role", "user")
                            putJsonArray("content") {
                                addJsonObject {
                                    put("type", "text")
                                    put("text", userPrompt)
                                }
                                addJsonObject {
                                    put("type", "image_url")
                                    putJsonObject("image_url") {
                                        put("url", "data:$imageMime;base64,$imageBase64")
                                    }
                                }
                            }
                        }
                    }
                })
            }
        }
        "gemini" -> {
            httpClient.post("https://generativelanguage.googleapis.com/v1beta/models/$finalModel:generateContent?key=$apiKey") {
                header(HttpHeaders.ContentType, ContentType.Application.Json)
                setBody(buildJsonObject {
                    putJsonArray("contents") {
                        addJsonObject {
                            put("role", "user")
                            putJsonArray("parts") {
                                addJsonObject {
                                    put("text", systemPrompt + "\n\n" + userPrompt)
                                }
                                addJsonObject {
                                    putJsonObject("inlineData") {
                                        put("mimeType", imageMime)
                                        put("data", imageBase64)
                                    }
                                }
                            }
                        }
                    }
                })
            }
        }
        "anthropic" -> {
            httpClient.post("https://api.anthropic.com/v1/messages") {
                header("x-api-key", apiKey)
                header("anthropic-version", "2023-06-01")
                header(HttpHeaders.ContentType, ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("model", finalModel)
                    put("max_tokens", 4096)
                    put("system", systemPrompt)
                    putJsonArray("messages") {
                        addJsonObject {
                            put("role", "user")
                            putJsonArray("content") {
                                addJsonObject {
                                    put("type", "image")
                                    putJsonObject("source") {
                                        put("type", "base64")
                                        put("media_type", imageMime)
                                        put("data", imageBase64)
                                    }
                                }
                                addJsonObject {
                                    put("type", "text")
                                    put("text", userPrompt)
                                }
                            }
                        }
                    }
                })
            }
        }
        "openai" -> {
            httpClient.post("https://api.openai.com/v1/chat/completions") {
                header(HttpHeaders.Authorization, "Bearer $apiKey")
                header(HttpHeaders.ContentType, ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("model", finalModel)
                    putJsonArray("messages") {
                        addJsonObject {
                            put("role", "system")
                            put("content", systemPrompt)
                        }
                        addJsonObject {
                            put("role", "user")
                            putJsonArray("content") {
                                addJsonObject {
                                    put("type", "text")
                                    put("text", userPrompt)
                                }
                                addJsonObject {
                                    put("type", "image_url")
                                    putJsonObject("image_url") {
                                        put("url", "data:$imageMime;base64,$imageBase64")
                                    }
                                }
                            }
                        }
                    }
                })
            }
        }
        else -> throw IllegalArgumentException("Unbekannter KI-Anbieter für Vision: $provider")
    }

    if (response.status != HttpStatusCode.OK) {
        val errorMsg = response.bodyAsText()
        throw Exception("API-Fehler von $provider (${response.status}): $errorMsg")
    }

    val responseJson = Json.parseToJsonElement(response.bodyAsText()).jsonObject
    val rawText = when (provider.lowercase()) {
        "openrouter", "openai" -> {
            responseJson["choices"]?.jsonArray?.firstOrNull()?.jsonObject
                ?.get("message")?.jsonObject?.get("content")?.jsonPrimitive?.content ?: ""
        }
        "anthropic" -> {
            responseJson["content"]?.jsonArray?.firstOrNull()?.jsonObject
                ?.get("text")?.jsonPrimitive?.content ?: ""
        }
        "gemini" -> {
            responseJson["candidates"]?.jsonArray?.firstOrNull()?.jsonObject
                ?.get("content")?.jsonObject?.get("parts")?.jsonArray?.firstOrNull()?.jsonObject
                ?.get("text")?.jsonPrimitive?.content ?: ""
        }
        else -> ""
    }

    return cleanMarkdownJson(rawText)
}

private fun cleanMarkdownJson(raw: String): String {
    var cleanContent = raw.trim()
    if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.substringAfter("```json")
    } else if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.substringAfter("```")
    }
    if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.substringBeforeLast("```")
    }
    return cleanContent.trim()
}
