// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "tauri-plugin-omni-device",
    platforms: [.iOS(.v13)],
    products: [
        .library(name: "tauri-plugin-omni-device", type: .static, targets: ["tauri-plugin-omni-device"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api"),
    ],
    targets: [
        .target(
            name: "tauri-plugin-omni-device",
            dependencies: [.byName(name: "Tauri")],
            path: "Sources"
        ),
    ]
)
