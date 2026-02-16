#!/usr/bin/env node

import { Command } from "commander";
import { generate } from "./commands/generate";
import { info } from "./commands/info";
import { init } from "./commands/init";
import { login, logout } from "./commands/login";
import { mcp } from "./commands/mcp";
import { migrate } from "./commands/migrate";
import { generateSecret } from "./commands/secret";
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
	program
		.addCommand(init)
		.addCommand(migrate)
		.addCommand(generate)
		.addCommand(generateSecret)
		.addCommand(info)
		.addCommand(login)
		.addCommand(logout)
		.addCommand(mcp)
		.version(cliVersion)
		.description("Better Auth CLI")
		.action(() => program.help());

	program.parse();
}

main().catch((error) => {
	console.error("Error running Better Auth CLI:", error);
	process.exit(1);
});
