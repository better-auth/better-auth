import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import prompts from "prompts";
import yoctoSpinner from "yocto-spinner";
import z from "zod";
import { cliVersion } from "../..";
import { generateDrizzleSchema } from "../../generators/drizzle";
import { generatePrismaSchema } from "../../generators/prisma";
import {
	detectPackageManager,
	getPkgManagerStr,
	PACKAGE_MANAGER,
} from "../../utils/check-package-managers";
import {
	possibleAuthConfigPaths,
	possibleClientConfigPaths,
} from "../../utils/config-paths";
import { getPackageInfo, hasDependency } from "../../utils/get-package-info";
import { generateSecretHash, tryCatch } from "../../utils/helper";
import { installDependencies } from "../../utils/install-dependencies";
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
	parseEnvFiles,
	updateEnvFiles,
} from "./utility/env";
import { detectFramework } from "./utility/framework";
import { getFlagVariable } from "./utility/prompt";

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

/**
 * Generate the correct import path for the auth file in route handlers
 */
const generateAuthImportPath = async (
	cwd: string,
	authFilePath: string,
	routeHandlerPath: string,
	framework?: Framework,
): Promise<string> => {
	// Resolve both paths relative to cwd
	const absoluteAuthPath = path.resolve(cwd, authFilePath);
	const resolvedRouteHandlerPath = path.resolve(cwd, routeHandlerPath);
	const routeHandlerDir = path.dirname(resolvedRouteHandlerPath);

	// Special handling for SvelteKit's $lib alias
	if (framework?.id === "sveltekit") {
		const relativeAuthPath = path.relative(cwd, absoluteAuthPath);
		const normalizedPath = relativeAuthPath.replace(/\\/g, "/");

		// Check if auth file is in src/lib
		if (normalizedPath.startsWith("src/lib/") || normalizedPath === "src/lib") {
			const pathAfterLib = normalizedPath.slice("src/lib/".length);
			const pathWithoutExt = pathAfterLib.replace(/\.(ts|js|tsx|jsx)$/, "");
			return pathWithoutExt ? `$lib/${pathWithoutExt}` : "$lib/auth";
		}
	}

	// Special handling for Hono - use relative imports
	if (framework?.id === "hono") {
		let relativePath = path.relative(routeHandlerDir, absoluteAuthPath);
		relativePath = relativePath.replace(/\.(ts|js|tsx|jsx)$/, "");
		if (!relativePath.startsWith(".")) {
			relativePath = `./${relativePath}`;
		}
		return relativePath.replace(/\\/g, "/");
	}

	// Read tsconfig.json to check for path aliases
	const tsconfigPath = path.join(cwd, "tsconfig.json");
	const { data: tsconfigContent } = await tryCatch(
		fs.readFile(tsconfigPath, "utf-8"),
	);

	let aliasPrefix: string | null = null;
	let aliasBasePath: string | null = null;

	if (tsconfigContent) {
		try {
			// Remove comments from JSON (simple approach)
			const cleanedContent = tsconfigContent.replace(
				/\/\*[\s\S]*?\*\/|\/\/.*/g,
				"",
			);
			const tsconfig = JSON.parse(cleanedContent);
			const compilerOptions = tsconfig?.compilerOptions;
			const paths = compilerOptions?.paths;
			const baseUrl = compilerOptions?.baseUrl;

			if (paths) {
				// Look for common aliases like @/*, ~/* etc
				for (const [alias, targets] of Object.entries(paths)) {
					if (
						typeof alias === "string" &&
						alias.endsWith("/*") &&
						Array.isArray(targets) &&
						targets.length > 0
					) {
						const target = targets[0] as string;
						if (target.endsWith("/*")) {
							aliasPrefix = alias.slice(0, -2); // Remove /*
							let basePath = target.slice(0, -2); // Remove /*

							// If baseUrl is set, resolve the base path relative to it
							if (baseUrl && baseUrl !== ".") {
								basePath = path.join(baseUrl, basePath);
							}

							aliasBasePath = basePath;
							break;
						}
					}
				}
			}
		} catch (_e) {
			// Ignore tsconfig parsing errors
		}
	}

	// Get relative path from cwd to auth file
	const relativeAuthPath = path.relative(cwd, absoluteAuthPath);

	// If we have an alias, try to use it
	if (aliasPrefix && aliasBasePath !== null) {
		// Normalize the base path (handle . and ./ and empty string)
		const normalizedBasePath = path.normalize(aliasBasePath);

		console.log(chalk.dim(`    normalizedBasePath: ${normalizedBasePath}`));

		// If base path is "." or empty, it means the alias points to the project root
		if (
			normalizedBasePath === "." ||
			normalizedBasePath === "" ||
			normalizedBasePath === "./"
		) {
			// The auth file is relative to cwd, so we can use the alias directly
			const pathWithoutExt = relativeAuthPath.replace(/\.(ts|js|tsx|jsx)$/, "");
			const result = `${aliasPrefix}/${pathWithoutExt}`.replace(/\\/g, "/");
			console.log(chalk.dim(`    Using alias, returning: ${result}`));
			return result;
		}

		// For other base paths like "src" or "app", check if auth file is within that path
		// Ensure we're comparing normalized paths
		const normalizedRelativePath = relativeAuthPath.replace(/\\/g, "/");
		const normalizedBasePathForward = normalizedBasePath.replace(/\\/g, "/");

		if (
			normalizedRelativePath === normalizedBasePathForward ||
			normalizedRelativePath.startsWith(normalizedBasePathForward + "/")
		) {
			// Remove the base path and use the alias
			let pathAfterBase: string;
			if (normalizedRelativePath === normalizedBasePathForward) {
				pathAfterBase = "";
			} else {
				pathAfterBase = normalizedRelativePath.slice(
					normalizedBasePathForward.length + 1,
				);
			}
			// Remove file extension
			const pathWithoutExt = pathAfterBase.replace(/\.(ts|js|tsx|jsx)$/, "");
			return pathWithoutExt ? `${aliasPrefix}/${pathWithoutExt}` : aliasPrefix;
		}
	}

	let relativePath = path.relative(routeHandlerDir, absoluteAuthPath);

	// Remove file extension
	relativePath = relativePath.replace(/\.(ts|js|tsx|jsx)$/, "");

	// Ensure it starts with ./ or ../
	if (!relativePath.startsWith(".")) {
		relativePath = `./${relativePath}`;
	}

	// Convert Windows paths to Unix paths
	return relativePath.replace(/\\/g, "/");
};

export async function initAction(opts: any) {
	const options = initActionOptionsSchema.parse(opts);
	const cwd = options.cwd;

	// Check if package.json exists (not an empty project)
	let packageJson: Record<string, any> | null = null;
	try {
		packageJson = await getPackageInfo(cwd);
	} catch {
		//
	}
	if (typeof packageJson !== "object" || packageJson === null) {
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

	const additionalSteps: (() => Promise<unknown>)[] = [];

	// Render hero
	//${chalk.italic(chalk.dim(cliVersion.padStart(41, " ")))}
	console.log(
		// boxen(
		"\n" +
			[
				`   ██  ████`,
				`   ████  ██  ${chalk.bold(`Better Auth CLI`)} ${chalk.dim(`(${cliVersion})`)}`,
				`   ██  ████  ${chalk.gray("Welcome to the Better Auth CLI! Let's get you set up.")}`,
			]
				// .map((x) => x.padStart(10))
				.join("\n"),
		// 	{
		// 		padding: 1,
		// 		borderStyle: "doubleSingle",
		// 		dimBorder: true,
		// 	},
		// ),
	);

	// Get package manager information
	const { pm, pmString: _pmString } = await (async () => {
		if (options.packageManager) {
			const [pm, version] = [options.packageManager, null];
			const pmString = getPkgManagerStr({ packageManager: pm, version });
			return { pm, pmString };
		}

		const { packageManager, version } = await detectPackageManager(
			cwd,
			packageJson,
		);
		const pmString = getPkgManagerStr({ packageManager, version });
		return { pm: packageManager, pmString };
	})();

	const depsToInstall = new Map<
		string,
		Partial<Record<"prod" | "dev" | "peer" | "optional", boolean>>
	>();
	const filesToWrite: (() => Promise<unknown>)[] = [];

	// Install Better Auth
	await (async () => {
		const hasBetterAuth = await hasDependency(packageJson, "better-auth");
		if (hasBetterAuth) return;
		await nextStep("Install Better Auth");

		const shouldInstallBetterAuth = await confirm({
			message: `Would you like to install better-auth using ${chalk.bold(pm)}?`,
			initial: true,
		});
		if (isCancel(shouldInstallBetterAuth)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		if (shouldInstallBetterAuth) {
			depsToInstall.set("better-auth", {
				prod: true,
			});
		}
	})();

	let envFiles = new Map<string, string[]>();

	// Handle ENV files
	await (async () => {
		envFiles = await parseEnvFiles(await getEnvFiles(cwd));

		// If no existing ENV files, ask to allow creation of a new one.
		if (envFiles.size === 0) {
			await nextStep("Set Environment Variables");

			const shouldCreateEnv = await confirm({
				message: `Would you like to set environment variables?`,
			});
			if (isCancel(shouldCreateEnv)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			if (shouldCreateEnv) {
				const { providedSecret } = await prompts({
					type: "text",
					name: "providedSecret",
					message: `Better Auth secret (used for encryption, hashing, and signing). ${chalk.dim("(Press Enter to auto generate)")}`,
				});
				if (isCancel(providedSecret)) {
					cancel("✋ Operation cancelled.");
					process.exit(0);
				}
				const { providedURL } = await prompts({
					type: "text",
					name: "providedURL",
					message: `Better Auth Base URL (your auth server URL):`,
					initial: "http://localhost:3000",
				});
				if (isCancel(providedURL)) {
					cancel("✋ Operation cancelled.");
					process.exit(0);
				}

				const secret = providedSecret || generateSecretHash();
				const envs = [
					`BETTER_AUTH_SECRET="${secret}"`,
					`BETTER_AUTH_URL="${providedURL}"`,
				];
				envFiles.set(".env", envs);
				filesToWrite.push(() => createEnvFile(cwd, envs));
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
				const envs: string[] = [];

				for (const v of missingVars) {
					if (v === "BETTER_AUTH_SECRET") {
						const { providedSecret } = await prompts({
							type: "text",
							name: "providedSecret",
							message: `Better Auth secret (used for encryption, hashing, and signing). ${chalk.dim("(Press Enter to auto generate)")}`,
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
							message: `Better Auth base URL (your auth server URL):`,
							initial: "http://localhost:3000",
						});
						if (isCancel(providedURL)) {
							cancel("✋ Operation cancelled.");
							process.exit(0);
						}
						envs.push(`BETTER_AUTH_URL="${providedURL}"`);
					}
				}
				envFiles.set(file, envs);
				filesToWrite.push(() => updateEnvFiles([file], envs));
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
			const secretHash = generateSecretHash();
			for (const file of filesToUpdate) {
				const envs = missingEnvVars
					.find((x) => x.file === file)!
					.var.map((v) => {
						if (v === "BETTER_AUTH_SECRET") {
							return `BETTER_AUTH_SECRET="${secretHash}"`;
						}
						if (v === "BETTER_AUTH_URL") {
							return 'BETTER_AUTH_URL="http://localhost:3000"';
						}
						return `${v}=${v}`;
					});
				filesToWrite.push(() => updateEnvFiles([file], envs));
			}
			return;
		}
	})();

	// Auto-detect framework silently
	const detectedFramework = await detectFramework(cwd, packageJson);
	let framework: Framework =
		detectedFramework || FRAMEWORKS.find((f) => f.id === "next")!;
	const frameworkWasDetected = !!detectedFramework;

	// For Next.js, detect if using App Router or Pages Router
	if (framework.id === "next" && framework.routeHandler) {
		const { data: rootFiles } = await tryCatch(fs.readdir(cwd, "utf-8"));
		const hasAppDir = rootFiles?.some((file) => file === "app");
		const hasPagesDir = rootFiles?.some((file) => file === "pages");
		const hasSrcDir = rootFiles?.some((file) => file === "src");

		let routeHandlerPath = "app/api/auth/[...all]/route.ts";

		// Check for src/app or src/pages
		if (hasSrcDir) {
			const { data: srcFiles } = await tryCatch(
				fs.readdir(path.join(cwd, "src"), "utf-8"),
			);
			const hasSrcApp = srcFiles?.some((file) => file === "app");
			const hasSrcPages = srcFiles?.some((file) => file === "pages");

			if (hasSrcPages) {
				routeHandlerPath = "src/pages/api/auth/[...all].ts";
			} else if (hasSrcApp) {
				routeHandlerPath = "src/app/api/auth/[...all]/route.ts";
			}
		} else if (hasPagesDir) {
			routeHandlerPath = "pages/api/auth/[...all].ts";
		} else if (hasAppDir) {
			routeHandlerPath = "app/api/auth/[...all]/route.ts";
		}

		// Update the framework with the correct path
		framework = {
			...framework,
			routeHandler: {
				...framework.routeHandler,
				path: routeHandlerPath as typeof framework.routeHandler.path,
			},
		};
	}

	// Prompt for auth config file location
	let authConfigFilePath: string | null = null;
	const hasAuthConfigAlready = await (async () => {
		for (const path_ of possibleAuthConfigPaths) {
			const fullPath = path.join(cwd, path_);
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
		// Priority: src/lib/ if src/ exists, otherwise lib/
		const hasSrc = allFiles.some((node) => node === "src");

		let defaultAuthConfigPath: string;
		if (hasSrc) {
			defaultAuthConfigPath = path.join(cwd, "src", "lib", "auth.ts");
		} else {
			defaultAuthConfigPath = path.join(cwd, "lib", "auth.ts");
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

		filesToWrite.push(async () => {
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
		});
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
			} else if (isDirectAdapter(selectedOption)) {
				// If a direct adapter (kysely dialect or mongodb) was selected, use it directly
				database = selectedOption;
			} else {
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
		}

		// Install database dependencies if a database was selected
		if (database) {
			const databaseConfig = getDatabaseCode(database as DatabaseAdapter);
			if (databaseConfig && databaseConfig.dependencies.length > 0) {
				const { shouldInstallDeps } = await prompts({
					type: "confirm",
					name: "shouldInstallDeps",
					message: `Would you like to install the following dependencies: ${[
						...new Set([
							...databaseConfig.dependencies,
							...(databaseConfig.devDependencies || []),
						]),
					]
						.map((x) => chalk.cyan(x))
						.join(", ")}?`,
					initial: true,
				});

				if (isCancel(shouldInstallDeps)) {
					cancel("✋ Operation cancelled.");
					process.exit(0);
				}

				if (shouldInstallDeps) {
					for (const dep of databaseConfig.dependencies) {
						depsToInstall.set(dep, {
							...(depsToInstall.get(dep) || {}),
							prod: true,
						});
					}
					for (const dep of databaseConfig.devDependencies || []) {
						depsToInstall.set(dep, {
							...(depsToInstall.get(dep) || {}),
							dev: true,
						});
					}
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
			if (envFiles.size === 0) return; // No env files to update

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

			if (missingSocialEnvVars.length > 0 && envFiles.size > 0) {
				// Add missing social provider env vars to the file with shortest length
				const firstEnvFile = [...envFiles.keys()].sort(
					(a, b) => path.basename(a).length - path.basename(b).length,
				)[0]!;
				const envVarsToAdd = missingSocialEnvVars
					.filter((x) => x.file === firstEnvFile)
					.flatMap((x) => x.var.map((v) => `${v}=""`));

				if (envVarsToAdd.length > 0) {
					const resolvedPath = path.isAbsolute(firstEnvFile)
						? firstEnvFile
						: path.join(cwd, firstEnvFile);
					filesToWrite.push(() => updateEnvFiles([resolvedPath], envVarsToAdd));
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

		const shouldConfigurePlugins = await confirm({
			message: "Would you like to configure plugins?",
			initial: true,
		});
		if (isCancel(shouldConfigurePlugins)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		if (!shouldConfigurePlugins) return [];

		const selectedPlugins = await multiselect({
			message: `Select the plugins you want to use:`,
			options: Object.entries(tempPluginsConfig).map(([id, plugin]) => ({
				value: id,
				label: plugin.displayName,
			})),
		});
		if (isCancel(selectedPlugins)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		return (selectedPlugins ?? []) as Plugin[];
	})();

	// Generate the auth config file with all selected options
	await (async () => {
		if (!authConfigFilePath) return;

		const authConfigCode = await generateAuthConfigCode({
			plugins,
			database: database as DatabaseAdapter | null,
			framework,
			baseURL: "http://localhost:3000",
			emailAndPassword,
			socialProviders: selectedSocialProviders,
			options,
			installDependency: (d, type) => {
				const dependencies = Array.isArray(d) ? d : [d];
				for (const dep of dependencies) {
					depsToInstall.set(dep, {
						...(depsToInstall.get(dep) || {}),
						[type || "prod"]: true,
					});
				}
			},
		});

		filesToWrite.push(async () => {
			if (!authConfigFilePath) return;
			const { error: writeFileError } = await tryCatch(
				fs.writeFile(authConfigFilePath, authConfigCode, "utf-8"),
			);
			if (writeFileError) {
				const error = `Failed to write auth file at ${authConfigFilePath}: ${writeFileError.message}`;
				log.error(error);
				process.exit(1);
			}
		});
	})();

	// Generate database schema
	await (async () => {
		if (hasAuthConfigAlready) return;
		if (!database) return; // Skip if no database selected
		const dbString = String(database);
		if (dbString === "mongodb") return; // Skip for MongoDB

		// Determine which generator to use based on database type
		const isDrizzle = dbString.startsWith("drizzle-");
		const isPrisma = dbString.startsWith("prisma-");
		const isKysely = isKyselyDialect(dbString);

		// Handle Kysely migrations
		if (isKysely && shouldRunMigration) {
			additionalSteps.push(async () => {
				await nextStep("Migrate Database");

				const s = yoctoSpinner({
					text: "Running database migration...",
					color: "white",
				});
				s.start();

				await new Promise<void>((resolve, reject) => {
					exec(`npx auth migrate`, { cwd }, (error, stdout, stderr) => {
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
					});
				});
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

			filesToWrite.push(async () => {
				if (!schemaResult.code) return;
				// Create directory if it doesn't exist
				const outputDir = path.dirname(fullOutputPath);
				await fs.mkdir(outputDir, { recursive: true });

				// Write schema file
				await fs.writeFile(fullOutputPath, schemaResult.code, "utf-8");
			});

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
		if (!authConfigFilePath) return;

		const { routeHandler } = framework;

		const fullPath = path.resolve(cwd, routeHandler.path);
		const access = fs.access(fullPath, fs.constants.F_OK);
		const { error } = await tryCatch(access);

		if (!error) {
			return;
		}
		await nextStep("Generate Route Handler");

		// Convert absolute path to relative path for display
		const relativeHandlerPath = path.relative(cwd, fullPath);

		const { filePath } = await prompts({
			type: "text",
			name: "filePath",
			message: `Enter the path to the route handler file:`,
			initial: relativeHandlerPath,
		});
		if (isCancel(filePath)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		// Convert user input back to absolute path
		const cleanHandlerPath = filePath.startsWith("/")
			? filePath.slice(1)
			: filePath;
		const absoluteHandlerPath = path.isAbsolute(cleanHandlerPath)
			? cleanHandlerPath
			: path.join(cwd, cleanHandlerPath);

		// Generate the correct import path for the auth file
		const authImportPath = await generateAuthImportPath(
			cwd,
			authConfigFilePath,
			absoluteHandlerPath,
			framework,
		);

		// Replace the hardcoded import path in the route handler code with the generated one
		// Common patterns to replace:
		// - import { auth } from "@/lib/auth"
		// - import { auth } from "~/lib/auth"
		// - import { auth } from "$lib/auth"
		// - import { auth } from "./auth"
		let updatedCode = routeHandler.code as string;
		const importPatterns = [
			/from\s+["']@\/[^"']+["']/,
			/from\s+["']~\/[^"']+["']/,
			/from\s+["']\$lib\/[^"']+["']/,
			/from\s+["']\.\/[^"']+["']/,
			/from\s+["']\.\.\/[^"']+["']/,
		];

		for (const pattern of importPatterns) {
			const newCode = updatedCode.replace(pattern, `from "${authImportPath}"`);
			if (newCode !== updatedCode) {
				updatedCode = newCode;
				break;
			}
		}

		filesToWrite.push(async () => {
			const mkdir = fs.mkdir(path.dirname(absoluteHandlerPath), {
				recursive: true,
			});
			const { error: mkdirError } = await tryCatch(mkdir);
			if (mkdirError) {
				const error = `Failed to create directory at ${path.dirname(absoluteHandlerPath)}: ${mkdirError.message}`;
				log.error(error);
				process.exit(1);
			}

			const writeFile = fs.writeFile(absoluteHandlerPath, updatedCode, "utf-8");
			const { error: writeFileError } = await tryCatch(writeFile);
			if (writeFileError) {
				const error = `Failed to write file at ${absoluteHandlerPath}: ${writeFileError.message}`;
				log.error(error);
				process.exit(1);
			}
		});

		return;
	})();

	// Generate the `auth-client.ts` file.
	await (async () => {
		const hasAuthClientConfigAlready = await (async () => {
			for (const path_ of possibleClientConfigPaths) {
				const fullPath = path.join(cwd, path_);
				const { error } = await tryCatch(
					fs.access(fullPath, fs.constants.F_OK),
				);
				if (!error) {
					return true;
				}
			}
			return false;
		})();
		if (hasAuthClientConfigAlready) return;
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
			options,
			installDependency: (d, type) => {
				const dependencies = Array.isArray(d) ? d : [d];
				for (const dep of dependencies) {
					depsToInstall.set(dep, {
						...(depsToInstall.get(dep) || {}),
						[type || "prod"]: true,
					});
				}
			},
		});

		const { data: allFiles, error } = await tryCatch(fs.readdir(cwd, "utf-8"));
		if (error) {
			log.error(`Failed to read directory: ${error.message}`);
			process.exit(1);
		}

		// Determine default auth-client config path based on project structure
		// Priority: src/lib/ if src/ exists, otherwise lib/
		const hasSrc = allFiles.some((node) => node === "src");

		let defaultAuthClientPath: string;
		if (hasSrc) {
			defaultAuthClientPath = path.join(cwd, "src", "lib", "auth-client.ts");
		} else {
			defaultAuthClientPath = path.join(cwd, "lib", "auth-client.ts");
		}

		// Convert absolute path to relative path for display
		const relativeDefaultClientPath = path.relative(cwd, defaultAuthClientPath);

		const { filePath } = await prompts({
			type: "text",
			name: "filePath",
			message: `Enter the path to the auth-client.ts file:`,
			initial: relativeDefaultClientPath,
		});
		if (isCancel(filePath)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		// Convert relative path back to absolute path
		const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
		const absoluteClientFilePath = path.isAbsolute(cleanPath)
			? cleanPath
			: path.join(cwd, cleanPath);

		filesToWrite.push(async () => {
			const { error: mkdirError } = await tryCatch(
				fs.mkdir(path.dirname(absoluteClientFilePath), { recursive: true }),
			);
			if (mkdirError) {
				const error = `Failed to create auth client directory at ${path.dirname(absoluteClientFilePath)}: ${mkdirError.message}`;
				log.error(error);
				process.exit(1);
			}
			const { error: writeFileError } = await tryCatch(
				fs.writeFile(absoluteClientFilePath, authClientCode, "utf-8"),
			);
			if (writeFileError) {
				const error = `Failed to write auth client file at ${absoluteClientFilePath}: ${writeFileError.message}`;
				log.error(error);
				process.exit(1);
			}
		});
	})();

	// generate and update files
	await (async () => {
		if (filesToWrite.length === 0) return;
		await nextStep("Generate Files");

		const s = yoctoSpinner({
			text: "Generating files...",
			color: "white",
		});
		s.start();

		for (const exec of filesToWrite) {
			await exec();
		}

		s.success("Files generated successfully!");
	})();

	// Install dependencies
	await (async () => {
		if (depsToInstall.size === 0) return;
		await nextStep("Install Dependencies");

		const s = yoctoSpinner({
			text: "Installing dependencies...",
			color: "white",
		});
		s.start();

		const deps = {
			prod: new Set<string>(),
			dev: new Set<string>(),
		};
		for (const [dep, cfg] of depsToInstall) {
			if (cfg.prod) {
				deps.prod.add(dep);
			}
			if (cfg.dev) {
				deps.dev.add(dep);
			}
		}

		for (const [type, dependencies] of Object.entries(deps)) {
			await installDependencies({
				cwd,
				dependencies: [...dependencies],
				packageManager: pm,
				type: type as keyof typeof deps,
			});
		}

		s.success("Dependencies installed successfully!");
	})();

	for (const step of additionalSteps) {
		await step();
	}

	const connectResponse = await prompts({
		type: "confirm",
		name: "connect",
		message:
			"Would you like to connect your app to Better Auth infrastructure?",
		initial: true,
	});
	if (connectResponse.connect) {
		await open("https://www.better-auth.com/onboarding");
		console.log(
			chalk.cyan("\n→ ") +
				"Opening Better Auth onboarding in your browser...\n",
		);
	}

	console.log(
		chalk.green(`\n✔ `) + chalk.bold("Success! ") + "Project setup complete.\n",
	);

	const logs: string[] = [];

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
		if ((isDrizzle || isPrisma || isKysely) && !shouldRunMigration) {
			let command: string;
			if (isDrizzle) {
				command = "npx drizzle-kit push";
			} else if (isPrisma) {
				command = "npx prisma migrate dev";
			} else {
				command = "npx auth migrate";
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
const initBuilder = new Command("init")
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

const pluginArgumentOptionsSchema: Record<string, z.ZodType<any>> = {};

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
	packageManager: z.enum(PACKAGE_MANAGER).optional(),
	...pluginArgumentOptionsSchema,
});
