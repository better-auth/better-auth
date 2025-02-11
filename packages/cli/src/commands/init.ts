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
	{ id: "next-cookies", name: "nextCookies", path: `better-auth/plugins` },
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
	skipDb: z.boolean().optional(),
	skipPlugins: z.boolean().optional(),
});

export async function initAction(plgns: string[] | undefined, opts: any) {
	console.log();
	intro("Initializing Better Auth");
	log.message("");

	const options = optionsSchema.parse(opts);

	const {
		data: plugins,
		success: successfullyParsedPlugins,
		error: errorParsingPlugins,
	} = z
		.array(
			z.enum(
				//@ts-ignore
				supportedPlugins.map((p) => p.id),
				{
					message: `Invalid plugin. Supported plugins include: ${supportedPlugins.join(
						", ",
					)}.`,
				},
			),
		)
		.safeParse(plgns);

	if (!successfullyParsedPlugins) {
		log.error(errorParsingPlugins.issues[0].message);
		process.exit(1);
	}

	// ===== package.json =====
	let packageInfo: Record<string, any>;
	try {
		packageInfo = getPackageInfo(options.cwd);
	} catch (error) {
		log.error(`Couldn't read your package.json file. (${options.cwd})`);
		log.error(JSON.stringify(error, null, 2));
		process.exit(1);
	}

	// ===== appName =====

	const packageJson = getPackageInfo(options.cwd);
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
			cancel("Operation cancelled.");
			process.exit(0);
		}
		appName = newAppName;
	} else {
		appName = options.name || packageJson.name;
	}

	// ===== config =====

	const cwd = path.resolve(options.cwd);
	if (!existsSync(cwd)) {
		log.error(`The directory "${cwd}" does not exist.`);
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
		log.error(`Failed to read your auth config file: ${config_path}`);
		log.error(JSON.stringify(error, null, 2));
		process.exit(1);
	}

	// ===== database =====

	let database: SupportedDatabases | null = null;
	if (options.skipDb === undefined && !config.database) {
		const result = await confirm({
			message: `Would you like to set up your ${chalk.bold(`database`)}?`,
			initialValue: true,
		});
		if (isCancel(result)) {
			cancel(`Operating cancelled.`);
			process.exit(0);
		}
		options.skipDb = !result;
	}

	if (!config.database && !options.skipDb) {
		if (options.database) {
			database = options.database;
		} else {
			const prompted_database = await select({
				message: "Choose a Database Dialect",
				options: supportedDatabases.map((it) => ({ value: it, label: it })),
			});
			if (isCancel(prompted_database)) {
				cancel(`Operating cancelled.`);
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

	if (options.skipPlugins === undefined) {
		if (config.plugins === undefined) {
			const skipPLugins = await confirm({
				message: `Would you like to set up ${chalk.bold(`plugins`)}?`,
			});
			if (isCancel(skipPLugins)) {
				cancel(`Operating cancelled.`);
				process.exit(0);
			}
			options.skipPlugins = !skipPLugins;
		} else {
			const skipPLugins = await confirm({
				message: `Would you like to add new ${chalk.bold(`plugins`)}?`,
			});
			if (isCancel(skipPLugins)) {
				cancel(`Operating cancelled.`);
				process.exit(0);
			}
			options.skipPlugins = !skipPLugins;
		}
	}
	if (!options.skipPlugins) {
		if (!plugins || plugins.length === 0) {
			const prompted_plugins = await multiselect({
				message: "Select your new plugins",
				options: supportedPlugins
					.filter(
						(x) => x.id !== "next-cookies" && !existing_plugins.includes(x.id),
					)
					.map((x) => ({ value: x.id, label: x.id })),
			});
			if (isCancel(prompted_plugins)) {
				cancel(`Operating cancelled.`);
				process.exit(0);
			}
			add_plugins = prompted_plugins.map(
				(x) => supportedPlugins.find((y) => y.id === x)!,
			);
		} else {
			add_plugins = plugins
				.filter((x) => !existing_plugins.includes(x))
				.map((x) => supportedPlugins.find((y) => y.id === x)!);
		}
	}

	// ===== suggest nextCookies plugin =====

	if (!options.skipPlugins) {
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
				message: `It looks like you're using Next.JS. Do you want to add the next-cookies plugin?`,
			});
			if (isCancel(result)) {
				cancel(`Operating cancelled.`);
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
		!(options.skipPlugins || add_plugins.length === 0) || database !== null;

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
		s.stop("New auth config ready. 🎉");

		const shouldShowDiff = await confirm({
			message: `Do you want to see the diff?`,
		});
		if (isCancel(shouldShowDiff)) {
			cancel(`Operating cancelled.`);
			process.exit(0);
		}

		if (shouldShowDiff) {
			const diffed = getStyledDiff(
				await format(current_user_config),
				new_user_config,
			);
			log.info("New auth config:");
			log.message(diffed);
		}

		const shouldApply = await confirm({
			message: `Do you want to apply the changes to your auth config?`,
		});
		if (isCancel(shouldApply)) {
			cancel(`Operation cancelled.`);
			process.exit(0);
		}
		try {
			await fs.writeFile(config_path, new_user_config);
		} catch (error) {
			log.error(`Failed to write your auth config file: ${config_path}`);
			log.error(JSON.stringify(error, null, 2));
			process.exit(1);
		}
		log.success(`🚀 Auth config successfully applied!`);

		if (dependencies.length !== 0) {
			const shouldInstallDeps = await confirm({
				message: `Do you want to install the nessesary dependencies? (${dependencies
					.map((x) => chalk.bold(x))
					.join(", ")})`,
			});
			if (isCancel(shouldInstallDeps)) {
				cancel(`Operation cancelled.`);
				process.exit(0);
			}
			if (shouldInstallDeps) {
				const { hasBun, hasPnpm } = await checkPackageManagers();

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

				const s = spinner({ indicator: "dots" });
				s.start(
					`Installing dependencies using ${chalk.bold(packageManager)}...`,
				);
				try {
					const start = Date.now();
					await installDependencies({
						dependencies,
						packageManager,
						cwd: options.cwd,
					});
					s.stop(
						`Dependencies installed successfully! ${chalk.gray(
							`(${formatMilliseconds(Date.now() - start)}ms)`,
						)}`,
					);
				} catch (error: any) {
					s.stop(`Failed to install dependencies using ${packageManager}:`);
					log.error(error.message);
					process.exit(1);
				}
			} else {
				log.info("Skipping dependency installation.");
			}
		}
	}
	process.exit(0);
}

// ===== Init Command =====

export const init = new Command("init")
	.argument("[plugins...]", "The plugins to install.")
	.option("--name <name>", "The name of your application.")
	.option("-c, --cwd <cwd>", "The working directory.", process.cwd())
	.option(
		"--config <config>",
		"The path to the auth configuration file. defaults to the first `auth.ts` file found.",
	)
	.option("--database <database>", "The database dialect you want to use.")
	.option("--skipDb", "Skip the database setup.")
	.option("--skipPlugins", "Skip the plugins setup.")
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
