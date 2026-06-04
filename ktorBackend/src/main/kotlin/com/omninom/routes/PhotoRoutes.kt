package com.omninom.routes

import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.utils.io.readRemaining
import kotlinx.io.readByteArray
import kotlinx.serialization.Serializable
import org.slf4j.LoggerFactory
import java.io.File
import java.util.*

private val logger = LoggerFactory.getLogger("PhotoRoutes")

@Serializable
data class PhotoUploadResponse(val photo_path: String)

fun Route.photoRoutes() {
    
    // Nginx JWT cookie verification hook
    get("/api/photos/verify") {
        // If the request passes the Ktor "auth-jwt" authentication block,
        // it means the JWT cookie is valid.
        // Nginx's auth_request module expects a 2xx response for success.
        call.respond(HttpStatusCode.OK, "Authorized")
    }

    // Photo Upload Endpoint
    post("/api/photos") {
        try {
            val multipart = call.receiveMultipart()
            var fileBytes: ByteArray? = null
            var originalFileName: String? = null

            multipart.forEachPart { part ->
                if (part is PartData.FileItem) {
                    originalFileName = part.originalFileName
                    fileBytes = part.provider().readRemaining().readByteArray()
                }
                part.dispose()
            }

            if (fileBytes == null || fileBytes!!.isEmpty()) {
                call.respond(HttpStatusCode.BadRequest, "Keine Fotodatei empfangen")
                return@post
            }

            // Verify file size (5MB limit)
            if (fileBytes!!.size > 5 * 1024 * 1024) {
                call.respond(HttpStatusCode.BadRequest, "Fotodatei überschreitet das Limit von 5MB")
                return@post
            }

            // Ensure directory exists
            val photoDir = File("/data/photos")
            if (!photoDir.exists()) {
                photoDir.mkdirs()
            }

            // Generate unique filename preserving extension
            val ext = originalFileName?.substringAfterLast('.', "jpg") ?: "jpg"
            val uniqueName = "${UUID.randomUUID()}.$ext"
            val file = File(photoDir, uniqueName)

            // Save bytes
            file.writeBytes(fileBytes!!)

            logger.info("Saved recipe photo: ${file.absolutePath} (${fileBytes!!.size} bytes)")

            // Return relative path for frontend referencing
            call.respond(PhotoUploadResponse("/photos/$uniqueName"))

        } catch (e: Exception) {
            logger.error("Error uploading photo: ", e)
            call.respond(HttpStatusCode.InternalServerError, "Fehler beim Upload des Fotos: ${e.message}")
        }
    }
}
