import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import * as z from "zod";
import { tryCatch } from "./helper";

const packageManifestSchema = z.object({
	name: z.string(),
	version: z.string(),
});

export function getPackageInfo(cwd?: string) {
	const packageJsonPath = cwd
		? path.join(cwd, "package.json")
		: path.join("package.json");
	return JSON.parse(readFileSync(packageJsonPath, "utf-8"));
}

function readPackageVersion(
	packageJsonPath: string,
	packageName: string,
): string | null {
	if (!existsSync(packageJsonPath)) {
		return null;
	}
	try {
		const result = packageManifestSchema.safeParse(
			JSON.parse(readFileSync(packageJsonPath, "utf-8")),
		);
		return result.success && result.data.name === packageName
			? result.data.version
			: null;
	} catch {
		return null;
	}
}

function findPackageVersion(
	resolvedPath: string,
	packageName: string,
): string | null {
	let currentDirectory = path.dirname(resolvedPath);
	const rootDirectory = path.parse(currentDirectory).root;

	while (true) {
		const version = readPackageVersion(
			path.join(currentDirectory, "package.json"),
			packageName,
		);
		if (version) {
			return version;
		}
		if (currentDirectory === rootDirectory) {
			return null;
		}
		currentDirectory = path.dirname(currentDirectory);
	}
}

export function getInstalledPackageVersion(
	packageName: string,
	projectDirectory: string,
): string | null {
	const resolve = createRequire(
		path.join(path.resolve(projectDirectory), "package.json"),
	).resolve;

	for (const specifier of [`${packageName}/package.json`, packageName]) {
		try {
			const version = findPackageVersion(resolve(specifier), packageName);
			if (version) {
				return version;
			}
		} catch {}
	}
	return null;
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
