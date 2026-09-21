import Foundation

enum MetadataExports {
    static func prepare(name: String, contents: String, mime: String) throws -> URL {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.")
        let validName = name.hasPrefix("omni-") && name.utf8.count <= 120 &&
            !name.contains("..") && name.unicodeScalars.allSatisfy { allowed.contains($0) }
        let validType = (name.hasSuffix(".json") && mime == "application/json") ||
            (name.hasSuffix(".csv") && mime == "text/csv")
        let bytes = Data(contents.utf8)
        guard validName, validType, bytes.count <= 2 * 1024 * 1024 else {
            throw MetadataExportFailure.invalid
        }
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("omni-exports", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = directory.appendingPathComponent(name, isDirectory: false)
        #if os(iOS)
        try bytes.write(to: destination, options: [.atomic, .completeFileProtection])
        #else
        try bytes.write(to: destination, options: .atomic)
        #endif
        return destination
    }
}

enum MetadataExportFailure: Error {
    case invalid
}
