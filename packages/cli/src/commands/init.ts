import { format as prettierFormat } from "prettier";
import { Command } from "commander";
import { getConfig } from "../utils/get-config";
import { z } from "zod";
import { existsSync } from "fs";
import path from "path";
import { logger, type BetterAuthOptions } from "better-auth";
import yoctoSpinner from "yocto-spinner";
import prompts from "prompts";
import fs from "fs/promises";
import { getPackageInfo } from "../utils/get-package-info";
import { diffWordsWithSpace } from "diff";
import chalk from "chalk";
import { generateAuthConfig } from "../generators/authConfig";

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

const supportedPlugins = [
	"two-factor",
	"username",
	"anonymous",
	"phone-number",
	"magic-link",
	"email-otp",
	"passkey",
	"generic-oauth",
	"one-tap",
	"api-key",
	"admin",
	"organization",
	"oidc",
	"sso",
	"bearer",
	"multi-session",
	"oauth-proxy",
	"open-api",
	"jwt",
	"next-cookies",
] as const;

export type SupportedPlugins = (typeof supportedPlugins)[number];

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
	const options = optionsSchema.parse(opts);

	const {
		data: plugins,
		success: successfullyParsedPlugins,
		error: errorParsingPlugins,
	} = z
		.array(
			z.enum(supportedPlugins, {
				message: `Invalid plugin. Supported plugins include: ${supportedPlugins.join(
					", ",
				)}.`,
			}),
		)
		.safeParse(plgns);

	if (!successfullyParsedPlugins) {
		logger.error(errorParsingPlugins.issues[0].message);
		process.exit(1);
	}

	// ===== appName =====

	const packageJson = getPackageInfo(options.cwd);
	let appName: string;
	if (!options.name && !packageJson.name) {
		const prompted_name = await prompts({
			name: "appName",
			type: "text",
			message: "What is the name of your application?",
		});
		appName = prompted_name["appName"];
	} else {
		appName = options.name || packageJson.name;
	}

	// ===== config =====

	const cwd = path.resolve(options.cwd);
	if (!existsSync(cwd)) {
		logger.error(`The directory "${cwd}" does not exist.`);
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
		logger.error(`Failed to read your auth config file: ${config_path}`, error);
		process.exit(1);
	}

	// ===== database =====

	let database: SupportedDatabases | null = null;
	if (options.skipDb === undefined && !config.database) {
		options.skipDb = !(
			await prompts({
				type: "confirm",
				name: "skipDb",
				message: `Would you like to set up your ${chalk.bold(`database`)}?`,
			})
		)["skipDb"];
	}

	if (!config.database && !options.skipDb) {
		if (options.database) {
			database = options.database;
		} else {
			const prompted_database = await prompts({
				name: "Database",
				type: "select",
				message: "What database dialect do you want to use?",
				choices: supportedDatabases.map((it) => ({ title: it, value: it })),
			});
			database = prompted_database["Database"];
		}
	}

	// ===== plugins =====

	let add_plugins: SupportedPlugins[] = [];
	let existing_plugins: string[] = config.plugins
		? config.plugins.map((x) => x.id)
		: [];

	if (options.skipPlugins === undefined) {
		options.skipPlugins = !(
			await prompts({
				type: "confirm",
				name: "skipPlugins",
				message: `Would you like to set up ${chalk.bold(`plugins`)}?`,
			})
		)["skipPlugins"];
	}
	if (!options.skipPlugins) {
		if (!plugins || plugins.length === 0) {
			let plugins_to_prompt = supportedPlugins
				.filter((x) => x !== "next-cookies")
				.map((plugin_id) => {
					if (existing_plugins.find((x) => x === plugin_id))
						return { title: plugin_id, value: plugin_id, disabled: true };
					return { title: plugin_id, value: plugin_id };
				})
				.sort((a) => (a.disabled ? 1 : -1));
			const prompted_plugins = await prompts({
				name: "plugins",
				type: "multiselect",
				message: "What plugins do you want to use?",
				choices: plugins_to_prompt,
				hint: "- Space to select. Return to submit",
				instructions: false,
				warn: "You already have that plugin enabled",
			});
			add_plugins = prompted_plugins["plugins"];
		} else {
			add_plugins = plugins.filter((x) => !existing_plugins.includes(x));
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
			const result = await prompts({
				type: "confirm",
				name: "confirm",
				message: `It looks like you're using Next.JS. Do you want to add the next-cookies plugin?`,
			});
			if (result.confirm) {
				add_plugins.push("next-cookies");
			}
		}
	}

	// ===== generate new config =====

	const shouldUpdateAuthConfig =
		!(options.skipPlugins || add_plugins.length === 0) || database !== null;

	if (shouldUpdateAuthConfig) {
		const spinner = yoctoSpinner({
			text: "preparing your new auth config...",
		}).start();

		let new_user_config: string;
		try {
			new_user_config = await format(current_user_config);
		} catch (error) {
			logger.error(
				`We found your auth config file, however we failed to format your auth config file. It's likely your file has a syntax error. Please fix it and try again.`,
			);
			process.exit(1);
		}

		new_user_config = await generateAuthConfig({
			current_user_config,
			format,
			spinner,
			database,
			plugins: add_plugins,
		});
		spinner.success("Auth config is ready!");
		const { confirm: shouldShowDiff } = await prompts({
			type: "confirm",
			name: "confirm",
			message: `Do you want to see the diff?`,
		});

		if (shouldShowDiff) {
			const diffed = getStyledDiff(
				await format(current_user_config),
				new_user_config,
			);
			console.log(diffed);
		}

		spinner.stop();
		logger.success(`🚀 Auth config successfully applied!`);
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
