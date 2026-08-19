#if DEBUG
import QuietDeskCore
import SwiftUI

@MainActor
private enum PreviewStoreFactory {
    static func loaded() -> QuietDeskStore {
        let snapshot = (try? QuietDeskFixtureLoader.load()) ?? .emptySynthetic()
        return QuietDeskStore(
            client: .bundledSyntheticFixtures,
            initialSnapshot: snapshot,
            initialLoadState: .loaded(snapshot.generatedAt),
            defaults: nil
        )
    }

    static func empty() -> QuietDeskStore {
        QuietDeskStore(
            client: .bundledSyntheticFixtures,
            initialSnapshot: .emptySynthetic(generatedAt: Date(timeIntervalSince1970: 0)),
            initialLoadState: .empty,
            defaults: nil
        )
    }

    static func failed() -> QuietDeskStore {
        QuietDeskStore(
            client: .failing(message: "Synthetic preview failure"),
            initialLoadState: .failed("Synthetic preview failure"),
            defaults: nil
        )
    }
}

struct QuietDeskPreviewProvider: PreviewProvider {
    static var previews: some View {
        Group {
            AppShellView(store: PreviewStoreFactory.loaded(), router: AppRouter())
                .frame(width: 1_120, height: 760)
                .previewDisplayName("Calm default · sample data")

            AppShellView(store: PreviewStoreFactory.empty(), router: AppRouter())
                .frame(width: 980, height: 680)
                .previewDisplayName("Empty")

            AppShellView(store: PreviewStoreFactory.failed(), router: AppRouter())
                .frame(width: 980, height: 680)
                .previewDisplayName("Error")
        }
    }
}
#endif
