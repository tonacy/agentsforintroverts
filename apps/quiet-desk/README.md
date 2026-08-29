# Quiet Desk for Mac

A native SwiftUI control surface for bringing a person's lived day and a
bounded view of the outside world into one conversation. The first build is
deliberately local, read-only by default, and clearly synthetic.

The top level is intentionally small:

- **Today** is the Daily Conversation front door. It calibrates short, deeper,
  or no-new-input for this check-in, then shows only the supporting recurring
  conversations appropriate to that depth.
- **Activity** keeps the underlying open, watching, handled, and full source
  history behind one filter instead of making it the product's center.
- **Agents & Sources** keeps both together behind one destination.

Today is an honest product projection, not a live conversation runtime. The
depth choice is session-local and is not retained as a standing preference.
The screen explicitly holds back Places until fresh outside evidence and a
trusted, human-authored capture of the day are both connected. Existing Threads
remain inspectable supporting material rather than being relabeled as Places.

Selecting a supporting thread explains why it fits, shows which context
statements were used, preserves source claims and uncertainty, makes the broad-to-human
narrowing visible, and names no more than three people. When a handoff has been
earned, the inspector shows one exact proposed introduction. Local approval adds
only `Approved` evidence; it does not contact a provider or claim delivery.

The bundled context, people, counts, sources, and handoffs are synthetic product
fixtures. They demonstrate the interaction and invariants, not a live network or
real-world common ground.

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
