#!/usr/bin/env node

import { Command } from "commander";
import "dotenv/config";
import { migrate } from "./commands/migrate";
async function main() {
	const program = new Command().name("better-auth");
	program.addCommand(migrate);
	program.parse();
}

main();
