package com.omninom.utils

import com.omninom.models.DbSettings
import com.omninom.models.Users
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.*
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

fun hkdfExtract(salt: ByteArray, ikm: ByteArray): ByteArray {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(salt, "HmacSHA256"))
    return mac.doFinal(ikm)
}

fun hkdfExpand(prk: ByteArray, info: ByteArray, length: Int): ByteArray {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(prk, "HmacSHA256"))
    val okm = ByteArray(length)
    var t = ByteArray(0)
    var i = 1
    var offset = 0
    while (offset < length) {
        mac.update(t)
        mac.update(info)
        mac.update(i.toByte())
        t = mac.doFinal()
        val chunk = minOf(t.size, length - offset)
        System.arraycopy(t, 0, okm, offset, chunk)
        offset += chunk
        i++
    }
    return okm
}

fun hkdf(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
    val prk = hkdfExtract(salt, ikm)
    return hkdfExpand(prk, info, length)
}

fun sha256(input: ByteArray): String {
    val md = MessageDigest.getInstance("SHA-256")
    val digest = md.digest(input)
    return digest.joinToString("") { "%02x".format(it) }
}

fun generateUserMain() {
    println("Initializing database connection for user seeding...")
    
    // 1. Generate random UUID for user
    val userId = UUID.randomUUID()

    // 2. Generate random 32-byte master key
    val random = SecureRandom()
    val masterKeyBytes = ByteArray(32)
    random.nextBytes(masterKeyBytes)
    val masterKeyHex = masterKeyBytes.joinToString("") { "%02x".format(it) }

    // 3. Derive Auth Key via HKDF (must match React frontend deriveKeys)
    val salt = "auth_v1".toByteArray(Charsets.UTF_8)
    val info = "OmniNom Auth".toByteArray(Charsets.UTF_8)
    val authKeyBytes = hkdf(masterKeyBytes, salt, info, 32)

    // 4. Hash the derived Auth Key (this is what's verified on login)
    val authKeyHash = sha256(authKeyBytes)

    // 5. Connect and Insert User
    DbSettings.init()
    transaction {
        Users.insert {
            it[id] = userId
            it[this.authKeyHash] = authKeyHash
        }
    }

    val serverUrl = System.getenv("SERVER_URL") ?: "http://localhost"
    
    println("\n=== SEED USER SUCCESS ===")
    println("User UUID: $userId")
    println("Master Key Hex: $masterKeyHex")
    println("Auth Key Hash: $authKeyHash")
    println("==========================\n")
    
    // Output JSON strictly bounded by markers so generate-qr.sh script can parse it
    println("===JSON_START===")
    println("""{"s":"$serverUrl","u":"$userId","m":"$masterKeyHex"}""")
    println("===JSON_END===")
}
