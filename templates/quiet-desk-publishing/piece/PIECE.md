# Making a piece

A piece is one idea from the work, set so it can travel. It lives in its own
folder under `drafts/`, and Quiet Desk shows it on the Desk once `piece.json`
exists. The words are Markdown; the house renderer sets them.

```text
drafts/2026-09-23-why-this-page-slows-down/
├── piece.json          facts about the piece
├── article.md          the canonical words (the only text a web approval covers)
├── figure.svg          optional plate, referenced from piece.json
├── adaptations/
│   ├── linkedin.md     one self-contained post
│   └── x.md            one post, 280 characters or fewer
├── index.html          rendered — do not edit by hand
├── cards/*.html        rendered — link 1200×630, portrait 1080×1350, square 1080×1080
└── assets/             rendered — house style, fonts, mark
```

Render after every change to the words or the manifest:

```sh
node services/runner/piece.mjs render --workspace <desk> --piece drafts/<folder>
```

The renderer never replaces a hand-built `index.html`. Use `--output
edition.html` to set one beside it.

## The words

`article.md` supports a small, safe subset. Everything else is shown as text.

- `# Title` once, first. Put the title in `piece.json` too; that one wins, and
  may italicize a phrase: `"Why this page *slows down*"`.
- An all-italic first paragraph is the deck. Otherwise the first paragraph is
  the lede and gets the drop cap.
- `## Section` headings are numbered 01, 02, …
- `> One line` is a pull quote. Use one, and only for a line the person would
  say out loud.
- `[1]` in a sentence, with `[1]: https://… "Label"` anywhere, becomes a
  sidenote and a source in the colophon. Only credential-free https links
  survive.
- `![Alt text](figure.svg "Caption")` on its own line sets a plate. Images must
  stay inside the piece folder.
- A final `---` followed only by paragraphs is the postscript: provenance and
  limits, set small.

## The manifest

Required: `id`, `title`, `revision`, `canonical_text`. Useful: `project`,
`kicker`, `deck`, `byline`, `created_at`, `updated_at`, `authored_by`,
`reviewer`, `pull_quote`, `media` (one item with `role: "explanatory_diagram"`
becomes the cover plate), `adaptations` (channel + path), and `ledger` with
`person` and `agents` lists in plain words.

Increase `revision` whenever the words change. An approval covers one exact
revision of one form.

## What the agent may not do

- Write anything in `approvals/` or `receipts/`. Those are the person's marks,
  made in Quiet Desk.
- Invent a quote, a result, a reader, a number, or a position the person has
  not taken. Say what the sources support and where they stop.
- Publish, schedule, or send. A piece is held on the Desk until the person
  releases each form, and they publish it themselves.

The page carries the Made with mark. It is signed only when a saved approval
matches the exact words in `article.md`; editing them unsigns it.
