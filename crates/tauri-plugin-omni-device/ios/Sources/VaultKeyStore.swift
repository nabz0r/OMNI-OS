import Foundation
import Security

enum VaultStoreFailure: String, Error {
    case missingKey = "missing_key"
    case invalidKey = "invalid_key"
    case unavailable = "store_unavailable"
    case persistence = "key_persistence"
    case random = "random_unavailable"
}

/// The Keychain item stays on this device and is accessible while unlocked.
/// Biometrics do not derive the SQLCipher key; it is generated randomly.
final class VaultKeyStore {
    private let service: String
    private let account: String

    init(service: String, account: String = "vault-v1") {
        self.service = service
        self.account = account
    }

    private var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: false,
        ]
    }

    private func read() throws -> Data? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw VaultStoreFailure.unavailable }
        guard let value = result as? Data, value.count == 32 else {
            throw VaultStoreFailure.invalidKey
        }
        return value
    }

    func loadOrCreate(vaultExists: Bool) throws -> Data {
        if let value = try read() { return value }
        guard !vaultExists else { throw VaultStoreFailure.missingKey }
        var value = Data(count: 32)
        defer { value.resetBytes(in: 0..<value.count) }
        let status = value.withUnsafeMutableBytes { bytes in
            SecRandomCopyBytes(kSecRandomDefault, bytes.count, bytes.baseAddress!)
        }
        guard status == errSecSuccess else { throw VaultStoreFailure.random }
        var request = query
        request[kSecValueData as String] = value
        request[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let saved = SecItemAdd(request as CFDictionary, nil)
        // A racing creator may have won. Read its key; never update or delete it.
        if saved == errSecDuplicateItem {
            guard let existing = try read() else { throw VaultStoreFailure.persistence }
            return existing
        }
        guard saved == errSecSuccess else { throw VaultStoreFailure.persistence }
        guard let verified = try read(), verified == value else {
            throw VaultStoreFailure.persistence
        }
        return verified
    }
}
