import path from "node:path";
import { intro } from "@clack/prompts";
import { Command } from "commander";
import z from "zod";
import {
	type PluginsConfig,
	pluginsConfig,
} from "./configs/plugins-index.config";
import {
	type GetArgumentsOptions,
	generateAuthConfigCode,
} from "./generate-auth";
import { getArgumentsPrompt, getFlagVariable } from "./utility/prompt";

// Goals:
// 1. init `auth.ts` file
// 2. init `auth-client.ts` file
// 3. init or update `env` files
// 4. init endpoints file (e.g. `route.ts`)
// 5. install dependencies

export async function initAction(opts: any) {
	const options = initActionOptionsSchema.parse(opts);

	intro("👋 Better Auth CLI");

	const authConfigCode = await generateAuthConfigCode({
		plugins: [
			"username",
			"twoFactor",
			"anonymous",
			"phoneNumber",
			"magicLink",
			"emailOTP",
			"passkey",
			"genericOAuth",
			"oneTap",
			"siwe",
			"admin",
			"apiKey",
			"mcp",
			"organization",
			"oidcProvider",
			"sso",
			"bearer",
			"deviceAuthorization",
		],
		database: "prisma-sqlite",
		appName: "My App",
		baseURL: "https://my-app.com",
		getArguments: getArgumentsPrompt(options),
	});
	console.log(authConfigCode);
}

let initBuilder = new Command("init")
	.option("-c, --cwd <cwd>", "The working directory.", process.cwd())
	.option(
		"--config <config>",
		"The path to the auth configuration file. defaults to the first `auth.ts` file found.",
	);

/**
 * Track used flags to ensure uniqueness
 */
const usedFlags = new Set<string>();

/**
 * Recursively process arguments and nested objects to add CLI options
 * Each flag is unique and not compound (no parent prefix)
 */
const processArguments = (
	args: GetArgumentsOptions[],
	pluginDisplayName: string,
) => {
	if (!args) return;

	for (const argument of args) {
		// Skip if it's a nested object container (we'll process its children instead)
		if (argument.isNestedObject && Array.isArray(argument.isNestedObject)) {
			// Recursively process nested arguments (without prefix)
			processArguments(argument.isNestedObject, pluginDisplayName);
		} else {
			// Process regular argument with its original flag (no prefix)
			const flag = argument.flag;

			// Ensure flag uniqueness
			if (usedFlags.has(flag)) {
				console.warn(
					`Warning: Flag "${flag}" is already used. Skipping duplicate.`,
				);
				continue;
			}
			usedFlags.add(flag);

			initBuilder.option(
				`--${flag} <${flag}>`,
				`[${pluginDisplayName}] ${argument.description}`,
			);
			pluginArgumentOptionsSchema[getFlagVariable(flag)] = z.coerce
				.string()
				.optional();
		}
	}
};

let pluginArgumentOptionsSchema: Record<string, z.ZodType<any>> = {};

for (const plugin of Object.values(pluginsConfig as never as PluginsConfig)) {
	if (plugin.auth.arguments) {
		processArguments(plugin.auth.arguments, plugin.displayName);
	}

	if (plugin.authClient && plugin.authClient.arguments) {
		processArguments(plugin.authClient.arguments, plugin.displayName);
	}
}

export const init = initBuilder.action(initAction);

export const initActionOptionsSchema = z.object({
	cwd: z.string().transform((val) => path.resolve(val)),
	config: z.string().optional(),
	...pluginArgumentOptionsSchema,
});

export type InitActionOptions = z.infer<typeof initActionOptionsSchema>;
