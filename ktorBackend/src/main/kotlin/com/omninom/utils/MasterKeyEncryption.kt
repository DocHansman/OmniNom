package com.omninom.utils

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

object MasterKeyEncryption {

    private val secret: String
        get() = System.getenv("JWT_SECRET") ?: "default_secret_key_which_must_be_changed"

    private fun getSecretKey(): SecretKeySpec {
        val digest = MessageDigest.getInstance("SHA-256")
        val keyBytes = digest.digest(secret.toByteArray(Charsets.UTF_8))
        return SecretKeySpec(keyBytes, "AES")
    }

    fun encryptMasterKey(masterKeyHex: String): String {
        val secretKey = getSecretKey()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        
        val iv = ByteArray(12)
        SecureRandom().nextBytes(iv)
        val spec = GCMParameterSpec(128, iv)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, spec)
        
        val inputBytes = masterKeyHex.toByteArray(Charsets.UTF_8)
        val cipherText = cipher.doFinal(inputBytes)
        
        val combined = ByteArray(iv.size + cipherText.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(cipherText, 0, combined, iv.size, cipherText.size)
        
        return Base64.getEncoder().encodeToString(combined)
    }

    fun decryptMasterKey(encryptedBase64: String): String {
        val combined = Base64.getDecoder().decode(encryptedBase64)
        if (combined.size < 12) {
            throw IllegalArgumentException("Invalid encrypted key length")
        }
        
        val iv = ByteArray(12)
        System.arraycopy(combined, 0, iv, 0, 12)
        
        val cipherText = ByteArray(combined.size - 12)
        System.arraycopy(combined, 12, cipherText, 0, cipherText.size)
        
        val secretKey = getSecretKey()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val spec = GCMParameterSpec(128, iv)
        cipher.init(Cipher.DECRYPT_MODE, secretKey, spec)
        
        val decryptedBytes = cipher.doFinal(cipherText)
        return String(decryptedBytes, Charsets.UTF_8)
    }
}
