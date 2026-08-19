# Quiet Desk for Mac

A native SwiftUI control surface for the Agents for Introverts feed. The first
build is deliberately local, read-only by default, and clearly synthetic.

The top level is intentionally small:

- **Now** shows at most three unresolved items that actually need a person.
- **Activity** keeps open, watching, handled, and full history behind one filter.
- **Agents & Sources** keeps both together behind one destination.

Selecting an item opens a secondary inspector with source doors and any exact
proposal. Independent proof, executor metadata, IDs, and hashes remain available
inside Technical details instead of competing for attention in the feed.

## Run from source

```bash
swift run
```

## Test

```bash
swift test
```

## Build an app bundle

```bash
./scripts/package-app.sh
open ".build/arm64-apple-macosx/release/Quiet Desk.app"
```

The bundle is ad-hoc signed for local use. Distribution signing, notarization,
a live read-only hub adapter, and unlocked-machine visual review are separate
release gates.
