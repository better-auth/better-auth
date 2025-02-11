import semver from "semver";
import { format as prettierFormat } from "prettier";
import { Command } from "commander";
import { getConfig } from "../utils/get-config";
import { z } from "zod";
import { existsSync } from "fs";
import path from "path";
import { type BetterAuthOptions } from "better-auth";
import fs from "fs/promises";
import { getPackageInfo } from "../utils/get-package-info";
import { diffWordsWithSpace } from "diff";
import chalk from "chalk";
import { generateAuthConfig } from "../generators/auth-config";
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
	text,
} from "@clack/prompts";
import { installDependencies } from "../utils/install-dependencies";
import { checkPackageManagers } from "../utils/check-package-managers";
import { formatMilliseconds } from "../utils/format-ms";

/**
 * Should only use any database that is core DBs, and supports the BetterAuth CLI generate functionality.
 */
const supportedDatabases = [
	// Built-in kysely
	"sqlite",
	"mysql",
	"mssql",
	"postgres",
	// Drizzle
	"drizzle:pg",
	"drizzle:mysql",
	"drizzle:sqlite",
	// Prisma
	"prisma:pg",
	"prisma:mysql",
	"prisma:sqlite",
	// Mongo
	"mongodb",
] as const;

export type SupportedDatabases = (typeof supportedDatabases)[number];

export const supportedPlugins = [
	{ id: "two-factor", name: "twoFactor", path: `better-auth/plugins` },
	{ id: "username", name: "username", path: `better-auth/plugins` },
	{ id: "anonymous", name: "anonymous", path: `better-auth/plugins` },
	{ id: "phone-number", name: "phoneNumber", path: `better-auth/plugins` },
	{ id: "magic-link", name: "magicLink", path: `better-auth/plugins` },
	{ id: "email-otp", name: "emailOTP", path: `better-auth/plugins` },
	{ id: "passkey", name: "passkey", path: `better-auth/plugins/passkey` },
	{ id: "generic-oauth", name: "genericOAuth", path: `better-auth/plugins` },
	{ id: "one-tap", name: "oneTap", path: `better-auth/plugins` },
	{ id: "api-key", name: "apiKey", path: `better-auth/plugins` },
	{ id: "admin", name: "admin", path: `better-auth/plugins` },
	{ id: "organization", name: "organization", path: `better-auth/plugins` },
	{ id: "oidc", name: "oidcProvider", path: `better-auth/plugins` },
	{ id: "sso", name: "sso", path: `better-auth/plugins/sso` },
	{ id: "bearer", name: "bearer", path: `better-auth/plugins` },
	{ id: "multi-session", name: "multiSession", path: `better-auth/plugins` },
	{ id: "oauth-proxy", name: "oAuthProxy", path: `better-auth/plugins` },
	{ id: "open-api", name: "openAPI", path: `better-auth/plugins` },
	{ id: "jwt", name: "jwt", path: `better-auth/plugins` },
	{ id: "next-cookies", name: "nextCookies", path: `better-auth/next-js` },
] as const;

export type SupportedPlugin = (typeof supportedPlugins)[number];

const defaultFormatOptions = {
	trailingComma: "all" as const,
	useTabs: false,
	tabWidth: 4,
};

const optionsSchema = z.object({
	cwd: z.string(),
	name: z.string().optional(),
	config: z.string().optional(),
	database: z.enum(supportedDatabases).optional(),
	"skip-db": z.boolean().optional(),
	"skip-plugins": z.boolean().optional(),
	"package-manager": z.string().optional(),
});

export async function initAction(opts: any) {
	console.log();
	intro("Initializing Better Auth");

	const options = optionsSchema.parse(opts);

	const cwd = path.resolve(options.cwd);
	let packageManagerPreference: "bun" | "pnpm" | "yarn" | "npm" | undefined =
		undefined;

	// ===== package.json =====
	let packageInfo: Record<string, any>;
	try {
		packageInfo = getPackageInfo(cwd);
	} catch (error) {
		log.error(`❌ Couldn't read your package.json file. (${cwd})`);
		log.error(JSON.stringify(error, null, 2));
		process.exit(1);
	}

	// ===== install better-auth =====
	const s = spinner({ indicator: "dots" });
	s.start(`Checking better-auth installation`);

	let latest_betterauth_version: string;
	try {
		latest_betterauth_version = await getLatestNpmVersion("better-auth");
	} catch (error) {
		log.error(`❌ Couldn't get latest version of better-auth.`);
		log.error(JSON.stringify(error, null, 2));
		process.exit(1);
	}

	if (
		!packageInfo.dependencies ||
		!Object.keys(packageInfo.dependencies).includes("better-auth")
	) {
		s.stop("Finished fetching latest version of better-auth.");
		const s2 = spinner({ indicator: "dots" });
		const shouldInstallBetterAuthDep = await confirm({
			message: `Would you like to install Better Auth?`,
		});
		if (isCancel(shouldInstallBetterAuthDep)) {
			cancel(`✋ Operation cancelled.`);
			process.exit(0);
		}
		if (packageManagerPreference === undefined) {
			packageManagerPreference = await getPackageManager();
		}
		if (shouldInstallBetterAuthDep) {
			s2.start(
				`Installing Better Auth using ${chalk.bold(packageManagerPreference)}`,
			);
			try {
				const start = Date.now();
				await installDependencies({
					dependencies: ["better-auth@latest"],
					packageManager: packageManagerPreference,
					cwd: cwd,
				});
				s2.stop(
					`Better Auth installed ${chalk.greenBright(
						`successfully`,
					)}! ${chalk.gray(`(${formatMilliseconds(Date.now() - start)}ms)`)}`,
				);
			} catch (error: any) {
				s2.stop(`Failed to install Better Auth:`);
				log.error(error.message);
				process.exit(1);
			}
		}
	} else if (
		packageInfo.dependencies["better-auth"] !== "workspace:*" &&
		semver.lt(
			semver.coerce(packageInfo.dependencies["better-auth"])?.toString()!,
			semver.clean(latest_betterauth_version)!,
		)
	) {
		s.stop("Finished fetching latest version of better-auth.");
		const shouldInstallBetterAuthDep = await confirm({
			message: `Your current Better Auth dependency is out-of-date. Would you like to update it? (${chalk.bold(
				packageInfo.dependencies["better-auth"],
			)} → ${chalk.bold(`v${latest_betterauth_version}`)})`,
		});
		if (isCancel(shouldInstallBetterAuthDep)) {
			cancel(`✋ Operation cancelled.`);
			process.exit(0);
		}
		if (shouldInstallBetterAuthDep) {
			if (packageManagerPreference === undefined) {
				packageManagerPreference = await getPackageManager();
			}
			const s = spinner({ indicator: "dots" });
			s.start(
				`Updating Better Auth using ${chalk.bold(packageManagerPreference)}`,
			);
			try {
				const start = Date.now();
				await installDependencies({
					dependencies: ["better-auth@latest"],
					packageManager: packageManagerPreference,
					cwd: cwd,
				});
				s.stop(
					`Better Auth updated ${chalk.greenBright(
						`successfully`,
					)}! ${chalk.gray(`(${formatMilliseconds(Date.now() - start)})`)}`,
				);
			} catch (error: any) {
				s.stop(`Failed to update Better Auth:`);
				log.error(error.message);
				process.exit(1);
			}
		}
	} else {
		s.stop(`Better Auth dependencies are ${chalk.greenBright(`up-to-date`)}!`);
	}

	// ===== appName =====

	const packageJson = getPackageInfo(cwd);
	let appName: string;
	if (!options.name && !packageJson.name) {
		const newAppName = await text({
			message: "What is the name of your application?",
			validate(value) {
				const pkgNameRegex =
					/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
				return pkgNameRegex.test(value) ? undefined : "Invalid package name";
			},
		});
		if (isCancel(newAppName)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		appName = newAppName;
	} else {
		appName = options.name || packageJson.name;
	}

	// ===== config path =====

	let possiblePaths = ["auth.ts", "auth.tsx", "auth.js", "auth.jsx"];
	possiblePaths = [
		...possiblePaths,
		...possiblePaths.map((it) => `lib/server/${it}`),
		...possiblePaths.map((it) => `server/${it}`),
		...possiblePaths.map((it) => `lib/${it}`),
		...possiblePaths.map((it) => `utils/${it}`),
	];
	possiblePaths = [
		...possiblePaths,
		...possiblePaths.map((it) => `src/${it}`),
		...possiblePaths.map((it) => `app/${it}`),
	];

	let config_path: string = "";
	if (options.config) {
		config_path = path.join(cwd, options.config);
	} else {
		for (const possiblePath of possiblePaths) {
			const doesExist = existsSync(path.join(cwd, possiblePath));
			if (doesExist) {
				config_path = path.join(cwd, possiblePath);
				break;
			}
		}
	}

	if (!config_path) {
		log.info(`No auth config file found.`);
	} else {
		log.info(`Found auth config file. ${chalk.gray(`(${config_path})`)}`);
	}

	// ===== config =====

	if (!existsSync(cwd)) {
		log.error(`❌ The directory "${cwd}" does not exist.`);
		process.exit(1);
	}
	let config: BetterAuthOptions;
	const resolvedConfig = await getConfig({
		cwd,
		configPath: options.config,
	});
	if (resolvedConfig) {
		if (resolvedConfig.appName) appName = resolvedConfig.appName;
		config = resolvedConfig;
	} else {
		config = {
			appName,
			plugins: [],
		};
	}

	const format = async (code: string) =>
		await prettierFormat(code, {
			filepath: config_path,
			...defaultFormatOptions,
		});

	// ===== getting user auth config =====

	let current_user_config: string;
	try {
		current_user_config = await fs.readFile(config_path, "utf8");
	} catch (error) {
		log.error(`❌ Failed to read your auth config file: ${config_path}`);
		log.error(JSON.stringify(error, null, 2));
		process.exit(1);
	}

	// ===== database =====

	let database: SupportedDatabases | null = null;
	if (options["skip-db"] === undefined && !config.database) {
		const result = await confirm({
			message: `Would you like to set up your ${chalk.bold(`database`)}?`,
			initialValue: true,
		});
		if (isCancel(result)) {
			cancel(`✋ Operating cancelled.`);
			process.exit(0);
		}
		options["skip-db"] = !result;
	}

	if (!config.database && !options["skip-db"]) {
		if (options.database) {
			database = options.database;
		} else {
			const prompted_database = await select({
				message: "Choose a Database Dialect",
				options: supportedDatabases.map((it) => ({ value: it, label: it })),
			});
			if (isCancel(prompted_database)) {
				cancel(`✋ Operating cancelled.`);
				process.exit(0);
			}
			database = prompted_database;
		}
	}

	// ===== plugins =====
	let add_plugins: SupportedPlugin[] = [];
	let existing_plugins: string[] = config.plugins
		? config.plugins.map((x) => x.id)
		: [];

	if (options["skip-plugins"] !== false) {
		if (config.plugins === undefined) {
			const skipPLugins = await confirm({
				message: `Would you like to set up ${chalk.bold(`plugins`)}?`,
			});
			if (isCancel(skipPLugins)) {
				cancel(`✋ Operating cancelled.`);
				process.exit(0);
			}
			options["skip-plugins"] = !skipPLugins;
		} else {
			const skipPLugins = await confirm({
				message: `Would you like to add new ${chalk.bold(`plugins`)}?`,
			});
			if (isCancel(skipPLugins)) {
				cancel(`✋ Operating cancelled.`);
				process.exit(0);
			}
			options["skip-plugins"] = !skipPLugins;
		}
	}

	// ===== suggest nextCookies plugin =====

	if (!options["skip-plugins"]) {
		const possible_next_config_paths = [
			"next.config.js",
			"next.config.ts",
			"next.config.mjs",
			".next/server/next.config.js",
			".next/server/next.config.ts",
			".next/server/next.config.mjs",
		];
		let is_next_framework = false;
		for (const possible_next_config_path of possible_next_config_paths) {
			if (existsSync(path.join(cwd, possible_next_config_path))) {
				is_next_framework = true;
				break;
			}
		}
		if (!existing_plugins.includes("next-cookies") && is_next_framework) {
			const result = await confirm({
				message: `It looks like you're using NextJS. Do you want to add the next-cookies plugin? ${chalk.bold(
					`(Recommended)`,
				)}`,
			});
			if (isCancel(result)) {
				cancel(`✋ Operating cancelled.`);
				process.exit(0);
			}
			if (result) {
				add_plugins.push(
					supportedPlugins.find((x) => x.id === "next-cookies")!,
				);
			}
		}
	}

	// ===== generate new config =====

	const shouldUpdateAuthConfig =
		!(options["skip-plugins"] || add_plugins.length === 0) || database !== null;

	if (shouldUpdateAuthConfig) {
		const s = spinner({ indicator: "dots" });
		s.start("Preparing your new auth config");

		let new_user_config: string;
		try {
			new_user_config = await format(current_user_config);
		} catch (error) {
			log.error(
				`We found your auth config file, however we failed to format your auth config file. It's likely your file has a syntax error. Please fix it and try again.`,
			);
			process.exit(1);
		}

		const { generatedCode, dependencies, envs } = await generateAuthConfig({
			current_user_config,
			format,
			//@ts-ignore
			s,
			database,
			plugins: add_plugins,
		});
		new_user_config = generatedCode;
		s.stop("🎉 Your new auth config ready! 🎉");

		const shouldShowDiff = await confirm({
			message: `Do you want to see the ${chalk.bold(`diff`)}?`,
		});

		if (isCancel(shouldShowDiff)) {
			cancel(`✋ Operating cancelled.`);
			process.exit(0);
		}

		// ===== Show diff =====

		if (shouldShowDiff) {
			const diffed = getStyledDiff(
				await format(current_user_config),
				new_user_config,
			);
			log.info("Your new auth config:");
			log.message(diffed);
		}

		// ===== apply changes ====

		const shouldApply = await confirm({
			message: `Do you want to ${chalk.bold(
				`apply changes`,
			)} to your auth config?`,
		});
		if (isCancel(shouldApply)) {
			cancel(`✋ Operation cancelled.`);
			process.exit(0);
		}
		if (shouldApply) {
			try {
				await fs.writeFile(config_path, new_user_config);
			} catch (error) {
				log.error(`Failed to write your auth config file: ${config_path}`);
				log.error(JSON.stringify(error, null, 2));
				process.exit(1);
			}
			log.success(`🚀 Auth config successfully applied!`);
		} else {
			log.info(`✋ Skipping auth config update.`);
		}

		// ===== install dependencies ====

		if (dependencies.length !== 0 && shouldApply) {
			const shouldInstallDeps = await confirm({
				message: `Do you want to install the nessesary dependencies? (${dependencies
					.map((x) => chalk.bold(x))
					.join(", ")})`,
			});
			if (isCancel(shouldInstallDeps)) {
				cancel(`✋ Operation cancelled.`);
				process.exit(0);
			}
			if (shouldInstallDeps) {
				const s = spinner({ indicator: "dots" });
				if (packageManagerPreference === undefined) {
					packageManagerPreference = await getPackageManager();
				}
				s.start(
					`Installing dependencies using ${chalk.bold(
						packageManagerPreference,
					)}...`,
				);
				try {
					const start = Date.now();
					await installDependencies({
						dependencies,
						packageManager: packageManagerPreference,
						cwd: cwd,
					});
					s.stop(
						`Dependencies installed ${chalk.greenBright(
							`successfully`,
						)}! ${chalk.gray(`(${formatMilliseconds(Date.now() - start)})`)}`,
					);
				} catch (error: any) {
					s.stop(
						`Failed to install dependencies using ${packageManagerPreference}:`,
					);
					log.error(error.message);
					process.exit(1);
				}
			} else {
				log.info("Skipping dependency installation.");
			}
		}

		// ===== update ENVs =====
		if (envs.length !== 0 && shouldApply) {
			log.step(
				`There are ${envs.length} environment variables for your database of choice.`,
			);
			const shouldUpdateEnvs = await confirm({
				message: `Would you like us to update your ENV files?`,
			});
			if (isCancel(shouldUpdateEnvs)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			if (shouldUpdateEnvs) {
				const envFiles = await getEnvFiles(cwd);
				const filesToUpdate = await multiselect({
					message: "Select the .env files you want to update",
					options: envFiles.map((x) => ({
						value: path.join(cwd, x),
						label: x,
						hint:
							x === ".env.example" ? "We'll add example values!" : undefined,
					})),
				});
				if (isCancel(filesToUpdate)) {
					cancel("✋ Operation cancelled.");
					process.exit(0);
				}
				try {
					await updateEnvs({
						files: filesToUpdate,
						envs,
					});
				} catch (error) {
					log.error(`Failed to update .env files:`);
					log.error(JSON.stringify(error, null, 2));
					process.exit(1);
				}
				log.success(`🚀 ENV files successfully updated!`);
			}
		}

		// ===== prompt to run migrate/generate ====
		if (database !== null && shouldApply) {
			log.info(
				`Don't forget to run ${chalk.yellowBright(
					`npx @better-auth/cli generate`,
				)} to generate your schema!`,
			);
			outro(`Happy hacking! 👋`);
		}
	} else {
		outro(`Happy hacking! 👋`);
	}
	console.log();
	process.exit(0);
}

// ===== Init Command =====

export const init = new Command("init")
	.option("--name <name>", "The name of your application.")
	.option("-c, --cwd <cwd>", "The working directory.", process.cwd())
	.option(
		"--config <config>",
		"The path to the auth configuration file. defaults to the first `auth.ts` file found.",
	)
	.option("--skip-db", "Skip the database setup.")
	.option("--skip-plugins", "Skip the plugins setup.")
	.option(
		"--package-manager <package-manager>",
		"The package manager you want to use.",
	)
	.action(initAction);

/**
 * Helper function to get a styled diff between two strings.
 */
function getStyledDiff(oldStr: string, newStr: string) {
	const diff = diffWordsWithSpace(oldStr, newStr);
	let result = "";

	diff.forEach((part) => {
		if (part.added) {
			result += chalk.green(part.value);
		} else if (part.removed) {
			result += chalk.red(part.value);
		} else {
			result += chalk.gray(part.value);
		}
	});
	return result;
}

async function getLatestNpmVersion(packageName: string): Promise<string> {
	try {
		const response = await fetch(`https://registry.npmjs.org/${packageName}`);

		if (!response.ok) {
			throw new Error(`Package not found: ${response.statusText}`);
		}

		const data = await response.json();
		return data["dist-tags"].latest; // Get the latest version from dist-tags
	} catch (error: any) {
		throw error?.message;
	}
}

async function getPackageManager() {
	const { hasBun, hasPnpm } = await checkPackageManagers();
	if (!hasBun && !hasPnpm) return "npm";

	const packageManagerOptions: {
		value: "bun" | "pnpm" | "yarn" | "npm";
		label?: string;
		hint?: string;
	}[] = [];

	if (hasPnpm) {
		packageManagerOptions.push({
			value: "pnpm",
			label: "pnpm",
			hint: "recommended",
		});
	}
	if (hasBun) {
		packageManagerOptions.push({
			value: "bun",
			label: "bun",
		});
	}
	packageManagerOptions.push({
		value: "npm",
		hint: "not recommended",
	});

	let packageManager = await select({
		message: "Choose a package manager",
		options: packageManagerOptions,
	});
	if (isCancel(packageManager)) {
		cancel(`Operation cancelled.`);
		process.exit(0);
	}
	return packageManager;
}

async function getEnvFiles(cwd: string) {
	const files = await fs.readdir(cwd);
	return files.filter((x) => x.startsWith(".env"));
}

async function updateEnvs({
	envs,
	files,
}: {
	/**
	 * The ENVs to append to the file
	 */
	envs: string[];
	/**
	 * Full file paths
	 */
	files: string[];
}) {
	for (const file of files) {
		const content = await fs.readFile(file, "utf8");
		const lines = content.split("\n");
		const newLines = envs.map(
			(x) => `# ${x}="${getEnvDescription(x) ?? "some value"}"`,
		);
		newLines.push("");
		newLines.push(...lines);
		await fs.writeFile(file, newLines.join("\n"), "utf8");
	}

	function getEnvDescription(env: string) {
		if (env === "DATABASE_HOST") {
			return "The host of your database";
		}
		if (env === "DATABASE_PORT") {
			return "The port of your database";
		}
		if (env === "DATABASE_USER") {
			return "The username of your database";
		}
		if (env === "DATABASE_PASSWORD") {
			return "The password of your database";
		}
		if (env === "DATABASE_NAME") {
			return "The name of your database";
		}
	}
}
