#!/usr/bin/env node

import { BetterAuthError } from "@better-auth/core/error";
import { Command } from "commander";
import { ai } from "./commands/ai";
import { check } from "./commands/check";
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
// 128 + signal number, so an interrupted run never reads as a success.
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

async function main() {
	const program = new Command("better-auth");
	program
		.addCommand(ai)
		.addCommand(createAdmin)
		.addCommand(check)
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
	// A coded error (ECONNREFUSED, a database driver error) describes the
	// environment, not a CLI bug, so its stack only buries the message.
	const code =
		error instanceof Error && "code" in error && typeof error.code === "string"
			? error.code
			: undefined;
	if (error instanceof BetterAuthError || code) {
		// A dual-stack ECONNREFUSED is an AggregateError with an empty message.
		console.error(error.message || code);
	} else {
		console.error("Error running Better Auth CLI:", error);
	}
	process.exit(1);
});
