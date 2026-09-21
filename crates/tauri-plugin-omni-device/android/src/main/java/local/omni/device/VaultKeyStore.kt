package local.omni.device

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.io.File
import java.io.RandomAccessFile
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal class VaultStoreException(val code: String) : Exception(code)

/**
 * AndroidKeyStore keeps the wrapping key non-exportable. Only an authenticated
 * encrypted envelope is persisted; SQLCipher receives the unwrapped 32 bytes.
 * Hardware backing depends on the device and is not assumed.
 */
internal class VaultKeyStore(
    private val context: Context,
    private val preferencesName: String = "local.omni.device.vault-key.v1",
    private val alias: String = "local.omni.device.vault-wrap.v1",
) {
    private val aad = "OMNI SQLCipher vault key v1".toByteArray(Charsets.UTF_8)

    fun loadOrCreate(vaultExists: Boolean): ByteArray {
        // The file is an empty synchronization primitive, never a key file.
        val lockFile = File(context.noBackupFilesDir, "$preferencesName.lock")
        RandomAccessFile(lockFile, "rw").use { file ->
            file.channel.use { channel ->
                channel.lock().use {
                    return loadLocked(vaultExists)
                }
            }
        }
    }

    private fun loadLocked(vaultExists: Boolean): ByteArray {
        val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val hasEnvelope = preferences.contains("ciphertext") || preferences.contains("iv") ||
            preferences.contains("version")
        if (hasEnvelope) {
            if (preferences.getInt("version", 0) != 1) throw VaultStoreException("invalid_key")
            val ciphertext = decode(preferences.getString("ciphertext", null), 48)
            val iv = decode(preferences.getString("iv", null), 12)
            val wrappingKey = keyStore.getKey(alias, null) as? SecretKey
                ?: throw VaultStoreException("missing_key")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, wrappingKey, GCMParameterSpec(128, iv))
            cipher.updateAAD(aad)
            val value = try {
                cipher.doFinal(ciphertext)
            } catch (_: javax.crypto.AEADBadTagException) {
                throw VaultStoreException("invalid_key")
            }
            if (value.size != 32) {
                value.fill(0)
                throw VaultStoreException("invalid_key")
            }
            return value
        }
        if (vaultExists) throw VaultStoreException("missing_key")

        val wrappingKey = if (keyStore.containsAlias(alias)) {
            keyStore.getKey(alias, null) as? SecretKey ?: throw VaultStoreException("invalid_key")
        } else {
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
                init(
                    KeyGenParameterSpec.Builder(
                        alias,
                        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                    )
                        .setKeySize(256)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setRandomizedEncryptionRequired(true)
                        .build(),
                )
            }.generateKey()
        }
        val value = ByteArray(32)
        try {
            SecureRandom().nextBytes(value)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, wrappingKey)
            cipher.updateAAD(aad)
            val ciphertext = cipher.doFinal(value)
            if (cipher.iv.size != 12 || ciphertext.size != 48) throw VaultStoreException("key_persistence")
            val saved = preferences.edit()
                .putInt("version", 1)
                .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                .putString("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .commit()
            if (!saved) throw VaultStoreException("key_persistence")
            // Verify authenticated readback before the caller can create a vault.
            val verified = loadLocked(true)
            try {
                if (!value.contentEquals(verified)) throw VaultStoreException("key_persistence")
            } finally {
                verified.fill(0)
            }
            return value.copyOf()
        } finally {
            value.fill(0)
        }
    }

    private fun decode(encoded: String?, expectedLength: Int): ByteArray {
        if (encoded == null || encoded.length > 128) throw VaultStoreException("invalid_key")
        val value = try {
            Base64.decode(encoded, Base64.NO_WRAP)
        } catch (_: IllegalArgumentException) {
            throw VaultStoreException("invalid_key")
        }
        if (value.size != expectedLength) throw VaultStoreException("invalid_key")
        return value
    }
}
