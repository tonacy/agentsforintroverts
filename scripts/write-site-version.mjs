import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertFullCommitSha,
  assertReleaseNode,
  getSourceState,
  repoRoot,
} from "./site-release-utils.mjs";

assertReleaseNode();

const source = getSourceState();
assertFullCommitSha(source.commitSha);

const version = {
  schemaVersion: 1,
  service: "agentsforintroverts.com",
  commitSha: source.commitSha,
  branch: source.branch,
  sourceTree: source.sourceTree,
  buildMode: "static-export",
};

const publicDirectory = join(repoRoot, "public");
const versionPath = join(publicDirectory, "version.json");
await mkdir(publicDirectory, { recursive: true });
await writeFile(versionPath, `${JSON.stringify(version, null, 2)}\n`, "utf8");

process.stdout.write(
  `Prepared /version.json for ${version.commitSha.slice(0, 12)} (${version.branch}, ${version.sourceTree}).\n`,
);
