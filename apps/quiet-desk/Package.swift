// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "QuietDesk",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .executable(name: "QuietDesk", targets: ["QuietDesk"]),
    ],
    targets: [
        .target(
            name: "QuietDeskCore",
            resources: [.process("Resources")]
        ),
        .executableTarget(
            name: "QuietDesk",
            dependencies: ["QuietDeskCore"]
        ),
        .testTarget(
            name: "QuietDeskCoreTests",
            dependencies: ["QuietDeskCore"]
        ),
    ]
)
