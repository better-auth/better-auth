import { exec } from "node:child_process";
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
import { getPackageJson, hasDependency } from "../../utils/get-package-json";
import { generateSecretHash, tryCatch } from "../../utils/utils";
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
	getDatabaseCode,
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
	const title = chalk.bold("Better Auth");
	const renderer = new HeroRenderer(title);

	let phaseIndex = -1;
	for (const phase of phases) {
		phaseIndex++;
		await renderer.typeText(phase, { delay: 40, spaceDelay: 40 });
		await renderer.blink(300);
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

	// Check if package.json exists (not an empty project)
	const { data: packageJson } = await getPackageJson(cwd);
	if (!packageJson) {
		const pm = options.packageManager || "npm";
		const initCommand =
			pm === "bun" ? "bun init" : pm === "yarn" ? "yarn init" : `${pm} init`;
		console.error(
			chalk.red(
				`\nThis appears to be an empty project. No package.json found.\n`,
			),
		);
		console.error(
			chalk.yellow(
				`Please initialize a new project first by running:\n\n  ${chalk.bold(initCommand)}\n`,
			),
		);
		process.exit(1);
	}

	let currentStep = 0;

	const nextStep = async (text: string) => {
		currentStep++;
		console.log(chalk.white(`\n${currentStep}. ${text}`));
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

	// Install Better Auth
	await (async () => {
		const hasBetterAuth = await hasDependency(cwd, "better-auth");
		if (hasBetterAuth) return;
		await nextStep("Install Better Auth");

		const { shouldInstallBetterAuth } = await prompts({
			type: "confirm",
			name: "shouldInstallBetterAuth",
			message: `Would you like to install better-auth using ${chalk.bold(pm)}?`,
			initial: true,
		});

		if (shouldInstallBetterAuth) {
			const s = yoctoSpinner({
				text: "Installing Better Auth...",
				color: "white",
			});
			s.start();
			await installDependency("better-auth", { cwd, pm });
			s.success(`Better Auth installed successfully!`);
		}
	})();

	// Handle ENV files
	await (async () => {
		const envFiles = await getEnvFiles(cwd);

		// If no existing ENV files, ask to allow creation of a new one.
		if (envFiles.length === 0) {
			await nextStep("Set Environment Variables");

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
					message: `Provider secret (used for encryption, hashing, and signing). ${chalk.dim("(Press Enter to auto generate)")}`,
				});
				if (isCancel(providedSecret)) {
					cancel("✋ Operation cancelled.");
					process.exit(0);
				}
				const { providedURL } = await prompts({
					type: "text",
					name: "providedURL",
					message: `Provider base URL:`,
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

		await nextStep("Set Environment Variables");

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
							message: `Provider secret (used for encryption, hashing, and signing). ${chalk.dim("(Press Enter to auto generate)")}`,
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
							message: `Provider base URL:`,
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

	// Auto-detect framework silently
	const detectedFramework = await autoDetectFramework(cwd);
	const framework: Framework =
		detectedFramework || FRAMEWORKS.find((f) => f.id === "next")!;
	const frameworkWasDetected = !!detectedFramework;

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
		await nextStep("Create A Better Auth Instance");

		const { data: allFiles, error } = await tryCatch(fs.readdir(cwd, "utf-8"));
		if (error) {
			log.error(`Failed to read directory: ${error.message}`);
			process.exit(1);
		}

		// Determine default auth config path based on project structure
		// Priority: lib/ > root, with src/ prefix if src/ exists
		const hasSrc = allFiles.some((node) => node === "src");
		const hasLib = allFiles.some((node) => node === "lib");

		let defaultAuthConfigPath: string;
		if (hasSrc) {
			// Check if src/lib exists
			const { data: srcFiles } = await tryCatch(
				fs.readdir(path.join(cwd, "src"), "utf-8"),
			);
			const hasSrcLib = srcFiles?.some((node) => node === "lib");
			if (hasSrcLib) {
				defaultAuthConfigPath = path.join(cwd, "src", "lib", "auth.ts");
			} else {
				defaultAuthConfigPath = path.join(cwd, "src", "auth.ts");
			}
		} else if (hasLib) {
			defaultAuthConfigPath = path.join(cwd, "lib", "auth.ts");
		} else {
			defaultAuthConfigPath = path.join(cwd, "auth.ts");
		}

		// Convert absolute path to relative path for display
		const relativeDefaultPath = path.relative(cwd, defaultAuthConfigPath);

		const { filePath } = await prompts({
			type: "text",
			name: "filePath",
			message: `Where would you like to create the auth instance?`,
			initial: relativeDefaultPath,
		});

		if (isCancel(filePath)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		// Convert relative path back to absolute path
		// Remove leading slash if present (user might enter /lib/auth.ts meaning relative to project root)
		const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
		const absoluteFilePath = path.isAbsolute(cleanPath)
			? cleanPath
			: path.join(cwd, cleanPath);

		authConfigFilePath = absoluteFilePath;

		// Generate minimal boilerplate auth config immediately
		const boilerplateCode = `import { betterAuth } from "better-auth";

export const auth = betterAuth({
	// Configuration will be added here
});
`;
		const { error: mkdirError } = await tryCatch(
			fs.mkdir(path.dirname(absoluteFilePath), { recursive: true }),
		);
		if (mkdirError) {
			const error = `Failed to create auth directory at ${path.dirname(absoluteFilePath)}: ${mkdirError.message}`;
			log.error(error);
			process.exit(1);
		}
		const { error: writeFileError } = await tryCatch(
			fs.writeFile(absoluteFilePath, boilerplateCode, "utf-8"),
		);
		if (writeFileError) {
			const error = `Failed to write auth file at ${absoluteFilePath}: ${writeFileError.message}`;
			log.error(error);
			process.exit(1);
		}
	}

	// Select the database to use.
	let databaseChoice: "yes" | "stateless" | "skip" | null = null;
	let database: string | null = null;
	let shouldGenerateSchema = false;
	let shouldRunMigration = false;
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

			// If "sqlite" was selected, show SQLite variant options
			if (selectedOption === "sqlite") {
				// Filter SQLite options based on package manager
				const sqliteOptions = [];

				// Always show better-sqlite3
				sqliteOptions.push({
					value: "sqlite-better-sqlite3",
					label: "better-sqlite3",
				});

				// Show Bun SQLite only if using Bun as package manager or has @types/bun
				if (pm === "bun") {
					sqliteOptions.push({
						value: "sqlite-bun",
						label: "Bun SQLite",
					});
				} else {
					// Show Node SQLite only if NOT using Bun
					sqliteOptions.push({
						value: "sqlite-node",
						label: "Node SQLite",
					});
				}

				const sqliteVariants = await select({
					message: `Select SQLite driver:`,
					options: sqliteOptions,
				});
				if (isCancel(sqliteVariants)) {
					cancel("✋ Operation cancelled.");
					process.exit(0);
				}
				database = sqliteVariants;
				return;
			}

			// If a direct adapter (kysely dialect or mongodb) was selected, return it directly
			if (isDirectAdapter(selectedOption)) {
				database = selectedOption;
				return;
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

		// Install database dependencies if a database was selected
		if (database) {
			const databaseConfig = getDatabaseCode(database as DatabaseAdapter);
			if (databaseConfig && databaseConfig.dependencies.length > 0) {
				const { shouldInstallDeps } = await prompts({
					type: "confirm",
					name: "shouldInstallDeps",
					message: `Would you like to install the following dependencies: ${databaseConfig.dependencies.map((x) => chalk.cyan(x)).join(", ")}?`,
					initial: true,
				});

				if (isCancel(shouldInstallDeps)) {
					cancel("✋ Operation cancelled.");
					process.exit(0);
				}

				if (shouldInstallDeps) {
					const s = yoctoSpinner({
						text: "Installing database dependencies...",
						color: "white",
					});
					s.start();
					for (const dep of databaseConfig.dependencies) {
						await installDependency(dep, { cwd, pm });
					}
					s.success("Database dependencies installed successfully!");
				}
			}

			// Handle schema generation and migration
			const dbString = String(database);
			const isDrizzle = dbString.startsWith("drizzle-");
			const isPrisma = dbString.startsWith("prisma-");
			const isKysely = isKyselyDialect(dbString);
			const isMongoDB = dbString === "mongodb";

			// For ORMs (Drizzle, Prisma), ask to generate schema
			if (isDrizzle || isPrisma) {
				const response = await prompts({
					type: "confirm",
					name: "shouldGenerate",
					message: `Would you like to generate the database schema?`,
					initial: true,
				});

				if (isCancel(response.shouldGenerate)) {
					cancel("✋ Operation cancelled.");
					process.exit(0);
				}

				shouldGenerateSchema = response.shouldGenerate || false;

				if (shouldGenerateSchema) {
					console.log(
						chalk.dim(
							`\n  Schema will be generated after auth configuration is complete.\n`,
						),
					);
				}
			}

			// For Kysely dialects (SQLite, MySQL, PostgreSQL, MSSQL), ask to run migration
			if (isKysely) {
				const response = await prompts({
					type: "confirm",
					name: "shouldMigrate",
					message: `Would you like to run database migration?`,
					initial: true,
				});

				if (isCancel(response.shouldMigrate)) {
					cancel("✋ Operation cancelled.");
					process.exit(0);
				}

				shouldRunMigration = response.shouldMigrate || false;

				if (shouldRunMigration) {
					console.log(
						chalk.dim(
							`\n  Migration will run after auth configuration is complete.\n`,
						),
					);
				}
			}

			// For MongoDB, just show info
			if (isMongoDB) {
				console.log(
					chalk.dim(
						`\n  MongoDB adapter will automatically create collections as needed.\n`,
					),
				);
			}
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
		// Possibly in the future we can support this.
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

		// Handle Kysely migrations
		if (isKysely && shouldRunMigration) {
			const s = yoctoSpinner({
				text: "Running database migration...",
				color: "white",
			});
			s.start();

			await new Promise<void>((resolve, reject) => {
				exec(
					`npx @better-auth/cli migrate`,
					{ cwd },
					(error, stdout, stderr) => {
						if (error) {
							s.stop();
							log.error(`Failed to run migration: ${error.message}`);
							if (stderr) log.error(stderr);
							reject(error);
							return;
						}
						s.success("Database migration completed successfully!");
						if (stdout) console.log(stdout);
						resolve();
					},
				);
			});
			return;
		}

		if (!isDrizzle && !isPrisma) {
			// Unknown database type, skip
			return;
		}

		// Only generate schema if user chose to
		if (!shouldGenerateSchema) {
			return;
		}

		const provider = getDatabaseProvider(dbString);
		if (!provider) {
			log.error(`Unable to determine database provider for ${database}`);
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
			log.error(
				`Failed to generate schema: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exit(1);
		}
	})();

	// Generate the route handler file.
	await (async () => {
		// Skip route handler generation if framework wasn't detected
		if (!frameworkWasDetected) {
			return;
		}

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
			fs.writeFile(filePath, authClientCode, "utf-8"),
		);
		if (writeFileError) {
			const error = `Failed to write auth client file at ${authConfigPath}: ${writeFileError.message}`;
			log.error(error);
			process.exit(1);
		}
	})();

	console.log(
		chalk.green(`\n✔ `) + chalk.bold("Success! ") + "Project setup complete.\n",
	);

	let logs: string[] = [];

	let nextStepNum = 1;

	if (databaseChoice === "yes" && database) {
		logs.push(
			`  ${nextStepNum}. Set up your database with necessary environment variables`,
		);
		nextStepNum++;

		// Determine migration command based on database type
		const dbString = String(database);
		const isDrizzle = dbString.startsWith("drizzle-");
		const isPrisma = dbString.startsWith("prisma-");
		const isKysely = isKyselyDialect(dbString);

		// Only show migration tip for Drizzle, Prisma, or Kysely
		if (isDrizzle || isPrisma || isKysely) {
			let command: string;
			if (isDrizzle) {
				command = "npx drizzle-kit push";
			} else if (isPrisma) {
				command = "npx prisma migrate dev";
			} else {
				command = "npx @better-auth/cli migrate";
			}
			logs.push(`  ${nextStepNum}. Run ${chalk.cyan(command)} to apply schema`);
			nextStepNum++;
		}
	}

	// Show mount handler instructions if framework wasn't detected
	if (!frameworkWasDetected) {
		logs.push(`  ${nextStepNum}. Mount the auth handler`);
		logs.push(
			`     Use ${chalk.cyan("auth.handler")} with a Web API compatible request object\n` +
				`     Default route: ${chalk.cyan('"/api/auth"')} (configurable via ${chalk.cyan("basePath")})`,
		);
		nextStepNum++;
	}

	if (selectedSocialProviders.length > 0) {
		const providerList = selectedSocialProviders
			.map((provider) => {
				const config =
					SOCIAL_PROVIDER_CONFIGS[
						provider as keyof typeof SOCIAL_PROVIDER_CONFIGS
					];
				if (!config) {
					const providerUpper = provider.toUpperCase();
					return `\n     - ${chalk.cyan(`${providerUpper}_CLIENT_ID`)} and ${chalk.cyan(`${providerUpper}_CLIENT_SECRET`)}`;
				}
				const envVars = config.options
					.map((opt) => chalk.cyan(opt.envVar))
					.join(" and ");
				return `\n     - ${envVars}`;
			})
			.join("");
		logs.push(
			`  ${nextStepNum}. Add social provider credentials to .env:${providerList}`,
		);
		nextStepNum++;
	}

	if (logs.length > 0) {
		console.log(chalk.bold("Next steps:"));
		console.log(logs.join("\n"));
	}
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
