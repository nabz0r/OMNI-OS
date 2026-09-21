package local.omni.device

import android.app.Activity
import android.content.Intent
import android.content.ClipData
import android.net.Uri
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import java.util.concurrent.Executors

@InvokeArg
class VaultKeyArgs {
    var vaultExists: Boolean = false
}

@InvokeArg
class MetadataExportArgs {
    var name: String = ""
    var contents: String = ""
    var mime: String = ""
}

@TauriPlugin
class OmniDevicePlugin(private val activity: Activity) : Plugin(activity) {
    private val worker = Executors.newSingleThreadExecutor()
    private val store = VaultKeyStore(activity.applicationContext)

    override fun onDestroy(activity: AppCompatActivity) {
        worker.shutdown()
    }

    @Command
    fun saveExport(invoke: Invoke) {
        val args = try {
            invoke.parseArgs(MetadataExportArgs::class.java)
        } catch (_: Exception) {
            invoke.reject("The metadata export is invalid.", "invalid_export")
            return
        }
        worker.execute {
            try {
                val uri = MetadataExports.prepare(activity.applicationContext, args.name, args.contents, args.mime)
                activity.runOnUiThread {
                    try {
                        val send = Intent(Intent.ACTION_SEND).apply {
                            type = args.mime
                            putExtra(Intent.EXTRA_STREAM, uri)
                            clipData = ClipData.newRawUri("OMNI metadata export", uri)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        activity.startActivity(Intent.createChooser(send, "Save or share OMNI metadata"))
                        invoke.resolve()
                    } catch (_: Exception) {
                        invoke.reject("The export share sheet is unavailable.", "export_unavailable")
                    }
                }
            } catch (error: VaultStoreException) {
                invoke.reject("The metadata export could not be prepared.", error.code)
            } catch (_: Exception) {
                invoke.reject("The metadata export could not be prepared.", "export_unavailable")
            }
        }
    }

    @Command
    fun vaultKey(invoke: Invoke) {
        val args = try {
            invoke.parseArgs(VaultKeyArgs::class.java)
        } catch (_: Exception) {
            invoke.reject("The device security request is invalid.", "invalid_key")
            return
        }
        worker.execute {
            try {
                val key = store.loadOrCreate(args.vaultExists)
                try {
                    val result = JSObject()
                    result.put("key", JSONArray(key.map { it.toInt() and 0xff }))
                    // This native callback goes directly to Rust, not to the webview.
                    invoke.resolve(result)
                } finally {
                    key.fill(0)
                }
            } catch (error: VaultStoreException) {
                invoke.reject("The device key store could not open the vault.", error.code)
            } catch (_: Exception) {
                // Never pass an exception to reject: Tauri logs supplied exceptions.
                invoke.reject("The device key store is unavailable.", "store_unavailable")
            }
        }
    }

    @Command
    fun openOllama(invoke: Invoke) {
        activity.runOnUiThread {
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://ollama.com/download")))
                invoke.resolve()
            } catch (_: Exception) {
                invoke.reject("The official Ollama page could not be opened.", "browser_unavailable")
            }
        }
    }
}
