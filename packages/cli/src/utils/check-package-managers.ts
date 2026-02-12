import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Awaitable, LiteralString } from "@better-auth/core";
import { env } from "@better-auth/core/env";
import type { PackageJson } from "type-fest";
import { findMonorepoRoot } from "./get-package-info";

export async function checkPackageManagers() {
	const hasPnpm = await getVersion("pnpm");
	const hasBun = await getVersion("bun");
	const hasYarn = await getVersion("yarn");

	return {
		hasPnpm,
		hasBun,
		hasYarn,
	};
}

export const PACKAGE_MANAGER = ["npm", "yarn", "pnpm", "bun"] as const;
export type PackageManager = (typeof PACKAGE_MANAGER)[number];

export async function detectPackageManager(
	cwd: string,
	packageJson: PackageJson,
): Promise<{
	packageManager: PackageManager;
	version?: string | undefined;
}> {
	const monorepoRoot = await findMonorepoRoot(cwd);
	for (const strategy of [
		envStrategy,
		packageJsonStrategy,
		lockFileStrategy,
		configStrategy,
		cliStrategy,
	]) {
		const result = await strategy({ cwd: monorepoRoot ?? cwd, packageJson });
		if (
			result !== null &&
			PACKAGE_MANAGER.includes(
				result.packageManager.toLowerCase() as PackageManager,
			)
		) {
			return result as { packageManager: PackageManager };
		}
	}
	return { packageManager: "npm" };
}

type Strategy = (ctx: { cwd: string; packageJson: PackageJson }) => Awaitable<{
	packageManager: PackageManager | LiteralString;
	version?: string | undefined;
} | null>;

const envStrategy: Strategy = () => {
	const userAgent = env.npm_config_user_agent;
	if (!userAgent) {
		return null;
	}

	const pmSpec = userAgent.split(" ")[0]!;
	const separatorPos = pmSpec.lastIndexOf("/");
	const packageManager = pmSpec.substring(0, separatorPos) as PackageManager;
	const version = pmSpec.substring(separatorPos + 1);

	return {
		packageManager,
		version,
	};
};

const lockFileStrategy: Strategy = ({ cwd }) => {
	if (existsSync(join(cwd, "package-lock.json"))) {
		return { packageManager: "npm" };
	}
	if (existsSync(join(cwd, "yarn.lock"))) {
		return { packageManager: "yarn" };
	}
	if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
		return { packageManager: "pnpm" };
	}
	if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) {
		return { packageManager: "bun" };
	}
	return null;
};

const packageJsonStrategy: Strategy = ({ packageJson }) => {
	const [packageManager, version] =
		packageJson.packageManager?.split("@", 2) ?? [];
	if (
		packageManager &&
		PACKAGE_MANAGER.includes(packageManager.toLowerCase() as PackageManager)
	) {
		return { packageManager, version };
	}
	return null;
};

const configStrategy: Strategy = ({ cwd, packageJson }) => {
	if (typeof packageJson.workspaces === "object") {
		if ("nohoist" in packageJson.workspaces) {
			return { packageManager: "yarn" };
		}
		if ("catalog" in packageJson.workspaces) {
			return { packageManager: "bun" };
		}
	}
	if (
		typeof packageJson.pnpm !== "undefined" ||
		existsSync(join(cwd, "pnpm-workspace.yaml"))
	) {
		return { packageManager: "pnpm" };
	}
	if (
		existsSync(join(cwd, ".yarnrc.yml")) ||
		existsSync(join(cwd, ".yarnrc"))
	) {
		return { packageManager: "yarn" };
	}
	if (existsSync(join(cwd, "bunfig.toml"))) {
		return { packageManager: "bun" };
	}
	return null;
};

const cliStrategy: Strategy = async ({ cwd }) => {
	const { hasBun, hasPnpm, hasYarn } = await checkPackageManagers();

	if (hasBun) {
		return { packageManager: "bun" };
	}
	if (hasPnpm) {
		return { packageManager: "pnpm" };
	}
	if (hasYarn) {
		return { packageManager: "yarn" };
	}
	return null;
};

function stripQuotes(s: string): string {
	const trimmed = s.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function _parseCatalogLine(line: string): [string, string] | [] {
	const entry = line.trim().replace(/^- /, "").trim();
	const delimiterIndex = entry.indexOf(":");
	if (delimiterIndex === -1) return [];
	const key = stripQuotes(entry.slice(0, delimiterIndex));
	const value = stripQuotes(entry.slice(delimiterIndex + 1));
	return [key, value];
}

export function getPkgManagerStr({
	packageManager,
	version,
}: {
	packageManager: PackageManager;
	version?: string | null | undefined;
}) {
	if (!version) {
		return packageManager;
	}
	return `${packageManager}@${version}`;
}

export async function getVersion(
	pkgManager: PackageManager,
): Promise<string | null> {
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
}
