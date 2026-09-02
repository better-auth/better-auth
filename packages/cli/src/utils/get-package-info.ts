import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import * as semver from "semver";
import { tryCatch } from "./helper";

export function getPackageInfo(cwd?: string) {
	const packageJsonPath = cwd
		? path.join(cwd, "package.json")
		: path.join("package.json");
	return JSON.parse(readFileSync(packageJsonPath, "utf-8"));
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
	} catch {
		// If package.json doesn't exist or can't be read, return null
		return null;
	}
}

/**
 * Reads the actually-installed version of a package from its
 * `node_modules/<name>/package.json`. This reflects what will really be
 * resolved, unlike a declared dependency range: a range like
 * `"^0.45.2 || >=1.0.0-rc.1"` would report its lowest satisfying version via
 * `semver.minVersion` even when the installed version is much newer.
 */
function getInstalledPackageVersion(
	cwd: string,
	packageName: string,
): string | null {
	try {
		const packageJsonPath = path.join(
			cwd,
			"node_modules",
			packageName,
			"package.json",
		);
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
		return typeof packageJson.version === "string" ? packageJson.version : null;
	} catch {
		return null;
	}
}

/**
 * Returns the major version of the project's `drizzle-orm`, so callers can
 * tell drizzle-orm 1.0 (which removed the `relations()` API in favor of
 * `defineRelations`/`defineRelationsPart`) apart from the 0.x releases.
 *
 * Prefers the actually-installed version (`node_modules/drizzle-orm`) and
 * only falls back to the declared dependency range in package.json when
 * that isn't available (e.g. dependencies haven't been installed yet).
 */
export function getDrizzleVersion(cwd?: string): number | null {
	if (cwd) {
		const installedVersion = getInstalledPackageVersion(cwd, "drizzle-orm");
		if (installedVersion) {
			const parsed = semver.parse(installedVersion);
			if (parsed) {
				return parsed.major;
			}
		}
	}

	try {
		const packageInfo = getPackageInfo(cwd);
		const drizzleVersionRange =
			packageInfo.dependencies?.["drizzle-orm"] ||
			packageInfo.devDependencies?.["drizzle-orm"];

		if (!drizzleVersionRange) {
			return null;
		}

		const version = semver.minVersion(drizzleVersionRange);
		return version ? version.major : null;
	} catch {
		// If package.json doesn't exist or can't be read, return null
		return null;
	}
}

/**
 * Checks if a package has a specific dependency.
 *
 * @param packageJson The package.json object
 * @param dependency The dependency to check for
 * @returns true if the package has the dependency
 */
export function hasDependency(packageJson: any, dependency: string) {
	let hasDependency = false;

	if (
		packageJson.dependencies?.[dependency] ||
		packageJson.devDependencies?.[dependency] ||
		packageJson.peerDependencies?.[dependency] ||
		packageJson.optionalDependencies?.[dependency]
	) {
		hasDependency = true;
	}

	return hasDependency;
}

/**
 * Checks if a directory is a monorepo root by looking for common monorepo indicators.
 *
 * @param dir Directory to check
 * @returns true if the directory appears to be a monorepo root
 */
async function isMonorepoRoot(dir: string) {
	const { data: files } = await tryCatch(fs.readdir(dir, "utf-8"));
	if (!files) return false;

	// Check for pnpm workspace
	if (files.includes("pnpm-workspace.yaml")) {
		return true;
	}

	// Check for yarn/npm workspaces in package.json
	if (files.includes("package.json")) {
		const packageJsonPath = path.join(dir, "package.json");
		const { data } = await tryCatch(fs.readFile(packageJsonPath, "utf-8"));
		if (data) {
			try {
				const packageJson = JSON.parse(data);
				// Check for workspaces field (npm/yarn workspaces)
				// Workspaces can be an array or an object
				if (
					packageJson.workspaces &&
					(Array.isArray(packageJson.workspaces) ||
						typeof packageJson.workspaces === "object")
				) {
					return true;
				}
			} catch {
				// Ignore JSON parse errors
			}
		}
	}

	// Check for other monorepo indicators
	const monorepoIndicators = [
		"lerna.json", // Lerna
		/* cSpell:disable */
		"turbo.json", // Turborepo
		"nx.json", // Nx
		"rush.json", // Rush
	];

	return monorepoIndicators.some((indicator) => files.includes(indicator));
}

/**
 * Finds the monorepo root by walking up the directory tree.
 *
 * @param startDir Starting directory
 * @returns Path to monorepo root, or null if not found
 */
export async function findMonorepoRoot(
	startDir: string,
): Promise<string | null> {
	let currentDir = path.resolve(startDir);
	const root = path.parse(currentDir).root;

	while (currentDir !== root) {
		if (await isMonorepoRoot(currentDir)) {
			return currentDir;
		}
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			break;
		}
		currentDir = parentDir;
	}

	return null;
}
