import fs from "node:fs/promises";
import path from "node:path";
import type { PackageJson } from "type-fest";

const rootDir = path.resolve(import.meta.dirname, "..");

const getCliPath = async () => {
	const pkgJson: PackageJson = JSON.parse(
		await fs.readFile(path.join(rootDir, "package.json"), "utf-8"),
	);
	// Handle both string and object bin formats
	const binPath =
		typeof pkgJson.bin === "string"
			? pkgJson.bin
			: (Object.values(pkgJson.bin ?? {})[0] ?? "./dist/index.mjs");
	return path.join(rootDir, binPath);
};

export const cliPath = await getCliPath();
