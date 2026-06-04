package com.omninom.routes

import com.omninom.models.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.*
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("SyncRoutes")

@Serializable
data class RecipeEntity(
    val id: String,
    val encrypted_payload: String,
    val photo_path: String?,
    val dietary_tags: List<String>,
    val rating: Int?,
    val updated_at: String,
    val is_deleted: Boolean
)

@Serializable
data class MealPlanEntity(
    val id: String,
    val recipe_id: String?,
    val week_date: String,
    val servings: Int,
    val updated_at: String
)

@Serializable
data class InventoryEntity(
    val id: String,
    val encrypted_payload: String,
    val updated_at: String
)

@Serializable
data class ShoppingListEntity(
    val id: String,
    val encrypted_payload: String,
    val is_checked: Boolean,
    val updated_at: String
)

@Serializable
data class SyncResponse(
    val recipes: List<RecipeEntity>,
    val meal_plan: List<MealPlanEntity>,
    val inventory: List<InventoryEntity>,
    val shopping_list: List<ShoppingListEntity>
)

@Serializable
data class SyncItem(
    val id: String,
    val entity_type: String, // "recipe", "meal_plan", "inventory", "shopping_list"
    val encrypted_payload: String? = null,
    val photo_path: String? = null,
    val dietary_tags: List<String>? = null,
    val rating: Int? = null,
    val recipe_id: String? = null,
    val week_date: String? = null,
    val servings: Int? = null,
    val is_checked: Boolean? = null,
    val updated_at: String,
    val is_deleted: Boolean = false
)

@Serializable
data class SyncConflictResponse(
    val message: String,
    val conflicts: List<SyncItem>
)

fun Route.syncRoutes(webSocketTracker: WebSocketTracker) {
    
    // GET /api/sync - Retrieve all data for the user
    get("/api/sync") {
        val principal = call.principal<JWTPrincipal>()
        val userIdStr = principal?.payload?.getClaim("user_id")?.asString() ?: return@get call.respond(HttpStatusCode.Unauthorized)
        val userUuid = UUID.fromString(userIdStr)

        val response = transaction {
            val recipesList = Recipes.selectAll().where { Recipes.userId eq userUuid }
                .map {
                    RecipeEntity(
                        id = it[Recipes.id].toString(),
                        encrypted_payload = it[Recipes.encryptedPayload],
                        photo_path = it[Recipes.photoPath],
                        dietary_tags = if (it[Recipes.dietaryTags].isEmpty()) emptyList() else it[Recipes.dietaryTags].split(","),
                        rating = it[Recipes.rating],
                        updated_at = it[Recipes.updatedAt].format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                        is_deleted = it[Recipes.isDeleted]
                    )
                }

            val mealPlansList = MealPlans.selectAll().where { MealPlans.userId eq userUuid }
                .map {
                    MealPlanEntity(
                        id = it[MealPlans.id].toString(),
                        recipe_id = it[MealPlans.recipeId]?.toString(),
                        week_date = it[MealPlans.weekDate].format(DateTimeFormatter.ISO_LOCAL_DATE),
                        servings = it[MealPlans.servings],
                        updated_at = it[MealPlans.updatedAt].format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                    )
                }

            val inventoryList = Inventories.selectAll().where { Inventories.userId eq userUuid }
                .map {
                    InventoryEntity(
                        id = it[Inventories.id].toString(),
                        encrypted_payload = it[Inventories.encryptedPayload],
                        updated_at = it[Inventories.updatedAt].format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                    )
                }

            val shoppingListList = ShoppingLists.selectAll().where { ShoppingLists.userId eq userUuid }
                .map {
                    ShoppingListEntity(
                        id = it[ShoppingLists.id].toString(),
                        encrypted_payload = it[ShoppingLists.encryptedPayload],
                        is_checked = it[ShoppingLists.isChecked],
                        updated_at = it[ShoppingLists.updatedAt].format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                    )
                }

            SyncResponse(recipesList, mealPlansList, inventoryList, shoppingListList)
        }

        call.respond(response)
    }

    // POST /api/sync - Sync local updates to server
    post("/api/sync") {
        val principal = call.principal<JWTPrincipal>()
        val userIdStr = principal?.payload?.getClaim("user_id")?.asString() ?: return@post call.respond(HttpStatusCode.Unauthorized)
        val userUuid = UUID.fromString(userIdStr)

        val incomingItems = try {
            call.receive<List<SyncItem>>()
        } catch (e: Exception) {
            call.respond(HttpStatusCode.BadRequest, "Invalid payload formatting: ${e.message}")
            return@post
        }

        val conflicts = mutableListOf<SyncItem>()

        // 1. Conflict detection phase
        transaction {
            for (item in incomingItems) {
                val itemId = UUID.fromString(item.id)
                val incomingUpdatedAt = parseDateTime(item.updated_at)

                when (item.entity_type) {
                    "recipe" -> {
                        val existing = Recipes.selectAll().where { (Recipes.id eq itemId) and (Recipes.userId eq userUuid) }.firstOrNull()
                        if (existing != null) {
                            val dbUpdatedAt = existing[Recipes.updatedAt]
                            if (dbUpdatedAt.isAfter(incomingUpdatedAt)) {
                                conflicts.add(
                                    SyncItem(
                                        id = existing[Recipes.id].toString(),
                                        entity_type = "recipe",
                                        encrypted_payload = existing[Recipes.encryptedPayload],
                                        photo_path = existing[Recipes.photoPath],
                                        dietary_tags = if (existing[Recipes.dietaryTags].isEmpty()) emptyList() else existing[Recipes.dietaryTags].split(","),
                                        rating = existing[Recipes.rating],
                                        updated_at = existing[Recipes.updatedAt].format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                                        is_deleted = existing[Recipes.isDeleted]
                                    )
                                )
                            }
                        }
                    }
                    "meal_plan" -> {
                        val existing = MealPlans.selectAll().where { (MealPlans.id eq itemId) and (MealPlans.userId eq userUuid) }.firstOrNull()
                        if (existing != null) {
                            val dbUpdatedAt = existing[MealPlans.updatedAt]
                            if (dbUpdatedAt.isAfter(incomingUpdatedAt)) {
                                conflicts.add(
                                    SyncItem(
                                        id = existing[MealPlans.id].toString(),
                                        entity_type = "meal_plan",
                                        recipe_id = existing[MealPlans.recipeId]?.toString(),
                                        week_date = existing[MealPlans.weekDate].format(DateTimeFormatter.ISO_LOCAL_DATE),
                                        servings = existing[MealPlans.servings],
                                        updated_at = existing[MealPlans.updatedAt].format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                                        is_deleted = false
                                    )
                                )
                            }
                        }
                    }
                    "inventory" -> {
                        val existing = Inventories.selectAll().where { (Inventories.id eq itemId) and (Inventories.userId eq userUuid) }.firstOrNull()
                        if (existing != null) {
                            val dbUpdatedAt = existing[Inventories.updatedAt]
                            if (dbUpdatedAt.isAfter(incomingUpdatedAt)) {
                                conflicts.add(
                                    SyncItem(
                                        id = existing[Inventories.id].toString(),
                                        entity_type = "inventory",
                                        encrypted_payload = existing[Inventories.encryptedPayload],
                                        updated_at = existing[Inventories.updatedAt].format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                                        is_deleted = false
                                    )
                                )
                            }
                        }
                    }
                    "shopping_list" -> {
                        val existing = ShoppingLists.selectAll().where { (ShoppingLists.id eq itemId) and (ShoppingLists.userId eq userUuid) }.firstOrNull()
                        if (existing != null) {
                            val dbUpdatedAt = existing[ShoppingLists.updatedAt]
                            if (dbUpdatedAt.isAfter(incomingUpdatedAt)) {
                                conflicts.add(
                                    SyncItem(
                                        id = existing[ShoppingLists.id].toString(),
                                        entity_type = "shopping_list",
                                        encrypted_payload = existing[ShoppingLists.encryptedPayload],
                                        is_checked = existing[ShoppingLists.isChecked],
                                        updated_at = existing[ShoppingLists.updatedAt].format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                                        is_deleted = false
                                    )
                                )
                            }
                        }
                    }
                }
            }
        }

        // If conflicts are found, respond with 409 and return the database version
        if (conflicts.isNotEmpty()) {
            call.respond(
                HttpStatusCode.Conflict,
                SyncConflictResponse(
                    message = "Kollisionen erkannt – neuere Daten existieren auf dem Server",
                    conflicts = conflicts
                )
            )
            return@post
        }

        // 2. Resolution/Write phase
        transaction {
            val sortedItems = incomingItems.sortedBy {
                when (it.entity_type) {
                    "recipe" -> 1
                    "inventory" -> 2
                    "shopping_list" -> 3
                    "meal_plan" -> 4
                    else -> 5
                }
            }

            for (item in sortedItems) {
                val itemId = UUID.fromString(item.id)
                val incomingUpdatedAt = parseDateTime(item.updated_at)

                when (item.entity_type) {
                    "recipe" -> {
                        val existing = Recipes.selectAll().where { (Recipes.id eq itemId) and (Recipes.userId eq userUuid) }.firstOrNull()
                        if (existing != null) {
                            Recipes.update({ Recipes.id eq itemId }) {
                                it[encryptedPayload] = item.encrypted_payload ?: ""
                                it[photoPath] = item.photo_path
                                it[dietaryTags] = item.dietary_tags?.joinToString(",") ?: ""
                                it[rating] = item.rating
                                it[updatedAt] = incomingUpdatedAt
                                it[isDeleted] = item.is_deleted
                            }
                        } else {
                            Recipes.insert {
                                it[id] = itemId
                                it[userId] = userUuid
                                it[encryptedPayload] = item.encrypted_payload ?: ""
                                it[photoPath] = item.photo_path
                                it[dietaryTags] = item.dietary_tags?.joinToString(",") ?: ""
                                it[rating] = item.rating
                                it[updatedAt] = incomingUpdatedAt
                                it[isDeleted] = item.is_deleted
                            }
                        }
                    }
                    "meal_plan" -> {
                        if (item.is_deleted) {
                            MealPlans.deleteWhere { MealPlans.id eq itemId }
                        } else {
                            val recipeUuid = item.recipe_id?.let { UUID.fromString(it) }
                            val verifiedRecipeUuid = if (recipeUuid != null && Recipes.selectAll().where { Recipes.id eq recipeUuid }.count() > 0) {
                                recipeUuid
                            } else {
                                if (recipeUuid != null) {
                                    logger.warn("Recipe $recipeUuid referenced in meal plan item $itemId does not exist. Setting recipe_id to null.")
                                }
                                null
                            }

                            val date = LocalDate.parse(item.week_date, DateTimeFormatter.ISO_LOCAL_DATE)
                            val existing = MealPlans.selectAll().where { (MealPlans.id eq itemId) and (MealPlans.userId eq userUuid) }.firstOrNull()
                            if (existing != null) {
                                MealPlans.update({ MealPlans.id eq itemId }) {
                                    it[recipeId] = verifiedRecipeUuid
                                    it[weekDate] = date
                                    it[servings] = item.servings ?: 2
                                    it[updatedAt] = incomingUpdatedAt
                                }
                            } else {
                                MealPlans.insert {
                                    it[id] = itemId
                                    it[userId] = userUuid
                                    it[recipeId] = verifiedRecipeUuid
                                    it[weekDate] = date
                                    it[servings] = item.servings ?: 2
                                    it[updatedAt] = incomingUpdatedAt
                                }
                            }
                        }
                    }
                    "inventory" -> {
                        if (item.is_deleted) {
                            Inventories.deleteWhere { Inventories.id eq itemId }
                        } else {
                            val existing = Inventories.selectAll().where { (Inventories.id eq itemId) and (Inventories.userId eq userUuid) }.firstOrNull()
                            if (existing != null) {
                                Inventories.update({ Inventories.id eq itemId }) {
                                    it[encryptedPayload] = item.encrypted_payload ?: ""
                                    it[updatedAt] = incomingUpdatedAt
                                }
                            } else {
                                Inventories.insert {
                                    it[id] = itemId
                                    it[userId] = userUuid
                                    it[encryptedPayload] = item.encrypted_payload ?: ""
                                    it[updatedAt] = incomingUpdatedAt
                                }
                            }
                        }
                    }
                    "shopping_list" -> {
                        if (item.is_deleted) {
                            ShoppingLists.deleteWhere { ShoppingLists.id eq itemId }
                        } else {
                            val existing = ShoppingLists.selectAll().where { (ShoppingLists.id eq itemId) and (ShoppingLists.userId eq userUuid) }.firstOrNull()
                            if (existing != null) {
                                ShoppingLists.update({ ShoppingLists.id eq itemId }) {
                                    it[encryptedPayload] = item.encrypted_payload ?: ""
                                    it[isChecked] = item.is_checked ?: false
                                    it[updatedAt] = incomingUpdatedAt
                                }
                            } else {
                                ShoppingLists.insert {
                                    it[id] = itemId
                                    it[userId] = userUuid
                                    it[encryptedPayload] = item.encrypted_payload ?: ""
                                    it[isChecked] = item.is_checked ?: false
                                    it[updatedAt] = incomingUpdatedAt
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Broadcast changes in background via WebSockets
        for (item in incomingItems) {
            val itemId = UUID.fromString(item.id)
            webSocketTracker.broadcast(userUuid, item.entity_type, itemId)
        }

        call.respond(HttpStatusCode.OK, "Synchronisation erfolgreich")
    }
}

private fun parseDateTime(dateStr: String): LocalDateTime {
    return try {
        LocalDateTime.parse(dateStr, DateTimeFormatter.ISO_LOCAL_DATE_TIME)
    } catch (e: Exception) {
        try {
            java.time.Instant.parse(dateStr)
                .atZone(java.time.ZoneOffset.UTC)
                .toLocalDateTime()
        } catch (e2: Exception) {
            java.time.ZonedDateTime.parse(dateStr)
                .withZoneSameInstant(java.time.ZoneOffset.UTC)
                .toLocalDateTime()
        }
    }
}
