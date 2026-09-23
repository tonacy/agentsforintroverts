# Quiet Desk with Codex

Start a check-in by asking Codex:

> Help me look at today's work for Quiet Desk. Use Computer History for today
> and any context I point you to. Give me a short, evidence-backed recap, say
> what you could not see, and surface a few concrete ideas from the work for me
> to react to. Let each project's substance guide the conversation. Reflection
> is optional. Bring in relevant outside sources when useful. No action is a
> valid outcome.

Codex prepares the context; Quiet Desk holds the reflection and possible next
steps. Computer History is an optional context source. A note, document,
conversation, or project the person chooses can serve the same purpose.

## Conversation and story guidance

Let the work drive the story. Agents for Introverts is its own workstream and
may also be a publishing vehicle; its philosophy is not a required theme for
other projects. A Kit story can explain a useful technical pattern, what it
unlocked, and how it was built. Attribution may be enough; wording is unsettled.

Offer a few grounded suggestions proactively rather than repeatedly asking the
person to remember what was interesting. Emotional reflection is optional when
relevant or wanted. Do not impose personal tension, sharing themes, or emotional
meaning on technical work. Do not turn this preference into a new universal theme.

The project's [companion and editorial guidance](../../docs/editorial/companion-guidance.md)
records Tony's September 9 correction and its provenance. These preferences are
paraphrases, not verbatim quotes or inferred beliefs.

## In the Mac app

Open Today and choose **Talk with Codex**. The first handoff opens Codex with a
prepared message; press Send. Continue naturally there, with Computer History
or any other context you choose. Later visits use **Continue in Codex** to return
to that conversation.

Codex reads the scoped instructions in `.quiet-desk/CODEX.md`, reads the existing
inside context and verified outside sources, and saves its understanding through
the companion's checkpoint command. It checkpoints before each final response
and at wrap-up, because closing a conversation does not emit a reliable save event.

When you return to Quiet Desk, Today shows the saved understanding, open questions,
and recent revisions. Your actual chat words and Codex interpretations have separate
authorship. Existing human context and daily captures are preserved. The first
conversation still requires Send: Codex's desktop links prepare a message but do
not submit it automatically.

The default existing `~/Quiet Desk` workspace is detected automatically if no
valid workspace is selected. Other workspaces can be selected in Settings.

## Advanced manual check-in

The prior recap, reflection, public research, and publishing controls remain under
**Advanced: manual check-in and publishing** in Today. These are useful when you
want an explicit daily capture and source-gated publishable result. Companion
checkpoints are private agent understanding; they do not silently become human
captures or approved public output.
