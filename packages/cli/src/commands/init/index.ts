import fs from "node:fs/promises";
import path from "node:path";
import {
	cancel,
	confirm,
	intro,
	isCancel,
	log,
	multiselect,
	outro,
	select,
	spinner,
} from "@clack/prompts";
import chalk from "chalk";
import { Command } from "commander";
import z from "zod";
import { getConfig } from "../../utils/get-config";
import { generateSecretHash } from "../secret";
import { databasesConfig } from "./configs/databases.config";
import type { Plugin, PluginsConfig } from "./configs/temp-plugins.config";
import { tempPluginsConfig } from "./configs/temp-plugins.config";
import type { GetArgumentsOptions } from "./generate-auth";
import { generateAuthConfigCode } from "./generate-auth";
import { generateAuthClientConfigCode } from "./generate-auth-client";
import {
	createEnvFile,
	getEnvFiles,
	getMissingEnvVars,
	updateEnvFiles,
} from "./utility/env";
import type { Framework } from "./utility/framework";
import { autoDetectFramework, FRAMEWORKS } from "./utility/framework";
import { hasDependency } from "./utility/get-package-json";
import {
	getPackageManager,
	getPkgManagerStr,
	PACKAGE_MANAGERS,
} from "./utility/get-package-manager";
import { installDependency } from "./utility/install-dependency";
import { getArgumentsPrompt, getFlagVariable } from "./utility/prompt";
import { tryCatch } from "./utility/utilts";

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
			const info = "Better-Auth is already installed. Skipping...";
			return log.info(chalk.gray(info));
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

	// Select the framework to use.
	const framework: Framework = await (async () => {
		const detectedFramework = await autoDetectFramework(cwd);

		if (detectedFramework) {
			const confirmed = await confirm({
				message: `Is ${chalk.bold(detectedFramework.name)} your project's framework?`,
			});
			if (isCancel(confirmed)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			if (confirmed) return detectedFramework;
		}

		const selectedFramework = await select({
			message: `Select the framework you are using:`,
			options: FRAMEWORKS.map((framework) => ({
				value: framework.id,
				label: framework.name,
			})),
			initialValue: "next",
		});
		if (isCancel(selectedFramework)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		return FRAMEWORKS.find((framework) => framework.id === selectedFramework)!;
	})();

	// Handle ENV files
	await (async () => {
		const envFiles = await getEnvFiles(cwd);

		// If no existing ENV files, ask to allow creation of a new one.
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
			return;
		}

		// Check for missing ENV variables.
		const missingEnvVars = await getMissingEnvVars(envFiles, [
			"BETTER_AUTH_SECRET",
			"BETTER_AUTH_URL",
		]);

		if (!missingEnvVars.length) {
			const info = "ENV requirements met. Skipping...";
			return log.info(chalk.gray(info));
		}

		// If only one file is missing env variables, just show confirmation prompt
		if (missingEnvVars.length === 1) {
			const { file, var: missingVars } = missingEnvVars[0]!;
			const confirmed = await confirm({
				message: `Add required environment variables to ${chalk.bold(file)}? (${missingVars.map((v) => chalk.cyan(v)).join(", ")})`,
			});
			if (isCancel(confirmed)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			if (confirmed) {
				let envs = missingVars.map((v) => {
					if (v === "BETTER_AUTH_SECRET") {
						return `BETTER_AUTH_SECRET="${generateSecretHash()}"`;
					}
					if (v === "BETTER_AUTH_URL") {
						return 'BETTER_AUTH_URL="http://localhost:3000"';
					}
					return `${v}=${v}`;
				});
				await updateEnvFiles([file], envs);
			}
			return;
		}

		// If multiple files are missing env variables, ask to select the files to update.
		const filesToUpdate = await multiselect({
			message: `Add required environment variables to the following files?`,
			options: missingEnvVars.map((x) => ({
				value: x.file,
				label: `${chalk.bold(x.file)}: ${x.var.map((v) => chalk.cyan(v)).join(", ")}`,
			})),
		});

		if (isCancel(filesToUpdate)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		if (filesToUpdate) {
			for (const file of filesToUpdate) {
				let envs = missingEnvVars
					.find((x) => x.file === file)!
					.var.map((v) => {
						if (v === "BETTER_AUTH_SECRET") {
							return `BETTER_AUTH_SECRET="${generateSecretHash()}"`;
						}
						if (v === "BETTER_AUTH_URL") {
							return 'BETTER_AUTH_URL="http://localhost:3000"';
						}
						return `${v}=${v}`;
					});
				await updateEnvFiles([file], envs);
			}
			return;
		}
	})();

	// Check if `auth.ts` is already defined or not.
	const hasAuthConfigAlready = await (async () => {
		const { data, error } = await tryCatch(
			getConfig({
				cwd,
				shouldThrowOnError: true,
			}),
		);
		if (error) return true;
		return data !== null;
	})();

	// Select the database to use.
	const database = await (async () => {
		if (hasAuthConfigAlready) return null;
		const confirmed = await confirm({
			message: `Would you like to configure a database?`,
		});
		if (isCancel(confirmed)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		if (!confirmed) return null;
		const db = await select({
			message: `Select the database you want to use:`,
			options: databasesConfig.map((database) => ({
				value: database.adapter,
				label: database.adapter,
			})),
		});
		if (isCancel(db)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		return db;
	})();

	// Select the plugins to use. For now this is skipped.
	const plugins = await (async (): Promise<Plugin[]> => {
		// For now we do not want to allow configurations of plugins.
		// Possibily in the future we can support this.
		const skip = true;
		if (skip) return [];

		if (hasAuthConfigAlready) return [];

		const selectedPlugins = await multiselect({
			message: `Select the plugins you want to use:`,
			options: Object.values(tempPluginsConfig).map((plugin) => ({
				value: plugin.displayName as string,
				label: plugin.displayName as string,
			})),
		});
		if (isCancel(selectedPlugins)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		return selectedPlugins as Plugin[];
	})();

	// Generate the `auth.ts` file.
	await (async () => {
		if (hasAuthConfigAlready) {
			const info = "Auth config already exists. Skipping...";
			return log.info(chalk.gray(info));
		}
		const authConfigCode = await generateAuthConfigCode({
			plugins,
			database,
			framework,
			baseURL: "http://localhost:3000",
			getArguments: getArgumentsPrompt(options),
		});

		const { data: allFiles, error } = await tryCatch(fs.readdir(cwd, "utf-8"));
		if (error) {
			log.error(`Failed to read directory: ${error.message}`);
			process.exit(1);
		}
		let authConfigPath = path.join(cwd, "lib", "auth.ts");

		if (allFiles.some((node) => node === "src")) {
			authConfigPath = path.join(cwd, "src", "lib", "auth.ts");
		}
		await tryCatch(fs.mkdir(path.dirname(authConfigPath), { recursive: true }));
		await tryCatch(fs.writeFile(authConfigPath, authConfigCode, "utf-8"));
	})();

	// Generate the `auth-client.ts` file.
	await (async () => {
		if (hasAuthConfigAlready) {
			return;
		}
		const authClientCode = await generateAuthClientConfigCode({
			plugins,
			database,
			framework,
			baseURL: "http://localhost:3000",
			getArguments: getArgumentsPrompt(options),
		});

		const { data: allFiles, error } = await tryCatch(fs.readdir(cwd, "utf-8"));
		if (error) {
			log.error(`Failed to read directory: ${error.message}`);
			process.exit(1);
		}
		let authConfigPath = path.join(cwd, "lib", "auth-client.ts");

		if (allFiles.some((node) => node === "src")) {
			authConfigPath = path.join(cwd, "src", "lib", "auth-client.ts");
		}
		await tryCatch(fs.mkdir(path.dirname(authConfigPath), { recursive: true }));
		await tryCatch(fs.writeFile(authConfigPath, authClientCode, "utf-8"));
	})();

	outro(`Better Auth successfully initialized! 🚀`);
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

for (const plugin of Object.values(
	tempPluginsConfig as never as PluginsConfig,
)) {
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
