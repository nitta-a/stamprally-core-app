import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = process.argv[2];
if (packageDirectory === undefined || !/^packages\/(ui|admin-ui)$/.test(packageDirectory)) {
  throw new Error("A UI package directory is required, for example packages/ui.");
}

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(repositoryRoot, packageDirectory, "src/styles.css");
const destination = resolve(repositoryRoot, packageDirectory, "dist/index.css");
await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
