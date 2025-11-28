import fs from "node:fs/promises";
import path from "node:path";
import type { PackageJson } from "type-fest";

const rootDir = path.resolve(import.meta.dirname, "..");

const getCliPath = async () => {
	const pkgJson: PackageJson = JSON.parse(
		await fs.readFile(path.join(rootDir, "package.json"), "utf-8"),
	);
	const bin = pkgJson.bin;
	const binPath = typeof bin === "string" ? bin : Object.values(bin ?? {})[0];
	return path.join(rootDir, binPath as string);
};

export const cliPath = await getCliPath();
