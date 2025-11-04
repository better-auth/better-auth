import { intro } from "@clack/prompts";
import { Command } from "commander";
import path from "node:path";
import z from "zod";
import { generateAuthConfigCode } from "./generate-auth";
import { pluginsConfig } from "./configs/plugins.config";

// Goals:
// 1. init `auth.ts` file
// 2. init `auth-client.ts` file
// 3. init or update `env` files
// 4. init endpoints file
// 5. install dependencies

export async function initAction(opts: any) {
	const options = z
		.object({
			cwd: z.string(),
			config: z.string().optional(),
		})
		.parse(opts);

	const cwd = path.resolve(options.cwd);
	intro("👋 Initializing Better Auth");

	const authConfigCode = await generateAuthConfigCode({
		plugins: pluginsConfig,
		database: "prisma-sqlite",
	});
	console.log(authConfigCode);
}

export const init = new Command("init")
	.option("-c, --cwd <cwd>", "The working directory.", process.cwd())
	.option(
		"--config <config>",
		"The path to the auth configuration file. defaults to the first `auth.ts` file found.",
	)
	.action(initAction);
