#!/usr/bin/env node

import { Command } from "commander";
import "dotenv/config";
import { migrate } from "./commands/migrate";
import { db } from "./commands/db";
async function main() {
	const program = new Command().name("better-auth");
	program.addCommand(migrate).addCommand(db);
	program.parse();
}

main();
