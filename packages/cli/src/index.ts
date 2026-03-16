#!/usr/bin/env node

import { createRequire } from "node:module";
import chalk from "chalk";
import { Command } from "commander";
import semver from "semver";
import { generate } from "./commands/generate";
import { info } from "./commands/info";
import { init } from "./commands/init";
import { login } from "./commands/login";
import { mcp } from "./commands/mcp";
import { migrate } from "./commands/migrate";
import { generateSecret } from "./commands/secret";
import { getPackageInfo } from "./utils/get-package-info";

import "dotenv/config";

// handle exit
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

async function main() {
	const program = new Command("better-auth");

	let packageInfo: Record<string, any> = {};
	try {
		packageInfo = await getPackageInfo();
	} catch {
		// it doesn't matter if we can't read the package.json file, we'll just use an empty object
	}

	const cliVersion = packageInfo.version || "1.1.2";

	try {
		const _require = createRequire(process.cwd() + "/");
		const betterAuthPkg = _require("better-auth/package.json");

		if (betterAuthPkg.version && semver.gte(betterAuthPkg.version, "1.5.0")) {
			console.warn(
				chalk.yellow(
					`\nWarning: You are using @better-auth/cli (v${cliVersion}) with better-auth v${betterAuthPkg.version}.\n` +
						`The old CLI may produce unexpected results with better-auth v1.5.x or later.\n` +
						`Please use the new CLI instead: `,
				) +
					chalk.cyan("npx auth@latest") +
					"\n",
			);
		}
	} catch {
		// better-auth may not be installed yet — skip the check
	}

	program
		.addCommand(init)
		.addCommand(migrate)
		.addCommand(generate)
		.addCommand(generateSecret)
		.addCommand(info)
		.addCommand(login)
		.addCommand(mcp)
		.version(packageInfo.version || "1.1.2")
		.description("Better Auth CLI")
		.action(() => program.help());

	program.parse();
}

main().catch((error) => {
	console.error("Error running Better Auth CLI:", error);
	process.exit(1);
});
