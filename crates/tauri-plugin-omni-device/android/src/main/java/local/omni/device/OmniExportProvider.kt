package local.omni.device

import androidx.core.content.FileProvider

// A distinct component keeps the export scope separate from Tauri's provider.
class OmniExportProvider : FileProvider()
