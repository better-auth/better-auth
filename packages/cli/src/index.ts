#!/usr/bin/env node

import { Command } from "commander";
import { migrate } from "./commands/migrate";
import { generate } from "./commands/generate";
import "dotenv/config";
import { generateSecret } from "./commands/secret";

async function main() {
	const program = new Command("better-auth");
	program
		.addCommand(migrate)
		.addCommand(generate)
		.addCommand(generateSecret)
		.version("0.0.1")
		.description("Better Auth CLI");
	program.parse();
}

main();
