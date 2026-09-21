import Foundation
import SwiftRs
import Tauri
import UIKit

private struct VaultKeyArgs: Decodable {
    let vaultExists: Bool
}

private struct MetadataExportArgs: Decodable {
    let name: String
    let contents: String
    let mime: String
}

final class OmniDevicePlugin: Plugin {
    private let keyQueue = DispatchQueue(label: "local.omni.device.vault-key")

    @objc public func saveExport(_ invoke: Invoke) {
        let args: MetadataExportArgs
        do {
            args = try invoke.parseArgs(MetadataExportArgs.self)
        } catch {
            invoke.reject("The metadata export is invalid.", code: "invalid_export")
            return
        }
        keyQueue.async {
            do {
                let file = try MetadataExports.prepare(name: args.name, contents: args.contents, mime: args.mime)
                DispatchQueue.main.async {
                    guard let presenter = self.manager.viewController,
                          presenter.presentedViewController == nil else {
                        try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
                        invoke.reject("The export share sheet is unavailable.", code: "export_unavailable")
                        return
                    }
                    let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                    // Anchor the popover explicitly on iPad as well as iPhone.
                    if let popover = sheet.popoverPresentationController {
                        popover.sourceView = presenter.view
                        popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                        popover.permittedArrowDirections = []
                    }
                    sheet.completionWithItemsHandler = { _, _, _, _ in
                        try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
                    }
                    presenter.present(sheet, animated: true) {
                        invoke.resolve()
                    }
                }
            } catch is MetadataExportFailure {
                invoke.reject("The metadata export is invalid.", code: "invalid_export")
            } catch {
                invoke.reject("The metadata export could not be prepared.", code: "export_unavailable")
            }
        }
    }

    @objc public func vaultKey(_ invoke: Invoke) {
        let args: VaultKeyArgs
        do {
            args = try invoke.parseArgs(VaultKeyArgs.self)
        } catch {
            invoke.reject("The device security request is invalid.", code: "invalid_key")
            return
        }
        keyQueue.async {
            do {
                guard let service = Bundle.main.bundleIdentifier else {
                    throw VaultStoreFailure.unavailable
                }
                var key = try VaultKeyStore(service: service).loadOrCreate(vaultExists: args.vaultExists)
                defer { key.resetBytes(in: 0..<key.count) }
                // The callback is native-to-Rust, never a webview response.
                invoke.resolve(["key": Array(key)])
            } catch let failure as VaultStoreFailure {
                invoke.reject("The device key store could not open the vault.", code: failure.rawValue)
            } catch {
                invoke.reject("The device key store is unavailable.", code: "store_unavailable")
            }
        }
    }

    @objc public func openOllama(_ invoke: Invoke) {
        DispatchQueue.main.async {
            guard let url = URL(string: "https://ollama.com/download") else {
                invoke.reject("The official Ollama page could not be opened.", code: "browser_unavailable")
                return
            }
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened {
                    invoke.resolve()
                } else {
                    invoke.reject("The official Ollama page could not be opened.", code: "browser_unavailable")
                }
            }
        }
    }
}

@_cdecl("init_plugin_omni_device")
func initPlugin() -> Plugin {
    OmniDevicePlugin()
}
