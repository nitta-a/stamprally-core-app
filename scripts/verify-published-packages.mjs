import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecutionOptions = process.platform === "win32" ? { shell: true } : {};
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
const maxAttempts = 8;
const initialDelayMs = 5_000;

function isRegistryPropagationError(error) {
  const stderr = error?.stderr;
  if (typeof stderr !== "string") return false;
  return /ETARGET|E404|EAI_AGAIN|ECONNRESET|ENOTFOUND/u.test(stderr);
}

try {
  await run(npmCommand, ["init", "--yes"], { cwd: directory, ...npmExecutionOptions });

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await run(
        npmCommand,
        ["install", "--ignore-scripts", "--no-package-lock", ...installTargets],
        {
          cwd: directory,
          ...npmExecutionOptions,
        },
      );
      console.log(`Verified npm installation for all @stamprally packages at ${version}.`);
      break;
    } catch (error) {
      if (!isRegistryPropagationError(error) || attempt === maxAttempts) throw error;

      const retryDelayMs = Math.min(initialDelayMs * 2 ** (attempt - 1), 30_000);
      console.warn(
        `npm registry propagation is incomplete (attempt ${attempt}/${maxAttempts}); ` +
          `retrying in ${retryDelayMs / 1_000}s.`,
      );
      await delay(retryDelayMs);
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
