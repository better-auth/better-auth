import fs from "node:fs/promises";
import path from "node:path";
import type { PackageJson } from "type-fest";

const rootDir = path.resolve(import.meta.dirname, "..");

const getCliPath = async () => {
	const pkgJson: PackageJson = JSON.parse(
		await fs.readFile(path.join(rootDir, "package.json"), "utf-8"),
	);
	const binPath =
		typeof pkgJson.bin === "string"
			? pkgJson.bin
			: pkgJson.bin?.["better-auth"];
	return path.join(rootDir, binPath as string);
};

export const cliPath = await getCliPath();
