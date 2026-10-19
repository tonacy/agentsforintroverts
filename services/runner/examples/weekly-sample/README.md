# Sample workspace for the Monday draft

A made-up Quiet Desk workspace, small enough to read in a minute. Everything in
it is public: the seeds and commit subjects describe work already visible in
this repository, the links point at example.com, and the reply is invented.
Nothing here came from a real workspace. Real backlogs, receipts and replies
stay in `~/Quiet Desk`, never in this repository.

```bash
node services/runner/weekly.mjs --workspace services/runner/examples/weekly-sample \
  --date 2026-10-19 --provider fixture --dry-run --out /tmp/monday-sample
```

`--dry-run` leaves this folder unchanged and writes the would-be files under
`--out`. The draft in [`dry-run/`](./dry-run) came from `--provider claude`.
