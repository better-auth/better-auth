import { exec } from "node:child_process";
import type { LiteralString } from "@better-auth/core";

const flagsMap = {
	npm: {
		dev: "--save-dev",
		optional: "--save-optional",
	},
	pnpm: {
		dev: "--save-dev",
		peer: "--save-peer",
		optional: "--save-optional",
		catalog: (name?: string) => {
			if (name) {
				return `--save-catalog-name ${name}`;
			}
			return "--save-catalog";
		},
	},
	bun: {
		dev: "--dev",
		peer: "--peer",
		optional: "--optional",
	},
	yarn: {
		dev: "--dev",
		peer: "--peer",
		optional: "--optional",
	},
};

export function installDependencies({
	dependencies,
	packageManager,
	cwd,
	type = "prod",
	catalogName,
}: {
	dependencies: string | string[];
	packageManager: "npm" | "pnpm" | "bun" | "yarn" | LiteralString;
	cwd: string;
	type?: "prod" | "peer" | "optional" | "dev" | "catalog" | undefined;
	catalogName?: string;
}): Promise<boolean> {
	let installCommand: string;
	const flags: string[] = [];
	switch (packageManager) {
		case "npm":
			installCommand = "npm install";
			flags.push("--force");
			break;
		case "pnpm":
			installCommand = "pnpm add";
			break;
		case "bun":
			installCommand = "bun install";
			break;
		case "yarn":
			installCommand = "yarn install";
			break;
		default:
			throw new Error("Invalid package manager");
	}

	const flagMap = flagsMap[packageManager as "pnpm" | "npm"];
	if (type === "catalog") {
		if ("catalog" in flagMap) {
			const catalogFlag = flagMap["catalog"];
			flags.push(catalogFlag(catalogName));
		} else {
			throw new Error(`Catalog flag is not supported by "${packageManager}"`);
		}
	} else {
		const flag = flagMap?.[type as keyof typeof flagMap];
		if (flag) {
			flags.push(flag);
		}
	}
	const command = `${installCommand}${flags.length > 0 ? ` ${flags.join(" ")}` : ""} ${Array.isArray(dependencies) ? dependencies.join(" ") : dependencies}`;

	return new Promise((resolve, reject) => {
		exec(command, { cwd }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(stderr));
				return;
			}
			resolve(true);
		});
	});
}
