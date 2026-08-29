import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const version = process.argv[2];
if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version))
  throw new Error("A semantic package version is required.");

const packageNames = [
  "@stamprally/core",
  "@stamprally/server",
  "@stamprally/react",
  "@stamprally/ui",
  "@stamprally/admin-ui",
];
const installTargets = packageNames.map((name) => `${name}@${version}`);
const directory = await mkdtemp(join(tmpdir(), "stamprally-publish-verification-"));

try {
  await run("npm", ["init", "--yes"], { cwd: directory });
  await run("npm", ["install", "--ignore-scripts", "--no-package-lock", ...installTargets], {
    cwd: directory,
  });
  console.log(`Verified npm installation for all @stamprally packages at ${version}.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
