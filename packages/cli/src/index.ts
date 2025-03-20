#!/usr/bin/env node
export { defineConfig } from "./define-config";
import { Command } from "commander";
import { migrate } from "./commands/migrate";
import { generate } from "./commands/generate";
import "dotenv/config";
import { generateSecret } from "./commands/secret";
import { getPackageInfo } from "./utils/get-package-info";
import { init } from "./commands/init";
import { loadConfig } from "./utils/load-config";
import path from "path";
// handle exit
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

async function main() {
	const DEFAULT_CONFIG_PATH = path.join(process.cwd(), "better-auth.config.ts");
	let config = {};

	try {
		config = await loadConfig(DEFAULT_CONFIG_PATH);
	} catch (error) {
		console.warn(`Warning: ${error.message}`);
	}
	const program = new Command("better-auth");

	let packageInfo: Record<string, any> = {};
	try {
		packageInfo = await getPackageInfo();
	} catch (error) {
		// it doesn't matter if we can't read the package.json file, we'll just use an empty object
	}
	program
		.addCommand(migrate)
		.addCommand(generate)
		.addCommand(generateSecret)
		.addCommand(init)
		.version(packageInfo.version || "1.1.2")
		.description("Better Auth CLI");
	program.commands.forEach((cmd) => {
		cmd.opts().config = config;
	});
	program.parse();
}

main();
