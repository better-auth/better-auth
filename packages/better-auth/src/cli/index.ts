#!/usr/bin/env node

import { Command } from "commander";
import { migrate } from "./commands/migrate";
import { generate } from "./commands/generate";

async function main() {
	const program = new Command().name("better-auth");
	program
		.addCommand(migrate)
		.addCommand(generate)
		.version("0.0.1")
		.description("Better Auth CLI");

	program.parse();
}

main();
