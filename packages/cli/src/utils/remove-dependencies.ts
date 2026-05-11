import { exec } from "node:child_process";
import type { LiteralString } from "@better-auth/core";

/**
 * Removes one or more dependencies from a project using the project's
 * package manager. Mirrors {@link installDependencies} so callers can pair
 * a remove with a subsequent install (e.g. to migrate a renamed package).
 */
export function removeDependencies({
	dependencies,
	packageManager,
	cwd,
}: {
	dependencies: string | string[];
	packageManager: "npm" | "pnpm" | "bun" | "yarn" | LiteralString;
	cwd: string;
}): Promise<boolean> {
	let removeCommand: string;
	switch (packageManager) {
		case "npm":
			removeCommand = "npm uninstall";
			break;
		case "pnpm":
			removeCommand = "pnpm remove";
			break;
		case "bun":
			removeCommand = "bun remove";
			break;
		case "yarn":
			removeCommand = "yarn remove";
			break;
		default:
			throw new Error("Invalid package manager");
	}

	const pkgs = Array.isArray(dependencies)
		? dependencies.join(" ")
		: dependencies;
	const command = `${removeCommand} ${pkgs}`;

	return new Promise((resolve, reject) => {
		exec(command, { cwd }, (error, _stdout, stderr) => {
			if (error) {
				reject(new Error(stderr));
				return;
			}
			resolve(true);
		});
	});
}
