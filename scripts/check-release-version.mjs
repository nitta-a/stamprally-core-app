import { readFile } from "node:fs/promises";

const releaseTag = process.argv[2];
if (releaseTag === undefined || !/^v\d+\.\d+\.\d+$/.test(releaseTag)) {
  throw new Error("RELEASE_TAG must be a semantic version tag such as v0.1.0.");
}

const releaseVersion = releaseTag.slice(1);
const packageFiles = [
  "packages/core/package.json",
  "packages/react/package.json",
  "packages/ui/package.json",
  "packages/admin-ui/package.json",
  "packages/server/package.json",
];

let expectedVersion;

for (const packageFile of packageFiles) {
  const packageJson = JSON.parse(await readFile(packageFile, "utf8"));
  if (packageJson.version !== releaseVersion) {
    throw new Error(
      `${packageFile} is ${packageJson.version}, but the release tag is ${releaseTag}.`,
    );
  }
  if (expectedVersion === undefined) expectedVersion = packageJson.version;
  if (packageJson.version !== expectedVersion) {
    throw new Error(`${packageFile} is not synchronized with the other publishable packages.`);
  }
}

console.log(`Release tag ${releaseTag} matches all publishable package versions.`);
