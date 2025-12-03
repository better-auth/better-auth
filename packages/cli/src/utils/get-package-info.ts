import fs from "node:fs";
import path from "node:path";

export function getPackageInfo(cwd?: string) {
	const packageJsonPath = cwd
		? path.join(cwd, "package.json")
		: path.join("package.json");
	return JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
}

export function getPrismaVersion(cwd?: string): number | null {
	try {
		const packageInfo = getPackageInfo(cwd);
		const prismaVersion =
			packageInfo.dependencies?.prisma ||
			packageInfo.devDependencies?.prisma ||
			packageInfo.dependencies?.["@prisma/client"] ||
			packageInfo.devDependencies?.["@prisma/client"];

		if (!prismaVersion) {
			return null;
		}

		// Extract major version number from version string
		// Handles versions like "^5.0.0", "~7.1.0", "7.0.0", etc.
		const match = prismaVersion.match(/(\d+)/);
		return match ? parseInt(match[1], 10) : null;
	} catch (error) {
		// If package.json doesn't exist or can't be read, return null
		return null;
	}
}
