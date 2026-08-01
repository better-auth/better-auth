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
	const dependencyList = Array.isArray(dependencies)
		? dependencies
		: [dependencies];
	if (dependencyList.length === 0 || dependencyList.every((dep) => !dep)) {
		return Promise.resolve(true);
	}

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
	const command = `${installCommand}${flags.length > 0 ? ` ${flags.join(" ")}` : ""} ${dependencyList.join(" ")}`;

	return new Promise((resolve, reject) => {
		exec(command, { cwd }, (error, stdout, stderr) => {
			if (error) {
				const message =
					[stderr, stdout].filter(Boolean).join("\n").trim() ||
					error.message ||
					"Failed to install dependencies";
				reject(new Error(message));
				return;
			}
			resolve(true);
		});
	});
}
