#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Command } from "commander";
import semver from "semver";
import { generate } from "./commands/generate";
import { info } from "./commands/info";
import { init } from "./commands/init";
import { login, logout } from "./commands/login";
import { mcp } from "./commands/mcp";
import { migrate } from "./commands/migrate";
import { generateSecret } from "./commands/secret";
import { upgrade } from "./commands/upgrade";
import { getPackageInfo } from "./utils/get-package-info";

import "dotenv/config";

// handle exit
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

export let cliVersion = "1.1.2";

async function main() {
	const program = new Command("better-auth");

	let packageInfo: Record<string, any> = {};
	try {
		packageInfo = await getPackageInfo();
		cliVersion = packageInfo.version || "1.1.2";
	} catch {
		// it doesn't matter if we can't read the package.json file, we'll just use an empty object
	}

	try {
		const _require = createRequire(import.meta.url);
		const betterAuthEntry = _require.resolve("better-auth");

		let dir = path.dirname(betterAuthEntry);
		let betterAuthPkg: { name?: string; version?: string } | null = null;

		while (dir !== path.dirname(dir)) {
			try {
				const candidate = JSON.parse(
					readFileSync(path.join(dir, "package.json"), "utf-8"),
				);
				if (candidate.name === "better-auth") {
					betterAuthPkg = candidate;
					break;
				}
			} catch {}
			dir = path.dirname(dir);
		}

		if (betterAuthPkg?.version && semver.gte(betterAuthPkg.version, "1.5.0")) {
			console.warn(
				`\x1b[33m\nWarning: You are using @better-auth/cli (v${cliVersion}) with better-auth v${betterAuthPkg.version}.\n` +
					`The old CLI may produce unexpected results with better-auth v1.5.x or later.\n` +
					`Please use the new CLI instead: \x1b[36m` +
					`npx auth@latest\x1b[0m\n`,
			);
		}
	} catch {
		// better-auth may not be installed yet
	}

	program
		.addCommand(init)
		.addCommand(migrate)
		.addCommand(generate)
		.addCommand(generateSecret)
		.addCommand(info)
		.addCommand(login)
		.addCommand(logout)
		.addCommand(mcp)
		.addCommand(upgrade)
		.version(cliVersion)
		.description("Better Auth CLI")
		.action(() => program.help());

	program.parse();
}

main().catch((error) => {
	console.error("Error running Better Auth CLI:", error);
	process.exit(1);
});
