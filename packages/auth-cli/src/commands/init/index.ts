import fs from "node:fs/promises";
import path from "node:path";
import {
	generateDrizzleSchema,
	generatePrismaSchema,
} from "@better-auth/cli/generators";
import chalk from "chalk";
import { Command } from "commander";
import prompts from "prompts";
import yoctoSpinner from "yocto-spinner";
import z from "zod";
import { possibleAuthConfigPaths } from "../../utils/config-paths";
import { hasDependency } from "../../utils/get-package-json";
import {
	enterAlternateScreen,
	exitAlternateScreen,
	generateSecretHash,
	tryCatch,
} from "../../utils/utilts";
import type { DatabaseAdapter } from "./configs/databases.config";
import type { Framework } from "./configs/frameworks.config";
import { FRAMEWORKS } from "./configs/frameworks.config";
import {
	SOCIAL_PROVIDER_CONFIGS,
	SOCIAL_PROVIDERS,
} from "./configs/social-providers.config";
import type { Plugin, PluginsConfig } from "./configs/temp-plugins.config";
import { tempPluginsConfig } from "./configs/temp-plugins.config";
import type { GetArgumentsOptions } from "./generate-auth";
import { generateAuthConfigCode } from "./generate-auth";
import { generateAuthClientConfigCode } from "./generate-auth-client";
import { HeroRenderer } from "./hero-renderer";
import {
	getAvailableORMs,
	getDialectsForORM,
	isDirectAdapter,
	isKyselyDialect,
} from "./utility/database";
import {
	createEnvFile,
	getEnvFiles,
	getMissingEnvVars,
	updateEnvFiles,
} from "./utility/env";
import { autoDetectFramework } from "./utility/framework";
import {
	getPackageManager,
	getPkgManagerStr,
	PACKAGE_MANAGERS,
} from "./utility/get-package-manager";
import { installDependency } from "./utility/install-dependency";
import { getArgumentsPrompt, getFlagVariable } from "./utility/prompt";

// Helper functions to replace @clack/prompts
const confirm = async (options: { message: string; initial?: boolean }) => {
	const response = await prompts({
		type: "confirm",
		name: "value",
		message: options.message,
		initial: options.initial ?? true,
	});
	return response?.value ?? null;
};

const select = async (options: {
	message: string;
	options: Array<{ value: string; label: string }>;
	initialValue?: string;
}) => {
	const response = await prompts({
		type: "select",
		name: "value",
		message: options.message,
		choices: options.options.map((opt) => ({
			title: opt.label,
			value: opt.value,
		})),
		initial: options.initialValue
			? options.options.findIndex((opt) => opt.value === options.initialValue)
			: undefined,
	});
	return response?.value ?? null;
};

const multiselect = async (options: {
	message: string;
	options: Array<{ value: string; label: string }>;
}) => {
	const response = await prompts({
		type: "multiselect",
		name: "value",
		message: options.message,
		choices: options.options.map((opt) => ({
			title: opt.label,
			value: opt.value,
		})),
		instructions: false,
	});
	return response?.value ?? null;
};

const isCancel = (value: any): boolean => {
	return value === null || value === undefined;
};

const cancel = (message: string) => {
	console.log(message);
	process.exit(0);
};

const log = {
	info: (message: string) => console.log(message),
	success: (message: string) => console.log(chalk.green(message)),
	error: (message: string) => console.error(chalk.red(message)),
};

const loopHero = async (phases: string[]) => {
	const title = chalk.bold("Better Auth CLI");
	const renderer = new HeroRenderer(title);

	let phaseIndex = -1;
	for (const phase of phases) {
		phaseIndex++;
		await renderer.typeText(phase);
		await renderer.blink(500);
		if (phaseIndex < phases.length - 1) {
			await renderer.clearSubtitle(phase);
		}
	}
	return renderer;
};

/**
 * Extract database provider from database adapter string
 */
const getDatabaseProvider = (
	database: string,
): "sqlite" | "mysql" | "postgresql" | "pg" | null => {
	if (database.startsWith("drizzle-")) {
		if (database.includes("postgresql")) {
			return "pg";
		}
		if (database.includes("mysql")) {
			return "mysql";
		}
		if (database.includes("sqlite")) {
			return "sqlite";
		}
	}
	if (database.startsWith("prisma-")) {
		if (database.includes("postgresql")) {
			return "postgresql";
		}
		if (database.includes("mysql")) {
			return "mysql";
		}
		if (database.includes("sqlite")) {
			return "sqlite";
		}
	}
	return null;
};

/**
 * Create a minimal BetterAuthOptions config for schema generation
 */
const createMinimalConfig = (plugins: Plugin[], baseURL: string): any => {
	// Convert plugin keys to actual plugin instances if needed
	// For now, plugins array is empty, so we'll create a minimal config
	const pluginInstances = plugins
		.map((pluginKey) => {
			const pluginConfig = tempPluginsConfig[pluginKey];
			if (!pluginConfig) return null;
			// We need to import the actual plugin, but for schema generation
			// we only need the schema property from the plugin
			// Since plugins are currently skipped (return []), this will be empty
			return null;
		})
		.filter(Boolean);

	return {
		secret: "temp-secret-for-schema-generation",
		baseURL,
		plugins: pluginInstances,
	};
};

/**
 * Create a mock adapter object for schema generation
 */
const createMockAdapter = (
	database: string,
	provider: "sqlite" | "mysql" | "postgresql" | "pg",
): any => {
	const isDrizzle = database.startsWith("drizzle-");
	const isPrisma = database.startsWith("prisma-");

	return {
		id: isDrizzle ? "drizzle" : isPrisma ? "prisma" : "unknown",
		options: {
			provider: provider === "pg" ? "pg" : provider,
		},
	};
};

export async function initAction(opts: any) {
	const options = initActionOptionsSchema.parse(opts);
	const cwd = options.cwd;

	enterAlternateScreen();

	const phases = ["Welcome to the Better Auth CLI!", "Let's get started!"];

	let renderer = await loopHero(phases);
	await renderer.clearSubtitle(phases[phases.length - 1]!);
	await renderer.blink(150);

	let currentStep = 0;

	const nextStep = async (text: string) => {
		await new Promise((resolve) => setTimeout(resolve, 1000));
		currentStep++;
		renderer.clear();
		console.clear();
		if (renderer.isStopped()) {
			const title = chalk.bold("Better Auth CLI");
			renderer = new HeroRenderer(title);
		} else {
			renderer.reset();
		}
		await renderer.typeText(`${currentStep}. ${text}`);
		renderer.pause();
		renderer.finalize();
	};

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
		if (hasBetterAuth) return;
		await nextStep("Install Better-Auth");

		const { shouldInstallBetterAuth } = await prompts({
			type: "confirm",
			name: "shouldInstallBetterAuth",
			message: `Would you like to install Better-Auth using ${chalk.bold(pmString)}?`,
			initial: true,
		});

		if (shouldInstallBetterAuth) {
			const s = yoctoSpinner({
				text: "Installing Better-Auth...",
				color: "white",
			});
			s.start();
			await installDependency("better-auth", { cwd, pm });
			s.success(`Better-Auth installed successfully!`);
		}
	})();

	// Select the framework to use.
	const framework: Framework = await (async () => {
		await nextStep("Select Framework");

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

	// Prompt for auth config file location
	let authConfigFilePath: string | null = null;
	const hasAuthConfigAlready = await (async () => {
		for (const _path of possibleAuthConfigPaths) {
			const fullPath = path.join(cwd, _path);
			const { error } = await tryCatch(fs.access(fullPath, fs.constants.F_OK));
			if (!error) {
				authConfigFilePath = fullPath;
				return true;
			}
		}
		return false;
	})();

	if (!hasAuthConfigAlready) {
		await nextStep("Configure Auth File Location");

		const { data: allFiles, error } = await tryCatch(fs.readdir(cwd, "utf-8"));
		if (error) {
			log.error(`Failed to read directory: ${error.message}`);
			process.exit(1);
		}
		let defaultAuthConfigPath = path.join(cwd, "lib", "auth.ts");

		if (allFiles.some((node) => node === "src")) {
			defaultAuthConfigPath = path.join(cwd, "src", "lib", "auth.ts");
		}

		const { filePath } = await prompts({
			type: "text",
			name: "filePath",
			message: `Where would you like to create the auth config file?`,
			initial: defaultAuthConfigPath,
		});

		if (isCancel(filePath)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		authConfigFilePath = filePath;

		// Generate minimal boilerplate auth config immediately
		const boilerplateCode = `import { betterAuth } from "better-auth";

export const auth = betterAuth({
	// Configuration will be added here
});
`;
		const { error: mkdirError } = await tryCatch(
			fs.mkdir(path.dirname(filePath), { recursive: true }),
		);
		if (mkdirError) {
			const error = `Failed to create auth directory at ${path.dirname(filePath)}: ${mkdirError.message}`;
			log.error(error);
			process.exit(1);
		}
		const { error: writeFileError } = await tryCatch(
			fs.writeFile(filePath, boilerplateCode, "utf-8"),
		);
		if (writeFileError) {
			const error = `Failed to write auth file at ${filePath}: ${writeFileError.message}`;
			log.error(error);
			process.exit(1);
		}
	}

	// Handle ENV files
	await (async () => {
		const envFiles = await getEnvFiles(cwd);

		// If no existing ENV files, ask to allow creation of a new one.
		if (envFiles.length === 0) {
			await nextStep("Configure Environment Variables");

			const shouldCreateEnv = await confirm({
				message: `Would you like to create a .env file with the necessary environment variables?`,
			});
			if (isCancel(shouldCreateEnv)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			if (shouldCreateEnv) {
				const { providedSecret } = await prompts({
					type: "text",
					name: "providedSecret",
					message: `Enter a custom better-auth secret: ${chalk.dim("(Press Enter to auto generate)")}`,
				});
				if (isCancel(providedSecret)) {
					cancel("✋ Operation cancelled.");
					process.exit(0);
				}
				const { providedURL } = await prompts({
					type: "text",
					name: "providedURL",
					message: `Enter a custom better-auth URL:`,
					initial: "http://localhost:3000",
				});
				if (isCancel(providedURL)) {
					cancel("✋ Operation cancelled.");
					process.exit(0);
				}

				const secret = providedSecret || generateSecretHash();
				await createEnvFile(cwd, [
					`BETTER_AUTH_SECRET="${secret}"`,
					`BETTER_AUTH_URL="${providedURL}"`,
				]);
			}
			return;
		}

		// Check for missing ENV variables (basic ones only - social providers handled later)
		const missingEnvVars = await getMissingEnvVars(envFiles, [
			"BETTER_AUTH_SECRET",
			"BETTER_AUTH_URL",
		]);

		if (!missingEnvVars.length) {
			return;
		}

		await nextStep("Configure Environment Variables");

		// If only one file is missing env variables, just show confirmation prompt
		if (missingEnvVars.length === 1) {
			const { file, var: missingVars } = missingEnvVars[0]!;
			const confirmed = await confirm({
				message: `Add required environment variables to ${chalk.bold(file.split("/").pop())}? (${missingVars.map((v) => chalk.cyan(v)).join(", ")})`,
			});
			if (isCancel(confirmed)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			if (confirmed) {
				let envs: string[] = [];

				for (const v of missingVars) {
					if (v === "BETTER_AUTH_SECRET") {
						const { providedSecret } = await prompts({
							type: "text",
							name: "providedSecret",
							message: `Enter a custom better-auth secret: ${chalk.dim("(Press Enter to auto generate)")}`,
						});
						if (isCancel(providedSecret)) {
							cancel("✋ Operation cancelled.");
							process.exit(0);
						}
						envs.push(
							`BETTER_AUTH_SECRET="${providedSecret || generateSecretHash()}"`,
						);
					} else if (v === "BETTER_AUTH_URL") {
						const { providedURL } = await prompts({
							type: "text",
							name: "providedURL",
							message: `Enter a custom better-auth URL:`,
							initial: "http://localhost:3000",
						});
						if (isCancel(providedURL)) {
							cancel("✋ Operation cancelled.");
							process.exit(0);
						}
						envs.push(`BETTER_AUTH_URL="${providedURL}"`);
					}
				}
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

	// Select the database to use.
	let databaseChoice: "yes" | "stateless" | "skip" | null = null;
	let database: string | null = null;
	await (async () => {
		await nextStep("Configure Database");

		const dbChoice = await select({
			message: `Would you like to configure a database?`,
			options: [
				{ value: "yes", label: "Yes - Configure a database" },
				{
					value: "stateless",
					label: "Stateless - Skip database (stateless mode)",
				},
				{ value: "skip", label: "Skip - Don't setup database now" },
			],
		});
		if (isCancel(dbChoice)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		databaseChoice = (dbChoice as "yes" | "stateless" | "skip") || null;

		if (databaseChoice === "yes") {
			// First, select the ORM or kysely dialect
			const availableORMs = getAvailableORMs();
			const selectedOption = await select({
				message: `Select the database you want to use:`,
				options: availableORMs.map((opt) => ({
					value: opt.adapter || opt.value,
					label: opt.label,
				})),
			});
			if (isCancel(selectedOption)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}

			// If a direct adapter (kysely dialect or mongodb) was selected, return it directly
			if (isDirectAdapter(selectedOption)) {
				return selectedOption;
			}

			// Otherwise, select the database dialect for the chosen ORM
			const availableDialects = getDialectsForORM(selectedOption);
			const selectedDialect = await select({
				message: `Select the database dialect:`,
				options: availableDialects.map((d) => ({
					value: d.adapter,
					label: d.label,
				})),
			});
			if (isCancel(selectedDialect)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}

			database = selectedDialect;
		}
	})();

	// Prompt for email & password authentication (skip if stateless)
	let emailAndPassword = false;
	if (databaseChoice && databaseChoice !== "stateless") {
		await nextStep("Configure Email & Password");
		const confirmed = await confirm({
			message: `Would you like to enable email & password authentication?`,
			initial: true,
		});
		if (isCancel(confirmed)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		emailAndPassword = confirmed || false;
	}

	// Prompt for social providers
	let selectedSocialProviders: string[] = [];
	await (async () => {
		await nextStep("Configure Social Providers");
		const shouldSetupSocial = await confirm({
			message: `Would you like to setup social providers?`,
			initial: true,
		});
		if (isCancel(shouldSetupSocial)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		if (shouldSetupSocial) {
			const providers = await multiselect({
				message: `Select the social providers you want to enable:`,
				options: SOCIAL_PROVIDERS.map((provider) => ({
					value: provider,
					label: provider.charAt(0).toUpperCase() + provider.slice(1),
				})),
			});
			if (isCancel(providers)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			selectedSocialProviders = providers || [];
		}
	})();

	// Add social provider environment variables
	if (selectedSocialProviders.length > 0) {
		await (async () => {
			const envFiles = await getEnvFiles(cwd);
			if (envFiles.length === 0) return; // No env files to update

			const socialProviderEnvVars = selectedSocialProviders.flatMap(
				(provider) => {
					const config =
						SOCIAL_PROVIDER_CONFIGS[
							provider as keyof typeof SOCIAL_PROVIDER_CONFIGS
						];
					if (!config) {
						// Fallback for unknown providers
						const providerUpper = provider.toUpperCase();
						return [
							`${providerUpper}_CLIENT_ID`,
							`${providerUpper}_CLIENT_SECRET`,
						];
					}
					return config.options.map((opt) => opt.envVar);
				},
			);

			const missingSocialEnvVars = await getMissingEnvVars(
				envFiles,
				socialProviderEnvVars,
			);

			if (missingSocialEnvVars.length > 0) {
				// Add missing social provider env vars to the first env file
				const firstEnvFile = envFiles[0]!;
				const envVarsToAdd = missingSocialEnvVars
					.filter((x) => x.file === firstEnvFile)
					.flatMap((x) => x.var.map((v) => `${v}=""`));

				if (envVarsToAdd.length > 0) {
					await updateEnvFiles([firstEnvFile], envVarsToAdd);
				}
			}
		})();
	}

	// Select the plugins to use. For now this is skipped.
	const plugins = await (async (): Promise<Plugin[]> => {
		// For now we do not want to allow configurations of plugins.
		// Possibily in the future we can support this.
		const skip = true;
		if (skip) return [];

		if (hasAuthConfigAlready) return [];

		await nextStep("Select Plugins");

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

	// Generate the auth config file with all selected options
	await (async () => {
		if (!authConfigFilePath) return;

		await nextStep("Generate Auth Configuration");

		const authConfigCode = await generateAuthConfigCode({
			plugins,
			database: database as DatabaseAdapter | null,
			framework,
			baseURL: "http://localhost:3000",
			emailAndPassword,
			socialProviders: selectedSocialProviders,
			getArguments: getArgumentsPrompt(options),
			installDependency: (d) => installDependency(d, { cwd, pm }),
		});

		const { error: writeFileError } = await tryCatch(
			fs.writeFile(authConfigFilePath, authConfigCode, "utf-8"),
		);
		if (writeFileError) {
			exitAlternateScreen();
			const error = `Failed to write auth file at ${authConfigFilePath}: ${writeFileError.message}`;
			log.error(error);
			process.exit(1);
		}
	})();

	// Generate database schema
	await (async () => {
		if (hasAuthConfigAlready) return;
		if (!database) return; // Skip if no database selected
		const dbString = String(database);
		if (dbString === "mongodb") return; // Skip for MongoDB

		await nextStep("Database Setup");

		// Determine which generator to use based on database type
		const isDrizzle = dbString.startsWith("drizzle-");
		const isPrisma = dbString.startsWith("prisma-");
		const isKysely = isKyselyDialect(dbString);

		// Skip Kysely migrations (require real database connection)
		if (isKysely) {
			return;
		}

		if (!isDrizzle && !isPrisma) {
			// Unknown database type, skip
			return;
		}

		const provider = getDatabaseProvider(dbString);
		if (!provider) {
			log.error(`Unable to determine database provider for ${database}`);
			return;
		}

		const shouldGenerateSchema = await confirm({
			message: `Would you like us to generate the database schema for you?`,
			initial: true,
		});

		if (isCancel(shouldGenerateSchema)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		if (!shouldGenerateSchema) {
			return;
		}

		const s = yoctoSpinner({
			text: `Generating database schema...`,
			color: "white",
		});
		s.start();

		try {
			// Create minimal config for schema generation
			const config = createMinimalConfig(plugins, "http://localhost:3000");

			// Create mock adapter
			const adapter = createMockAdapter(database, provider);

			let schemaResult: {
				code?: string;
				fileName: string;
				overwrite?: boolean;
			};

			let outputPath: string;

			if (isDrizzle) {
				// For Drizzle, output to auth-schema.ts next to auth config
				if (!authConfigFilePath) {
					throw new Error(
						"Auth config file path is required for Drizzle schema generation",
					);
				}
				// Resolve auth config path relative to cwd
				const resolvedAuthConfigPath = path.isAbsolute(authConfigFilePath)
					? authConfigFilePath
					: path.join(cwd, authConfigFilePath);
				const authConfigDir = path.dirname(resolvedAuthConfigPath);
				const schemaFileName = "auth-schema.ts";
				const fullOutputPath = path.join(authConfigDir, schemaFileName);
				// Convert to relative path from cwd for the generator
				outputPath = path.relative(cwd, fullOutputPath);

				schemaResult = await generateDrizzleSchema({
					adapter,
					options: config,
					file: outputPath,
				});
			} else if (isPrisma) {
				// For Prisma, output to prisma/schema.prisma
				outputPath = "prisma/schema.prisma";
				schemaResult = await generatePrismaSchema({
					adapter,
					options: config,
					file: outputPath,
				});
			} else {
				throw new Error(`Unsupported database type: ${dbString}`);
			}

			if (!schemaResult.code) {
				s.stop();
				log.info("Schema is already up to date.");
				return;
			}

			// Resolve full output path for file operations
			const fullOutputPath = path.isAbsolute(outputPath)
				? outputPath
				: path.join(cwd, outputPath);
			const fileExists = await fs
				.access(fullOutputPath)
				.then(() => true)
				.catch(() => false);

			if (fileExists && schemaResult.overwrite) {
				s.stop();
				const shouldOverwrite = await confirm({
					message: `The file ${chalk.yellow(outputPath)} already exists. Do you want to overwrite it?`,
					initial: false,
				});
				if (isCancel(shouldOverwrite) || !shouldOverwrite) {
					log.info("Schema generation cancelled.");
					return;
				}
				s.start();
			}

			// Create directory if it doesn't exist
			const outputDir = path.dirname(fullOutputPath);
			await fs.mkdir(outputDir, { recursive: true });

			// Write schema file
			await fs.writeFile(fullOutputPath, schemaResult.code, "utf-8");

			s.success(
				`Schema generated successfully at ${chalk.yellow(outputPath)}!`,
			);
		} catch (error) {
			s.stop();
			exitAlternateScreen();
			log.error(
				`Failed to generate schema: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exit(1);
		}
	})();

	// Generate the `auth-client.ts` file.
	await (async () => {
		if (hasAuthConfigAlready) return;
		await nextStep("Generate Auth Client Configuration");

		console.log(
			chalk.dim(
				"Note: If you have a separated client-server project architecture, you may want to skip generating the auth client file here and create it in your client project instead.",
			),
		);

		const shouldGenerateAuthClient = await confirm({
			message: `Would you like to generate the auth client configuration file?`,
			initial: true,
		});
		if (isCancel(shouldGenerateAuthClient)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		if (!shouldGenerateAuthClient) {
			return;
		}

		const authClientCode = await generateAuthClientConfigCode({
			plugins,
			database,
			framework,
			baseURL: "http://localhost:3000",
			getArguments: getArgumentsPrompt(options),
			installDependency: (d) => installDependency(d, { cwd, pm }),
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
		const { filePath } = await prompts({
			type: "text",
			name: "filePath",
			message: `Enter the path to the auth-client.ts file:`,
			initial: authConfigPath,
		});
		if (isCancel(filePath)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		const { error: mkdirError } = await tryCatch(
			fs.mkdir(path.dirname(filePath), { recursive: true }),
		);
		if (mkdirError) {
			const error = `Failed to create auth client directory at ${path.dirname(authConfigPath)}: ${mkdirError.message}`;
			log.error(error);
			process.exit(1);
		}
		const { error: writeFileError } = await tryCatch(
			fs.writeFile(authConfigPath, authClientCode, "utf-8"),
		);
		if (writeFileError) {
			const error = `Failed to write auth client file at ${authConfigPath}: ${writeFileError.message}`;
			log.error(error);
			process.exit(1);
		}
	})();

	// Generate the route handler file.
	await (async () => {
		if (!framework.routeHandler) return;
		const { routeHandler } = framework;

		const fullPath = path.resolve(cwd, routeHandler.path);
		const access = fs.access(fullPath, fs.constants.F_OK);
		const { error } = await tryCatch(access);

		if (!error) {
			return;
		}
		await nextStep("Generate Route Handler");

		const { filePath } = await prompts({
			type: "text",
			name: "filePath",
			message: `Enter the path to the route handler file:`,
			initial: fullPath,
		});
		if (isCancel(filePath)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		const mkdir = fs.mkdir(path.dirname(filePath), { recursive: true });
		const { error: mkdirError } = await tryCatch(mkdir);
		if (mkdirError) {
			const error = `Failed to create directory at ${path.dirname(filePath)}: ${mkdirError.message}`;
			log.error(error);
			process.exit(1);
		}

		const writeFile = fs.writeFile(filePath, routeHandler.code, "utf-8");
		const { error: writeFileError } = await tryCatch(writeFile);
		if (writeFileError) {
			const error = `Failed to write file at ${filePath}: ${writeFileError.message}`;
			log.error(error);
			process.exit(1);
		}

		const info = "Route handler file created!";
		return log.success(info);
	})();

	exitAlternateScreen();
	const output = renderer.buildOutput(
		"Better Auth successfully initialized! 🚀",
		{ borderless: true },
	);
	renderer.destroy();
	console.log(`\n${output}\n`);
	console.log(chalk.dim(chalk.bold(`Next Steps:`)));

	if (databaseChoice === "yes" && database) {
		const step1 = `1. Set up your database with nessesary enviroment variables.`;
		console.log(chalk.dim(step1));

		// Determine migration command based on database type
		const dbString = String(database);
		const isDrizzle = dbString.startsWith("drizzle-");
		const isPrisma = dbString.startsWith("prisma-");
		const isKysely = isKyselyDialect(dbString);

		// Only show migration tip for Drizzle, Prisma, or Kysely
		if (isDrizzle || isPrisma || isKysely) {
			let step2: string;
			if (isDrizzle) {
				step2 = `2. Run ${chalk.greenBright("npx drizzle-kit push")} or ${chalk.greenBright("npx drizzle-kit migrate")} to apply the schema to your database.`;
			} else if (isPrisma) {
				step2 = `2. Run ${chalk.greenBright("npx prisma migrate dev")} or ${chalk.greenBright("npx prisma db push")} to apply the schema to your database.`;
			} else if (isKysely) {
				step2 = `2. Run ${chalk.greenBright("npx @better-auth/cli migrate")} to apply the schema to your database.`;
			} else {
				// This shouldn't happen, but fallback
				step2 = `2. Run ${chalk.greenBright("npx @better-auth/cli migrate")} to apply the schema to your database.`;
			}
			console.log(chalk.dim(step2));
		}
	}

	if (selectedSocialProviders.length > 0) {
		const providerList = selectedSocialProviders
			.map((provider) => {
				const config =
					SOCIAL_PROVIDER_CONFIGS[
						provider as keyof typeof SOCIAL_PROVIDER_CONFIGS
					];
				if (!config) {
					// Fallback for unknown providers
					const providerUpper = provider.toUpperCase();
					return `\n   - ${chalk.cyan(`${providerUpper}_CLIENT_ID`)} and ${chalk.cyan(`${providerUpper}_CLIENT_SECRET`)}`;
				}
				const envVars = config.options
					.map((opt) => chalk.cyan(opt.envVar))
					.join(" and ");
				return `\n   - ${envVars}`;
			})
			.join("");
		// Determine step number based on whether migration step was shown
		const dbString = database ? String(database) : "";
		const isDrizzle = dbString.startsWith("drizzle-");
		const isPrisma = dbString.startsWith("prisma-");
		const isKysely = isKyselyDialect(dbString);
		const showedMigrationStep =
			databaseChoice === "yes" &&
			database &&
			(isDrizzle || isPrisma || isKysely);
		const stepNum = showedMigrationStep ? "3" : "2";
		const stepSocial = `${stepNum}. Update your environment variables with valid credentials for your selected social providers:${providerList}`;
		console.log(chalk.dim(stepSocial));
	}

	// Determine final step number
	const dbString = database ? String(database) : "";
	const isDrizzle = dbString.startsWith("drizzle-");
	const isPrisma = dbString.startsWith("prisma-");
	const isKysely = isKyselyDialect(dbString);
	const showedMigrationStep =
		databaseChoice === "yes" && database && (isDrizzle || isPrisma || isKysely);
	const stepNumber =
		selectedSocialProviders.length > 0
			? showedMigrationStep
				? "4"
				: databaseChoice === "yes" && database
					? "3"
					: "2"
			: showedMigrationStep
				? "3"
				: databaseChoice === "yes" && database
					? "2"
					: "1";
	const stepFinal = `${stepNumber}. Happy hacking!`;
	console.log(chalk.dim(stepFinal));
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
