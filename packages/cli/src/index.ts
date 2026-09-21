#!/usr/bin/env node

import { BetterAuthError } from "@better-auth/core/error";
import { Command } from "commander";
import { ai } from "./commands/ai";
import { createAdmin } from "./commands/create-admin";
import { generate } from "./commands/generate";
import { info } from "./commands/info";
import { init } from "./commands/init";
import { login, logout } from "./commands/login";
import { mcp } from "./commands/mcp";
import { migrate } from "./commands/migrate";
import { generateSecret } from "./commands/secret";
import { upgrade } from "./commands/upgrade";
import { cliVersion } from "./version";

import "dotenv/config";

// handle exit
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

async function main() {
	const program = new Command("better-auth");
	program
		.addCommand(ai)
		.addCommand(createAdmin)
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

	await program.parseAsync();
}

main().catch((error) => {
	if (error instanceof BetterAuthError) {
		console.error(error.message);
	} else {
		console.error("Error running Better Auth CLI:", error);
	}
	process.exit(1);
});
