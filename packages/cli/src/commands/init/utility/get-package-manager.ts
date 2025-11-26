import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { tryCatch } from "./utilts";

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
 * Tries to find the package manager and version in the provided CWD.
 *
 * @param cwd Current working directory
 * @returns Package manager and version
 */
export const getPackageManager = async (
	cwd: string,
): Promise<{ pm: PackageManager; version: string | null }> => {
	const { data: files } = await tryCatch(fs.readdir(cwd, "utf-8"));
	if (files) {
		// Infer from `packageManager` field in `package.json`
		if (files.includes("package.json")) {
			const packageJsonPath = path.join(cwd, "package.json");
			const { data } = await tryCatch(fs.readFile(packageJsonPath, "utf-8"));
			if (data) {
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
