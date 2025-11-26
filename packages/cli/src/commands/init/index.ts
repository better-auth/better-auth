import path from "node:path";
import {
	cancel,
	confirm,
	intro,
	isCancel,
	spinner,
	log,
	outro,
} from "@clack/prompts";
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
import {
	getPackageManager,
	getPkgManagerStr,
	PACKAGE_MANAGERS,
} from "./utility/get-package-manager";
import { installDependency } from "./utility/install-dependency";
import { hasDependency } from "./utility/get-package-json";
import { createEnvFile, getEnvFiles, hasEnvVar } from "./utility/env";
import { generateSecretHash } from "../secret";
import chalk from "chalk";

// Goals:
// 1. init `auth.ts` file
// 2. init `auth-client.ts` file
// 3. init or update `env` files
// 4. init endpoints file (e.g. `route.ts`)
// 5. install dependencies

export async function initAction(opts: any) {
	const options = initActionOptionsSchema.parse(opts);
	const cwd = options.cwd;

	intro("👋 Better Auth CLI");

	// Get package manager information
	const { pm, pmString } = await (async () => {
		if (options.packageManager) {
			const [pm, version] = [options.packageManager, null];
			const pmString = getPkgManagerStr({ packageManager: pm, version });
			return { pm, pmString };
		}

		const { pm, version } = await getPackageManager(cwd);
		const pmString = getPkgManagerStr({ packageManager: pm, version });
		return { pm, pmString };
	})();

	// Install Better-Auth
	await (async () => {
		const hasBetterAuth = await hasDependency(cwd, "better-auth");
		if (hasBetterAuth) {
			const info = "Better-Auth is already installed. Skipping installation.";
			return log.info(info);
		}

		const shouldInstallBetterAuth = await confirm({
			message: `Would you like to install Better-Auth using ${chalk.bold(pmString)}?`,
		});

		if (isCancel(shouldInstallBetterAuth)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		if (shouldInstallBetterAuth) {
			const s = spinner();
			s.start(`Installing Better-Auth...`);
			await installDependency("better-auth", { cwd, pm });
			s.stop(`Better-Auth installed successfully!`);
		}
	})();

	// Handle ENV files
	await (async () => {
		const envFiles = await getEnvFiles(cwd);
		if (envFiles.length === 0) {
			const shouldCreateEnv = await confirm({
				message: `Would you like to create a .env file with the necessary environment variables?`,
			});
			if (isCancel(shouldCreateEnv)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			if (shouldCreateEnv) {
				await createEnvFile(cwd, [
					`BETTER_AUTH_SECRET="${generateSecretHash()}"`,
					'BETTER_AUTH_URL="http://localhost:3000"',
				]);
			}
		} else {
			const shouldAddEnvVariables = await confirm({
				message: `Add required environment variables to .env files? ${chalk.gray(`(BETTER_AUTH_SECRET, BETTER_AUTH_URL)`)}`,
			});
			if (isCancel(shouldAddEnvVariables)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			if (shouldAddEnvVariables) {
			}
		}
	})();

	const authConfigCode = await generateAuthConfigCode({
		plugins: [],
		database: "prisma-sqlite",
		appName: "My App",
		baseURL: "https://my-app.com",
		getArguments: getArgumentsPrompt(options),
	});
	// console.log(authConfigCode);

	outro(`🚀 Better Auth CLI successfully initialized!`);
}

let initBuilder = new Command("init")
	.option("-c, --cwd <cwd>", "The working directory.", process.cwd())
	.option(
		"--config <config>",
		"The path to the auth configuration file. defaults to the first `auth.ts` file found.",
	)
	.option(
		"--package-manager <package-manager>",
		"The package manager to use. defaults to the package manager found in the current working directory.",
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
	packageManager: z.enum(PACKAGE_MANAGERS).optional(),
	...pluginArgumentOptionsSchema,
});

export type InitActionOptions = z.infer<typeof initActionOptionsSchema>;
