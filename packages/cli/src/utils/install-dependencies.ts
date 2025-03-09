import { exec } from "child_process";
import type { DependenciesGroup, PackageManager } from "../commands/init/types";

export function installDependencies({
	dependencies,
	packageManager,
	cwd,
}: {
	dependencies: string[] | DependenciesGroup;
	packageManager: PackageManager;
	cwd: string;
}): Promise<{
	success: boolean;
	error: string | null;
}> {
	let installCommand: string;
	switch (packageManager) {
		case "pnpm":
			installCommand = "pnpm install";
			break;
		case "bun":
			installCommand = "bun install";
			break;
		default:
			installCommand = "npm install --force";
	}
	let dependenciesString = "";
	const flags: string[] = [];
	if (typeof dependencies === "object" && "type" in dependencies) {
		dependenciesString = dependencies.dependencies
			.map((x) => `${x.packageName}${x.version ? `@${x.version}` : ""}`)
			.join(" ");

		if (dependencies.type === "dev") {
			flags.push("--save-dev");
		} else if (dependencies.type === "peer") {
			flags.push("--save-peer");
		}
	} else {
		dependenciesString = dependencies.join(" ");
	}
	const command = `${installCommand} ${flags.join(" ")} ${dependenciesString}`;

	return new Promise((resolve, reject) => {
		exec(command, { cwd }, (error, stdout, stderr) => {
			if (error) {
				resolve({
					success: false,
					error: error.message,
				});
				return;
			}
			resolve({
				success: true,
				error: null,
			});
		});
	});
}
