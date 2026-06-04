package com.omninom.models

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SchemaUtils
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.date
import org.jetbrains.exposed.sql.javatime.datetime
import org.jetbrains.exposed.sql.transactions.transaction
import org.slf4j.LoggerFactory
import java.time.LocalDateTime

private val logger = LoggerFactory.getLogger("DatabaseConfig")

// Table Definitions

object Users : Table("users") {
    val id = uuid("id")
    val authKeyHash = varchar("auth_key_hash", 64)
    val createdAt = datetime("created_at").default(LocalDateTime.now())
    val googleId = varchar("google_id", 255).nullable()
    val email = varchar("email", 255).nullable()
    val encryptedMasterKey = text("encrypted_master_key").nullable()
    override val primaryKey = PrimaryKey(id)
}

object Recipes : Table("recipes") {
    val id = uuid("id")
    val userId = uuid("user_id").references(Users.id)
    val encryptedPayload = text("encrypted_payload")
    val photoPath = varchar("photo_path", 512).nullable()
    val dietaryTags = varchar("dietary_tags", 1024).default("") // Comma-separated list for simplicity
    val rating = integer("rating").nullable()
    val updatedAt = datetime("updated_at")
    val isDeleted = bool("is_deleted").default(false)
    override val primaryKey = PrimaryKey(id)
}

object MealPlans : Table("meal_plan") {
    val id = uuid("id")
    val userId = uuid("user_id").references(Users.id)
    val recipeId = uuid("recipe_id").references(Recipes.id).nullable()
    val weekDate = date("week_date")
    val servings = integer("servings").default(2)
    val updatedAt = datetime("updated_at")
    override val primaryKey = PrimaryKey(id)
}

object Inventories : Table("inventory") {
    val id = uuid("id")
    val userId = uuid("user_id").references(Users.id)
    val encryptedPayload = text("encrypted_payload")
    val updatedAt = datetime("updated_at")
    override val primaryKey = PrimaryKey(id)
}

object ShoppingLists : Table("shopping_list") {
    val id = uuid("id")
    val userId = uuid("user_id").references(Users.id)
    val encryptedPayload = text("encrypted_payload")
    val isChecked = bool("is_checked").default(false)
    val updatedAt = datetime("updated_at")
    override val primaryKey = PrimaryKey(id)
}

object InviteTokens : Table("invite_tokens") {
    val id = uuid("id")
    val token = uuid("token")
    val userId = uuid("user_id").references(Users.id)
    val expiresAt = datetime("expires_at")
    override val primaryKey = PrimaryKey(id)
}

object AiSettings : Table("ai_settings") {
    val id = varchar("id", 36).default("global")
    val encryptedPayload = text("encrypted_payload")
    val updatedAt = datetime("updated_at")
    override val primaryKey = PrimaryKey(id)
}

// Database Connection Helper

object DbSettings {
    fun init() {
        val host = System.getenv("DB_HOST") ?: "localhost"
        val port = System.getenv("POSTGRES_PORT") ?: "5432"
        val dbName = System.getenv("POSTGRES_DB") ?: "omninom"
        val user = System.getenv("POSTGRES_USER") ?: "omninom_user"
        val password = System.getenv("POSTGRES_PASSWORD") ?: ""

        val config = HikariConfig().apply {
            driverClassName = "org.postgresql.Driver"
            jdbcUrl = "jdbc:postgresql://$host:$port/$dbName"
            username = user
            this.password = password
            maximumPoolSize = 10
            isAutoCommit = false
            transactionIsolation = "TRANSACTION_REPEATABLE_READ"
            validate()
        }

        // Retry database connection on startup (PostgreSQL container might still be starting up)
        var connected = false
        var retries = 10
        var dataSource: HikariDataSource? = null
        
        while (!connected && retries > 0) {
            try {
                logger.info("Connecting to PostgreSQL at jdbc:postgresql://$host:$port/$dbName...")
                dataSource = HikariDataSource(config)
                Database.connect(dataSource)
                connected = true
                logger.info("Successfully connected to the database!")
            } catch (e: Exception) {
                retries--
                logger.warn("Failed to connect to database. Retries remaining: $retries. Error: ${e.message}")
                if (retries > 0) {
                    Thread.sleep(2000)
                } else {
                    throw e
                }
            }
        }

        // Auto-create Tables
        transaction {
            SchemaUtils.createMissingTablesAndColumns(
                Users,
                Recipes,
                MealPlans,
                Inventories,
                ShoppingLists,
                InviteTokens,
                AiSettings
            )
            logger.info("Database tables verified/created successfully.")
        }
    }
}

