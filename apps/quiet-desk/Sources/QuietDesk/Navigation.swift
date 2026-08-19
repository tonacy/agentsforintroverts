import Observation
import QuietDeskCore
import SwiftUI

extension QuietDeskDestination {
    var systemImage: String {
        switch self {
        case .now: "circle"
        case .activity: "clock"
        case .connections: "point.3.connected.trianglepath.dotted"
        }
    }
}

enum InspectorSelection: Hashable, Identifiable {
    case feed(UUID)
    case agent(UUID)
    case source(UUID)

    var id: String {
        switch self {
        case .feed(let id): "feed-\(id.uuidString)"
        case .agent(let id): "agent-\(id.uuidString)"
        case .source(let id): "source-\(id.uuidString)"
        }
    }
}

@MainActor
@Observable
final class AppRouter {
    var destination: QuietDeskDestination? = .initial
    var activityScope: ActivityScope = .open
    var connectionKind: ConnectionKind = .sources
    var inspectorSelection: InspectorSelection?
    var columnVisibility: NavigationSplitViewVisibility = .all

    var selectedFeedID: UUID? {
        guard case .feed(let id) = inspectorSelection else { return nil }
        return id
    }

    var selectedAgentID: UUID? {
        guard case .agent(let id) = inspectorSelection else { return nil }
        return id
    }

    var selectedSourceID: UUID? {
        guard case .source(let id) = inspectorSelection else { return nil }
        return id
    }

    func show(_ selection: InspectorSelection) {
        inspectorSelection = selection
    }

    func closeInspector() {
        inspectorSelection = nil
    }

    func openActivity() {
        closeInspector()
        destination = .activity
    }

    func ensureSelection(in snapshot: QuietDeskSnapshot) {
        if destination == nil {
            destination = .initial
        }

        switch inspectorSelection {
        case .feed(let id) where snapshot.items.contains(where: { $0.id == id }):
            break
        case .agent(let id) where snapshot.agent(id: id) != nil:
            break
        case .source(let id) where snapshot.source(id: id) != nil:
            break
        case .none:
            break
        default:
            closeInspector()
        }
    }
}
