package local.omni.device

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.security.KeyStore
import java.util.UUID
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class VaultKeyStoreTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val name = "omni-test-" + UUID.randomUUID().toString()
    private val alias = "$name-wrap"
    private fun store() = VaultKeyStore(context, name, alias)

    @After
    fun removeOnlyTestCredentials() {
        context.getSharedPreferences(name, Context.MODE_PRIVATE).edit().clear().commit()
        KeyStore.getInstance("AndroidKeyStore").apply {
            load(null)
            if (containsAlias(alias)) deleteEntry(alias)
        }
    }

    @Test
    fun keySurvivesStoreRecreationAndOnlyCiphertextIsPersisted() {
        val first = store().loadOrCreate(false)
        assertEquals(32, first.size)
        assertArrayEquals(first, store().loadOrCreate(true))
        val fields = context.getSharedPreferences(name, Context.MODE_PRIVATE).all
        assertEquals(setOf("version", "iv", "ciphertext"), fields.keys)
        assertFalse(fields.values.contains(android.util.Base64.encodeToString(first, android.util.Base64.NO_WRAP)))
        val wrapping = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.getKey(alias, null)
        assertNull(wrapping.encoded)
        first.fill(0)
    }

    @Test
    fun missingKeyForExistingVaultDoesNotCreateCredential() {
        try {
            store().loadOrCreate(true)
            fail("An existing vault must never receive a replacement key")
        } catch (error: VaultStoreException) {
            assertEquals("missing_key", error.code)
        }
        assertTrue(context.getSharedPreferences(name, Context.MODE_PRIVATE).all.isEmpty())
        assertFalse(KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.containsAlias(alias))
    }

    @Test
    fun corruptedEnvelopeIsNeverOverwritten() {
        store().loadOrCreate(false).fill(0)
        val preferences = context.getSharedPreferences(name, Context.MODE_PRIVATE)
        preferences.edit().putString("ciphertext", "corrupt").commit()
        try {
            store().loadOrCreate(false)
            fail("A corrupted envelope must fail closed")
        } catch (error: VaultStoreException) {
            assertEquals("invalid_key", error.code)
        }
        assertEquals("corrupt", preferences.getString("ciphertext", null))
    }

    @Test
    fun authenticatedEnvelopeRejectsModifiedCiphertext() {
        store().loadOrCreate(false).fill(0)
        val preferences = context.getSharedPreferences(name, Context.MODE_PRIVATE)
        val bytes = android.util.Base64.decode(preferences.getString("ciphertext", null), android.util.Base64.NO_WRAP)
        bytes[0] = (bytes[0].toInt() xor 1).toByte()
        val modified = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
        preferences.edit().putString("ciphertext", modified).commit()
        try {
            store().loadOrCreate(true)
            fail("An unauthenticated envelope must never be used")
        } catch (error: VaultStoreException) {
            assertEquals("invalid_key", error.code)
        }
        assertEquals(modified, preferences.getString("ciphertext", null))
    }

    @Test
    fun missingWrappingKeyDoesNotReplaceSavedEnvelope() {
        store().loadOrCreate(false).fill(0)
        val preferences = context.getSharedPreferences(name, Context.MODE_PRIVATE)
        val before = preferences.all
        KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(alias) }
        try {
            store().loadOrCreate(true)
            fail("A restored envelope without its wrapping key must fail closed")
        } catch (error: VaultStoreException) {
            assertEquals("missing_key", error.code)
        }
        assertEquals(before, preferences.all)
        assertFalse(KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.containsAlias(alias))
    }
}
