import { access, readFile } from "node:fs/promises";

const packageFiles = [
  "packages/core/package.json",
  "packages/react/package.json",
  "packages/ui/package.json",
  "packages/admin-ui/package.json",
];

for (const packageFile of packageFiles) {
  const packageJson = JSON.parse(await readFile(packageFile, "utf8"));
  const packageDirectory = packageFile.slice(0, packageFile.lastIndexOf("/"));
  const requiredTargets = [packageJson.main, packageJson.module, packageJson.types];
  const exportTargets = packageJson.exports?.["."] ?? {};
  requiredTargets.push(exportTargets.require, exportTargets.import, exportTargets.types);
  if (packageJson.name === "@stamprally/ui" || packageJson.name === "@stamprally/admin-ui") {
    requiredTargets.push(packageJson.exports?.["./styles.css"]);
  }

  for (const target of requiredTargets) {
    if (typeof target !== "string") throw new Error(`${packageFile} has an invalid export target.`);
    await access(`${packageDirectory}/${target.replace(/^\.\//u, "")}`);
  }
}

console.log("All package entry points and stylesheet exports resolve to dist artifacts.");
