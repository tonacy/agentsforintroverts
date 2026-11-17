import assert from "node:assert/strict";
import { cp, mkdtemp, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkDraft,
  gatherCommits,
  launchdPlist,
  parseBacklog,
  parseReceipts,
  platformLength,
  runWeekly,
} from "../src/weekly.mjs";
import { fixtureWeeklyProvider } from "../src/providers/fixture.mjs";

const sampleRoot = resolve(fileURLToPath(new URL("../examples/weekly-sample", import.meta.url)));
const DATE = "2026-10-19";
const NOW = new Date(`${DATE}T15:00:00Z`);

async function sampleWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "afi-weekly-"));
  await cp(sampleRoot, root, { recursive: true, filter: (src) => !src.includes(`${sampleRoot}/dry-run`) });
  return root;
}

function stubProvider(output, stop_reason = "end_turn") {
  const calls = [];
  return {
    calls,
    provider: {
      name: "stub",
      model: "stub-1",
      async converse(request) {
        calls.push(request);
        return { stop_reason, usage: null, output: typeof output === "function" ? await output(request) : output };
      },
    },
  };
}

async function fixtureOutput(seeds) {
  return (await fixtureWeeklyProvider().converse({ seeds })).output;
}

test("parseBacklog reads the public/private table and each seed's fields", async () => {
  const backlog = parseBacklog(await readFile(join(sampleRoot, "notes/story-backlog.md"), "utf8"));
  assert.match(backlog.rules, /\| Public \| Private \|/);
  assert.equal(backlog.seeds.length, 3);
  assert.deepEqual(
    { number: backlog.seeds[1].number, title: backlog.seeds[1].title, tag: backlog.seeds[1].tag },
    { number: 2, title: "Deleting the seven-second opening", tag: "website" },
  );
  assert.match(backlog.seeds[0].facts, /never reads it/);
  assert.match(backlog.seeds[0].you_add, /hold a key/);
  assert.match(backlog.seeds[0].best_on, /X thread/);
  assert.deepEqual(parseBacklog(null), { rules: null, seeds: [] });
});

test("parseReceipts separates links from the pasted replies", () => {
  const parsed = parseReceipts("# r\n\n- Substack: https://a.example/p\n- X:\n- Published on: 2026-10-15\n\n## Replies\n\n- someone asked a thing\n");
  assert.equal(parsed.links.Substack, "https://a.example/p");
  assert.equal(parsed.links.X, "");
  assert.match(parsed.replies, /asked a thing/);
  assert.equal(parseReceipts("- Substack:\n").replies, null);
});

test("gatherCommits never reads a private project and drops subjects naming a private term", async () => {
  const seen = [];
  const git = async (cwd) => {
    seen.push(cwd);
    return "2026-10-14 Ship the thing\n2026-10-15 Fix Acme's invoice\n2026-10-16 wip\n";
  };
  const result = await gatherCommits({
    workspace: "/nowhere",
    projects: [{ name: "public", path: "/repos/public" }, { name: "secret", path: "/repos/secret", private: true }],
    privateTerms: ["acme"],
    sinceDays: 7,
    date: DATE,
    git,
  });
  assert.deepEqual(seen, ["/repos/public"]);
  assert.deepEqual(result.projects[0].commits, ["2026-10-14 Ship the thing"]);
  assert.equal(result.dropped, 1);
  assert.equal(result.projects.length, 1);
});

test("gatherCommits records an unreadable project instead of failing the run", async () => {
  const result = await gatherCommits({
    workspace: "/nowhere",
    projects: [{ name: "gone", path: "/repos/gone" }],
    privateTerms: [],
    sinceDays: 7,
    date: DATE,
    git: async () => {
      throw new Error("not a git repository");
    },
  });
  assert.equal(result.projects[0].error, "not a git repository");
  assert.deepEqual(result.projects[0].commits, []);
});

test("X counts a link as 23 characters; the others count a full URL", () => {
  assert.equal(platformLength("a [LINK]", "x"), 2 + 23);
  assert.equal(platformLength("a https://example.com/a/very/long/path/that/goes/on", "x"), 2 + 23);
  assert.equal(platformLength("a [LINK]", "threads"), 2 + 60);
});

test("a dry run drafts the kickoff's files and leaves the workspace unchanged", async () => {
  const workspace = await sampleWorkspace();
  const before = await readdir(join(workspace, "drafts"));
  const result = await runWeekly({ workspace, date: DATE, provider: "fixture", dryRun: true, now: NOW });

  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  assert.equal(result.decision, "draft");
  assert.deepEqual(await readdir(join(workspace, "drafts")), before);
  await assert.rejects(readdir(join(workspace, "runs")));

  const folder = `drafts/${result.folder}`;
  assert.match(result.folder, /^2026-10-19-running-the-day/);
  assert.deepEqual(Object.keys(result.files).sort(), [
    `${folder}/draft.json`,
    `${folder}/essay.md`,
    `${folder}/posts.md`,
    `${folder}/receipts.md`,
    `notes/monday/${DATE}.md`,
  ].sort());
  const posts = result.files[`${folder}/posts.md`];
  for (const heading of ["## LinkedIn", "## X (thread)", "## Threads", "## Publish checklist"]) assert.ok(posts.includes(heading), heading);
  assert.match(posts, /^1\/\n/m);
  assert.match(result.files[`${folder}/essay.md`], /^# Running the day/);
  assert.match(result.files[`${folder}/receipts.md`], /^- Substack:$/m);
  const note = result.files[`notes/monday/${DATE}.md`];
  assert.match(note, /Still no link for: Threads/);
  assert.match(note, /1 commit subject named a private term/);
  assert.match(note, /Nothing was posted, scheduled or sent/);
});

test("a real run writes the folder, a run record, and never reuses a seed", async () => {
  const workspace = await sampleWorkspace();
  const first = await runWeekly({ workspace, date: DATE, provider: "fixture", now: NOW });
  assert.equal(first.status, "completed");
  const record = JSON.parse(await readFile(join(workspace, "runs", `${first.run_id}.json`), "utf8"));
  assert.equal(record.seed.backlog_number, 1);
  assert.match(await readFile(join(workspace, "drafts", first.folder, "essay.md"), "utf8"), /\[YOU ADD:/);

  const second = await runWeekly({ workspace, date: "2026-10-26", provider: "fixture", now: new Date("2026-10-26T15:00:00Z") });
  assert.equal(second.seed.backlog_number, 2);
  const note = await readFile(join(workspace, "notes/monday/2026-10-26.md"), "utf8");
  assert.match(note, new RegExp(`drafts/${first.folder}/receipts.md`));
  assert.match(note, /1 already drafted/);
});

test("the provider sees the rules, the unused seeds and the pasted replies, never the private commit", async () => {
  const workspace = await sampleWorkspace();
  const { provider, calls } = stubProvider(({ seeds }) => fixtureOutput(seeds));
  await runWeekly({ workspace, date: DATE, provider, dryRun: true, now: NOW });
  const { user, system, schema } = calls[0];
  assert.match(system, /authorship boundary/i);
  assert.match(user, /Public\/private rules \(binding\)/);
  assert.match(user, /Deleting the seven-second opening/);
  assert.match(user, /how do you know which parts are still you/);
  assert.match(user, /Add the Monday draft command/);
  assert.doesNotMatch(user, /Sample Client Co/);
  assert.doesNotMatch(user, /Older work outside the week/);
  assert.equal(schema.properties.decision.enum.includes("nothing_this_week"), true);
});

test("a private term in the draft stops the run and nothing quotes it", async () => {
  const workspace = await sampleWorkspace();
  const { provider } = stubProvider(async ({ seeds }) => {
    const output = await fixtureOutput(seeds);
    output.posts.threads = `We shipped it for Sample Client Co. ${output.posts.threads}`;
    return output;
  });
  const result = await runWeekly({ workspace, date: DATE, provider, now: NOW });
  assert.equal(result.status, "failed");
  assert.equal(result.blocker, "private_term_in_draft");
  assert.equal(result.exitCode, 2);
  assert.equal(result.folder, null);
  const written = [];
  for (const dir of ["drafts", "notes/monday", "runs"]) {
    for (const name of await readdir(join(workspace, dir), { recursive: true })) written.push(join(dir, name));
  }
  assert.ok(!written.some((p) => p.startsWith("drafts/2026-10-19")));
  for (const path of written.filter((p) => p.endsWith(".md") || p.endsWith(".json"))) {
    const text = await readFile(join(workspace, path), "utf8").catch(() => "");
    assert.doesNotMatch(text, /Sample Client Co/, path);
  }
  assert.match(await readFile(join(workspace, `notes/monday/${DATE}.md`), "utf8"), /Nothing was written this week/);
});

test("nothing this week writes only the note", async () => {
  const workspace = await sampleWorkspace();
  const { provider } = stubProvider(await fixtureOutput([]));
  const result = await runWeekly({ workspace, date: DATE, provider, now: NOW });
  assert.equal(result.status, "completed");
  assert.equal(result.decision, "nothing_this_week");
  assert.equal(result.folder, null);
  assert.match(await readFile(join(workspace, `notes/monday/${DATE}.md`), "utf8"), /^Nothing this week\./m);
});

test("a provider that does not finish fails the run without a draft", async () => {
  const workspace = await sampleWorkspace();
  const { provider } = stubProvider(null, "max_tokens");
  const result = await runWeekly({ workspace, date: DATE, provider, now: NOW });
  assert.equal(result.status, "failed");
  assert.equal(result.blocker, "provider_stop_max_tokens");
  assert.equal(result.folder, null);
});

test("with no seeds, no commits and no replies the provider is not called", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "afi-weekly-empty-"));
  const { provider, calls } = stubProvider(null);
  const result = await runWeekly({ workspace, date: DATE, provider, now: NOW });
  assert.equal(calls.length, 0);
  assert.equal(result.status, "partial");
  assert.equal(result.blocker, "nothing_to_draw_from");
  assert.match(await readFile(join(workspace, `notes/monday/${DATE}.md`), "utf8"), /preferences\/weekly.json/);
});

test("an existing folder is never overwritten", async () => {
  const workspace = await sampleWorkspace();
  const folder = join(workspace, "drafts", "2026-10-19-running-the-day-through-the-sign-in-you");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "essay.md"), "Tony's edits\n");
  const result = await runWeekly({ workspace, date: DATE, provider: "fixture", now: NOW });
  assert.equal(result.folder, "2026-10-19-running-the-day-through-the-sign-in-you-2");
  assert.equal(await readFile(join(folder, "essay.md"), "utf8"), "Tony's edits\n");
});

test("checkDraft lists fixable problems without blocking", async () => {
  const output = await fixtureOutput([{ number: 1, title: "A seed", facts: "Facts." }]);
  output.posts.x[0] = "x".repeat(300);
  output.posts.threads = output.posts.threads.replace("[LINK]", "");
  output.essay.body_markdown = output.essay.body_markdown.replaceAll(/\[YOU ADD:[^\]]*\]/g, "");
  const { blocked, problems } = checkDraft(output, { usedSeeds: [{ folder: "2026-10-12-a-seed", backlog_number: 1, title: "A seed" }] });
  assert.equal(blocked, null);
  assert.ok(problems.some((p) => /X post 1 is 300/.test(p)));
  assert.ok(problems.some((p) => /Threads has no \[LINK\]/.test(p)));
  assert.ok(problems.some((p) => /no \[YOU ADD/.test(p)));
  assert.ok(problems.some((p) => /already drafted in drafts\/2026-10-12-a-seed/.test(p)));
});

test("the schedule is a Monday launchd agent pointing at the workspace", () => {
  const plist = launchdPlist({ node: "/usr/local/bin/node", script: "/repo/services/runner/weekly.mjs", workspace: "/Users/t/Quiet Desk" });
  assert.match(plist, /<key>Weekday<\/key>\s*<integer>1<\/integer>/);
  assert.match(plist, /<key>Hour<\/key>\s*<integer>8<\/integer>/);
  assert.match(plist, /<string>\/Users\/t\/Quiet Desk<\/string>/);
  assert.match(plist, /<string>claude<\/string>/);
  assert.doesNotMatch(plist, /--dry-run/);
});
