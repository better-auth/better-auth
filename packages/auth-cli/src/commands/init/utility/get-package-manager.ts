import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { tryCatch } from "../../../utils/utils";

export const PACKAGE_MANAGERS = ["npm", "pnpm", "bun", "yarn"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export const getPkgManagerStr = ({
	packageManager,
	version,
}: {
	packageManager: PackageManager;
	version?: string | null;
}): string => {
	if (version) {
		return `${packageManager}@${version}`;
	}
	return packageManager;
};

/**
 * Checks if a directory is a monorepo root by looking for common monorepo indicators.
 *
 * @param dir Directory to check
 * @returns true if the directory appears to be a monorepo root
 */
const isMonorepoRoot = async (dir: string): Promise<boolean> => {
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
};

/**
 * Finds the monorepo root by walking up the directory tree.
 *
 * @param startDir Starting directory
 * @returns Path to monorepo root, or null if not found
 */
const findMonorepoRoot = async (startDir: string): Promise<string | null> => {
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
};

/**
 * Tries to find the package manager and version in the provided CWD.
 * For monorepos, it will check the monorepo root directory.
 *
 * @param cwd Current working directory
 * @returns Package manager and version
 */
export const getPackageManager = async (
	cwd: string,
): Promise<{ pm: PackageManager; version: string | null }> => {
	// First, try to find the monorepo root
	const monorepoRoot = await findMonorepoRoot(cwd);
	const searchDir = monorepoRoot || cwd;

	const { data: files } = await tryCatch(fs.readdir(searchDir, "utf-8"));
	if (files) {
		// Infer from `packageManager` field in `package.json`
		if (files.includes("package.json")) {
			const packageJsonPath = path.join(searchDir, "package.json");
			const { data } = await tryCatch(fs.readFile(packageJsonPath, "utf-8"));
			if (data) {
				try {
					const { packageManager: pmStr } = JSON.parse(data);
					if (typeof pmStr === "string") {
						const [packageManager, version] = pmStr.split("@") as [
							PackageManager | null,
							string | null,
						];
						if (packageManager && PACKAGE_MANAGERS.includes(packageManager)) {
							return { pm: packageManager, version };
						}
					}
				} catch {
					// Ignore JSON parse errors
				}
			}
		}

		// Infer package manager from lock files.
		if (["bun.lockb", "bun.lock"].some((file) => files.includes(file))) {
			return {
				pm: "bun",
				version: null,
			};
		}
		if (files.includes("pnpm-lock.yaml")) {
			return {
				pm: "pnpm",
				version: null,
			};
		}
		if (files.includes("yarn.lock")) {
			return {
				pm: "yarn",
				version: null,
			};
		}
	}

	// Infer from package-manager versions.
	const hasBun = await getVersion("bun");
	if (hasBun) {
		return {
			pm: "bun",
			version: null,
		};
	}
	const hasPnpm = await getVersion("pnpm");
	if (hasPnpm) {
		return {
			pm: "pnpm",
			version: null,
		};
	}
	const hasYarn = await getVersion("yarn");
	if (hasYarn) {
		return {
			pm: "yarn",
			version: null,
		};
	}
	return {
		pm: "npm",
		version: null,
	};
};

/**
 * Get the version of the package manager. Also useful to check if the package manager is installed.
 *
 * @returns Version of the package manager
 */
const getVersion = async (
	pkgManager: PackageManager,
): Promise<string | null> => {
	const version = await new Promise<string | null>((resolve) => {
		exec(`${pkgManager} -v`, (err, stdout) => {
			if (err) {
				resolve(null);
				return;
			}
			resolve(stdout.trim());
		});
	});

	return version;
};
