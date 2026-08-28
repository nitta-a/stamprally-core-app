import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const packageDirectory = process.argv[2];
if (packageDirectory === undefined) throw new Error("A package directory is required.");

const distDirectory = path.resolve(process.cwd(), packageDirectory, "dist");
for (const fileName of ["index.js", "index.cjs"]) {
  const filePath = path.join(distDirectory, fileName);
  try {
    await access(filePath);
    const source = await readFile(filePath, "utf8");
    if (!/^\s*["']use client["'];/.test(source))
      await writeFile(filePath, `"use client";\n${source}`, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
