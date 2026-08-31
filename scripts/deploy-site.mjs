import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertFullCommitSha,
  assertReleaseNode,
  getSourceState,
  git,
  repoRoot,
  run,
  runNpmScript,
} from "./site-release-utils.mjs";

assertReleaseNode();

function assertDeployableSource(source, originMain) {
  assertFullCommitSha(source.commitSha);
  assertFullCommitSha(originMain, "origin/main SHA");

  if (source.branch !== "main") {
    throw new Error(`Deployment requires branch main; current branch is ${source.branch}.`);
  }

  if (source.sourceTree !== "clean") {
    throw new Error(
      `Deployment requires a clean source tree. Commit or restore these changes:\n${source.status}`,
    );
  }

  if (source.commitSha !== originMain) {
    throw new Error(
      `HEAD (${source.commitSha}) does not match origin/main (${originMain}). Run \`git fetch origin main\`, then push or update main before deploying.`,
    );
  }
}

const sourceBeforeBuild = getSourceState();
const originMain = git(["rev-parse", "--verify", "origin/main"]);
assertDeployableSource(sourceBeforeBuild, originMain);

runNpmScript("build");
runNpmScript("verify:site");

const sourceAfterBuild = getSourceState();
assertDeployableSource(sourceAfterBuild, originMain);

const versionPath = join(repoRoot, "out", "version.json");
const version = JSON.parse(await readFile(versionPath, "utf8"));
if (
  version.commitSha !== sourceAfterBuild.commitSha ||
  version.branch !== "main" ||
  version.sourceTree !== "clean"
) {
  throw new Error(
    `The built /version.json is not deployable: ${JSON.stringify(version)}.`,
  );
}

const commitMessage = git(["log", "-1", "--pretty=%s"]);
const wranglerPath = join(repoRoot, "node_modules", "wrangler", "bin", "wrangler.js");

process.stdout.write(
  `\nDeploying ${sourceAfterBuild.commitSha} from clean main to Cloudflare Pages…\n`,
);

run(process.execPath, [
  wranglerPath,
  "pages",
  "deploy",
  "out",
  "--project-name",
  "agentsforintroverts",
  "--branch",
  "main",
  "--commit-hash",
  sourceAfterBuild.commitSha,
  "--commit-message",
  commitMessage,
  "--commit-dirty=false",
]);
