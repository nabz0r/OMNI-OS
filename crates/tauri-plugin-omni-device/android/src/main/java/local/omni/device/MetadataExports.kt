package local.omni.device

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

internal object MetadataExports {
    fun prepare(context: Context, name: String, contents: String, mime: String): Uri {
        val bytes = contents.toByteArray(Charsets.UTF_8)
        val validName = name.startsWith("omni-") && name.length <= 120 && !name.contains("..") &&
            name.all { it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' || it in "-_." }
        val validType = (name.endsWith(".json") && mime == "application/json") ||
            (name.endsWith(".csv") && mime == "text/csv")
        if (!validName || !validType || bytes.size > 2 * 1024 * 1024) {
            throw VaultStoreException("invalid_export")
        }
        val directory = File(context.cacheDir, "omni-exports/" + UUID.randomUUID().toString())
        if (!directory.mkdirs()) throw VaultStoreException("export_unavailable")
        val file = File(directory, name)
        FileOutputStream(file).use {
            it.write(bytes)
            it.fd.sync()
        }
        return FileProvider.getUriForFile(context, context.packageName + ".omni.exports", file)
    }
}
