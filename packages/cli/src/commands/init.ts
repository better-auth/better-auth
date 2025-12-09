import { existsSync } from "node:fs";
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
	text,
} from "@clack/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { parse } from "dotenv";
import { format as prettierFormat } from "prettier";
import semver from "semver";
import * as z from "zod/v4";
import { generateAuthConfig } from "../generators/auth-config";
import { checkPackageManagers } from "../utils/check-package-managers";
import { formatMilliseconds } from "../utils/format-ms";
import { getPackageInfo } from "../utils/get-package-info";
import { getTsconfigInfo } from "../utils/get-tsconfig-info";
import { installDependencies } from "../utils/install-dependencies";
import { generateSecretHash } from "./secret";

/**
 * Should only use any database that is core DBs, and supports the Better Auth CLI generate functionality.
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
	"prisma:postgresql",
	"prisma:mysql",
	"prisma:sqlite",
	// Mongo
	"mongodb",
] as const;

export type SupportedDatabases = (typeof supportedDatabases)[number];

const supportedPlugins = [
	{
		id: "two-factor",
		name: "twoFactor",
		path: `better-auth/plugins`,
		clientName: "twoFactorClient",
		clientPath: "better-auth/client/plugins",
	},
	{
		id: "username",
		name: "username",
		clientName: "usernameClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins",
	},
	{
		id: "anonymous",
		name: "anonymous",
		clientName: "anonymousClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins",
	},
	{
		id: "phone-number",
		name: "phoneNumber",
		clientName: "phoneNumberClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins",
	},
	{
		id: "magic-link",
		name: "magicLink",
		clientName: "magicLinkClient",
		clientPath: "better-auth/client/plugins",
		path: `better-auth/plugins`,
	},
	{
		id: "email-otp",
		name: "emailOTP",
		clientName: "emailOTPClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins",
	},
	{
		id: "passkey",
		name: "passkey",
		clientName: "passkeyClient",
		path: `@better-auth/passkey`,
		clientPath: "@better-auth/passkey/client",
	},
	{
		id: "generic-oauth",
		name: "genericOAuth",
		clientName: "genericOAuthClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins",
	},
	{
		id: "one-tap",
		name: "oneTap",
		clientName: "oneTapClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins",
	},
	{
		id: "api-key",
		name: "apiKey",
		clientName: "apiKeyClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins",
	},
	{
		id: "admin",
		name: "admin",
		clientName: "adminClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins",
	},
	{
		id: "organization",
		name: "organization",
		clientName: "organizationClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins",
	},
	{
		id: "oidc",
		name: "oidcProvider",
		clientName: "oidcClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins",
	},
	{
		id: "sso",
		name: "sso",
		clientName: "ssoClient",
		path: `@better-auth/sso`,
		clientPath: "@better-auth/sso/client",
	},
	{
		id: "bearer",
		name: "bearer",
		clientName: undefined,
		path: `better-auth/plugins`,
		clientPath: undefined,
	},
	{
		id: "multi-session",
		name: "multiSession",
		clientName: "multiSessionClient",
		path: `better-auth/plugins`,
		clientPath: "better-auth/client/plugins",
	},
	{
		id: "oauth-proxy",
		name: "oAuthProxy",
		clientName: undefined,
		path: `better-auth/plugins`,
		clientPath: undefined,
	},
	{
		id: "open-api",
		name: "openAPI",
		clientName: undefined,
		path: `better-auth/plugins`,
		clientPath: undefined,
	},
	{
		id: "jwt",
		name: "jwt",
		clientName: undefined,
		clientPath: undefined,
		path: `better-auth/plugins`,
	},
	{
		id: "next-cookies",
		name: "nextCookies",
		clientPath: undefined,
		clientName: undefined,
		path: `better-auth/next-js`,
	},
] as const;

export type SupportedPlugin = (typeof supportedPlugins)[number];

const defaultFormatOptions = {
	trailingComma: "all" as const,
	useTabs: false,
	tabWidth: 4,
};

const getDefaultAuthConfig = async ({ appName }: { appName?: string }) =>
	await prettierFormat(
		[
			"import { betterAuth } from 'better-auth';",
			"",
			"export const auth = betterAuth({",
			appName ? `appName: "${appName}",` : "",
			"plugins: [],",
			"});",
		].join("\n"),
		{
			filepath: "auth.ts",
			...defaultFormatOptions,
		},
	);

type SupportedFrameworks =
	| "vanilla"
	| "react"
	| "vue"
	| "svelte"
	| "solid"
	| "nextjs";

type Import = {
	path: string;
	variables:
		| { asType?: boolean; name: string; as?: string }[]
		| { asType?: boolean; name: string; as?: string };
};

const getDefaultAuthClientConfig = async ({
	auth_config_path,
	framework,
	clientPlugins,
}: {
	framework: SupportedFrameworks;
	auth_config_path: string;
	clientPlugins: {
		id: string;
		name: string;
		contents: string;
		imports: Import[];
	}[];
}) => {
	function groupImportVariables(): Import[] {
		const result: Import[] = [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "inferAdditionalFields" }],
			},
		];
		for (const plugin of clientPlugins) {
			for (const import_ of plugin.imports) {
				if (Array.isArray(import_.variables)) {
					for (const variable of import_.variables) {
						const existingIndex = result.findIndex(
							(x) => x.path === import_.path,
						);
						if (existingIndex !== -1) {
							const vars = result[existingIndex]!.variables;
							if (Array.isArray(vars)) {
								vars.push(variable);
							} else {
								result[existingIndex]!.variables = [vars, variable];
							}
						} else {
							result.push({
								path: import_.path,
								variables: [variable],
							});
						}
					}
				} else {
					const existingIndex = result.findIndex(
						(x) => x.path === import_.path,
					);
					if (existingIndex !== -1) {
						const vars = result[existingIndex]!.variables;
						if (Array.isArray(vars)) {
							vars.push(import_.variables);
						} else {
							result[existingIndex]!.variables = [vars, import_.variables];
						}
					} else {
						result.push({
							path: import_.path,
							variables: [import_.variables],
						});
					}
				}
			}
		}
		return result;
	}
	let imports = groupImportVariables();
	let importString = "";
	for (const import_ of imports) {
		if (Array.isArray(import_.variables)) {
			importString += `import { ${import_.variables
				.map(
					(x) =>
						`${x.asType ? "type " : ""}${x.name}${x.as ? ` as ${x.as}` : ""}`,
				)
				.join(", ")} } from "${import_.path}";\n`;
		} else {
			importString += `import ${import_.variables.asType ? "type " : ""}${
				import_.variables.name
			}${import_.variables.as ? ` as ${import_.variables.as}` : ""} from "${
				import_.path
			}";\n`;
		}
	}

	return await prettierFormat(
		[
			`import { createAuthClient } from "better-auth/${
				framework === "nextjs"
					? "react"
					: framework === "vanilla"
						? "client"
						: framework
			}";`,
			`import type { auth } from "${auth_config_path}";`,
			importString,
			``,
			`export const authClient = createAuthClient({`,
			`baseURL: "http://localhost:3000",`,
			`plugins: [inferAdditionalFields<typeof auth>(),${clientPlugins
				.map((x) => `${x.name}(${x.contents})`)
				.join(", ")}],`,
			`});`,
		].join("\n"),
		{
			filepath: "auth-client.ts",
			...defaultFormatOptions,
		},
	);
};

const optionsSchema = z.object({
	cwd: z.string(),
	config: z.string().optional(),
	database: z.enum(supportedDatabases).optional(),
	"skip-db": z.boolean().optional(),
	"skip-plugins": z.boolean().optional(),
	"package-manager": z.string().optional(),
	tsconfig: z.string().optional(),
});

const outroText = `🥳 All Done, Happy Hacking!`;

async function initAction(opts: any) {
	console.log();
	intro("👋 Initializing Better Auth");

	const options = optionsSchema.parse(opts);

	const cwd = path.resolve(options.cwd);
	let packageManagerPreference: "bun" | "pnpm" | "yarn" | "npm" | undefined =
		undefined;

	let config_path: string = "";
	let framework: SupportedFrameworks = "vanilla";

	const format = async (code: string) =>
		await prettierFormat(code, {
			filepath: config_path,
			...defaultFormatOptions,
		});

	// ===== package.json =====
	let packageInfo: Record<string, any>;
	try {
		packageInfo = getPackageInfo(cwd);
	} catch (error) {
		log.error(`❌ Couldn't read your package.json file. (dir: ${cwd})`);
		log.error(JSON.stringify(error, null, 2));
		process.exit(1);
	}

	// ===== ENV files =====
	const envFiles = await getEnvFiles(cwd);
	if (!envFiles.length) {
		outro("❌ No .env files found. Please create an env file first.");
		process.exit(0);
	}
	let targetEnvFile: string;
	if (envFiles.includes(".env")) targetEnvFile = ".env";
	else if (envFiles.includes(".env.local")) targetEnvFile = ".env.local";
	else if (envFiles.includes(".env.development"))
		targetEnvFile = ".env.development";
	else if (envFiles.length === 1) targetEnvFile = envFiles[0]!;
	else targetEnvFile = "none";

	// ===== tsconfig.json =====
	let tsconfigInfo: Record<string, any>;
	try {
		const tsconfigPath =
			options.tsconfig !== undefined
				? path.resolve(cwd, options.tsconfig)
				: path.join(cwd, "tsconfig.json");

		tsconfigInfo = await getTsconfigInfo(cwd, tsconfigPath);
	} catch (error) {
		log.error(`❌ Couldn't read your tsconfig.json file. (dir: ${cwd})`);
		console.error(error);
		process.exit(1);
	}
	if (
		!(
			"compilerOptions" in tsconfigInfo &&
			"strict" in tsconfigInfo.compilerOptions &&
			tsconfigInfo.compilerOptions.strict === true
		)
	) {
		log.warn(
			`Better Auth requires your tsconfig.json to have "compilerOptions.strict" set to true.`,
		);
		const shouldAdd = await confirm({
			message: `Would you like us to set ${chalk.bold(
				`strict`,
			)} to ${chalk.bold(`true`)}?`,
		});
		if (isCancel(shouldAdd)) {
			cancel(`✋ Operation cancelled.`);
			process.exit(0);
		}
		if (shouldAdd) {
			try {
				await fs.writeFile(
					path.join(cwd, "tsconfig.json"),
					await prettierFormat(
						JSON.stringify(
							Object.assign(tsconfigInfo, {
								compilerOptions: {
									strict: true,
								},
							}),
						),
						{ filepath: "tsconfig.json", ...defaultFormatOptions },
					),
					"utf-8",
				);
				log.success(`🚀 tsconfig.json successfully updated!`);
			} catch (error) {
				log.error(
					`Failed to add "compilerOptions.strict" to your tsconfig.json file.`,
				);
				console.error(error);
				process.exit(1);
			}
		}
	}

	// ===== install better-auth =====
	const s = spinner({ indicator: "dots" });
	s.start(`Checking better-auth installation`);

	let latest_betterauth_version: string;
	try {
		latest_betterauth_version = await getLatestNpmVersion("better-auth");
	} catch (error) {
		log.error(`❌ Couldn't get latest version of better-auth.`);
		console.error(error);
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
					)}! ${chalk.gray(`(${formatMilliseconds(Date.now() - start)})`)}`,
				);
			} catch (error: any) {
				s2.stop(`Failed to install Better Auth:`);
				console.error(error);
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
		s.stop(`Better Auth dependencies are ${chalk.greenBright(`up to date`)}!`);
	}

	// ===== appName =====

	const packageJson = getPackageInfo(cwd);
	let appName: string;
	if (!packageJson.name) {
		const newAppName = await text({
			message: "What is the name of your application?",
		});
		if (isCancel(newAppName)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		appName = newAppName;
	} else {
		appName = packageJson.name;
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

	// ===== create auth config =====
	let current_user_config = "";
	let database: SupportedDatabases | null = null;
	let add_plugins: SupportedPlugin[] = [];

	if (!config_path) {
		const shouldCreateAuthConfig = await select({
			message: `Would you like to create an auth config file?`,
			options: [
				{ label: "Yes", value: "yes" },
				{ label: "No", value: "no" },
			],
		});
		if (isCancel(shouldCreateAuthConfig)) {
			cancel(`✋ Operation cancelled.`);
			process.exit(0);
		}
		if (shouldCreateAuthConfig === "yes") {
			const shouldSetupDb = await confirm({
				message: `Would you like to set up your ${chalk.bold(`database`)}?`,
				initialValue: true,
			});
			if (isCancel(shouldSetupDb)) {
				cancel(`✋ Operating cancelled.`);
				process.exit(0);
			}
			if (shouldSetupDb) {
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

			if (options["skip-plugins"] !== false) {
				const shouldSetupPlugins = await confirm({
					message: `Would you like to set up ${chalk.bold(`plugins`)}?`,
				});
				if (isCancel(shouldSetupPlugins)) {
					cancel(`✋ Operating cancelled.`);
					process.exit(0);
				}
				if (shouldSetupPlugins) {
					const prompted_plugins = await multiselect({
						message: "Select your new plugins",
						options: supportedPlugins
							.filter((x) => x.id !== "next-cookies")
							.map((x) => ({ value: x.id, label: x.id })),
						required: false,
					});
					if (isCancel(prompted_plugins)) {
						cancel(`✋ Operating cancelled.`);
						process.exit(0);
					}
					add_plugins = prompted_plugins.map(
						(x) => supportedPlugins.find((y) => y.id === x)!,
					);

					const possible_next_config_paths = [
						"next.config.js",
						"next.config.ts",
						"next.config.mjs",
						".next/server/next.config.js",
						".next/server/next.config.ts",
						".next/server/next.config.mjs",
					];
					for (const possible_next_config_path of possible_next_config_paths) {
						if (existsSync(path.join(cwd, possible_next_config_path))) {
							framework = "nextjs";
							break;
						}
					}
					if (framework === "nextjs") {
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
			}

			const filePath = path.join(cwd, "auth.ts");
			config_path = filePath;
			log.info(`Creating auth config file: ${filePath}`);
			try {
				current_user_config = await getDefaultAuthConfig({
					appName,
				});
				const { dependencies, envs, generatedCode } = await generateAuthConfig({
					current_user_config,
					format,
					//@ts-expect-error
					s,
					plugins: add_plugins,
					database,
				});
				current_user_config = generatedCode;
				await fs.writeFile(filePath, current_user_config);
				config_path = filePath;
				log.success(`🚀 Auth config file successfully created!`);

				if (envs.length !== 0) {
					log.info(
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
						const filesToUpdate = await multiselect({
							message: "Select the .env files you want to update",
							options: envFiles.map((x) => ({
								value: path.join(cwd, x),
								label: x,
							})),
							required: false,
						});
						if (isCancel(filesToUpdate)) {
							cancel("✋ Operation cancelled.");
							process.exit(0);
						}
						if (filesToUpdate.length === 0) {
							log.info("No .env files to update. Skipping...");
						} else {
							try {
								await updateEnvs({
									files: filesToUpdate,
									envs,
									isCommented: true,
								});
							} catch (error) {
								log.error(`Failed to update .env files:`);
								log.error(JSON.stringify(error, null, 2));
								process.exit(1);
							}
							log.success(`🚀 ENV files successfully updated!`);
						}
					}
				}
				if (dependencies.length !== 0) {
					log.info(
						`There are ${
							dependencies.length
						} dependencies to install. (${dependencies
							.map((x) => chalk.green(x))
							.join(", ")})`,
					);
					const shouldInstallDeps = await confirm({
						message: `Would you like us to install dependencies?`,
					});
					if (isCancel(shouldInstallDeps)) {
						cancel("✋ Operation cancelled.");
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
								dependencies: dependencies,
								packageManager: packageManagerPreference,
								cwd: cwd,
							});
							s.stop(
								`Dependencies installed ${chalk.greenBright(
									`successfully`,
								)} ${chalk.gray(
									`(${formatMilliseconds(Date.now() - start)})`,
								)}`,
							);
						} catch (error: any) {
							s.stop(
								`Failed to install dependencies using ${packageManagerPreference}:`,
							);
							log.error(error.message);
							process.exit(1);
						}
					}
				}
			} catch (error) {
				log.error(`Failed to create auth config file: ${filePath}`);
				console.error(error);
				process.exit(1);
			}
		} else if (shouldCreateAuthConfig === "no") {
			log.info(`Skipping auth config file creation.`);
		}
	} else {
		log.message();
		log.success(`Found auth config file. ${chalk.gray(`(${config_path})`)}`);
		log.message();
	}

	// ===== auth client path =====

	let possibleClientPaths = [
		"auth-client.ts",
		"auth-client.tsx",
		"auth-client.js",
		"auth-client.jsx",
		"client.ts",
		"client.tsx",
		"client.js",
		"client.jsx",
	];
	possibleClientPaths = [
		...possibleClientPaths,
		...possibleClientPaths.map((it) => `lib/server/${it}`),
		...possibleClientPaths.map((it) => `server/${it}`),
		...possibleClientPaths.map((it) => `lib/${it}`),
		...possibleClientPaths.map((it) => `utils/${it}`),
	];
	possibleClientPaths = [
		...possibleClientPaths,
		...possibleClientPaths.map((it) => `src/${it}`),
		...possibleClientPaths.map((it) => `app/${it}`),
	];

	let authClientConfigPath: string | null = null;
	for (const possiblePath of possibleClientPaths) {
		const doesExist = existsSync(path.join(cwd, possiblePath));
		if (doesExist) {
			authClientConfigPath = path.join(cwd, possiblePath);
			break;
		}
	}

	if (!authClientConfigPath) {
		const choice = await select({
			message: `Would you like to create an auth client config file?`,
			options: [
				{ label: "Yes", value: "yes" },
				{ label: "No", value: "no" },
			],
		});
		if (isCancel(choice)) {
			cancel(`✋ Operation cancelled.`);
			process.exit(0);
		}
		if (choice === "yes") {
			authClientConfigPath = path.join(cwd, "auth-client.ts");
			log.info(`Creating auth client config file: ${authClientConfigPath}`);
			try {
				let contents = await getDefaultAuthClientConfig({
					auth_config_path: (
						"./" + path.join(config_path.replace(cwd, ""))
					).replace(".//", "./"),
					clientPlugins: add_plugins
						.filter((x) => x.clientName)
						.map((plugin) => {
							let contents = "";
							if (plugin.id === "one-tap") {
								contents = `{ clientId: "MY_CLIENT_ID" }`;
							}
							return {
								contents,
								id: plugin.id,
								name: plugin.clientName!,
								imports: [
									{
										path: "better-auth/client/plugins",
										variables: [{ name: plugin.clientName! }],
									},
								],
							};
						}),
					framework: framework,
				});
				await fs.writeFile(authClientConfigPath, contents);
				log.success(`🚀 Auth client config file successfully created!`);
			} catch (error) {
				log.error(
					`Failed to create auth client config file: ${authClientConfigPath}`,
				);
				log.error(JSON.stringify(error, null, 2));
				process.exit(1);
			}
		} else if (choice === "no") {
			log.info(`Skipping auth client config file creation.`);
		}
	} else {
		log.success(
			`Found auth client config file. ${chalk.gray(
				`(${authClientConfigPath})`,
			)}`,
		);
	}

	if (targetEnvFile !== "none") {
		try {
			const fileContents = await fs.readFile(
				path.join(cwd, targetEnvFile),
				"utf8",
			);
			const parsed = parse(fileContents);
			let isMissingSecret = false;
			let isMissingUrl = false;
			if (parsed.BETTER_AUTH_SECRET === undefined) isMissingSecret = true;
			if (parsed.BETTER_AUTH_URL === undefined) isMissingUrl = true;
			if (isMissingSecret || isMissingUrl) {
				let txt = "";
				if (isMissingSecret && !isMissingUrl)
					txt = chalk.bold(`BETTER_AUTH_SECRET`);
				else if (!isMissingSecret && isMissingUrl)
					txt = chalk.bold(`BETTER_AUTH_URL`);
				else
					txt =
						chalk.bold.underline(`BETTER_AUTH_SECRET`) +
						` and ` +
						chalk.bold.underline(`BETTER_AUTH_URL`);
				log.warn(`Missing ${txt} in ${targetEnvFile}`);

				const shouldAdd = await select({
					message: `Do you want to add ${txt} to ${targetEnvFile}?`,
					options: [
						{ label: "Yes", value: "yes" },
						{ label: "No", value: "no" },
						{ label: "Choose other file(s)", value: "other" },
					],
				});
				if (isCancel(shouldAdd)) {
					cancel(`✋ Operation cancelled.`);
					process.exit(0);
				}
				let envs: string[] = [];
				if (isMissingSecret) {
					envs.push("BETTER_AUTH_SECRET");
				}
				if (isMissingUrl) {
					envs.push("BETTER_AUTH_URL");
				}
				if (shouldAdd === "yes") {
					try {
						await updateEnvs({
							files: [path.join(cwd, targetEnvFile)],
							envs: envs,
							isCommented: false,
						});
					} catch (error) {
						log.error(`Failed to add ENV variables to ${targetEnvFile}`);
						log.error(JSON.stringify(error, null, 2));
						process.exit(1);
					}
					log.success(`🚀 ENV variables successfully added!`);
					if (isMissingUrl) {
						log.info(
							`Be sure to update your BETTER_AUTH_URL according to your app's needs.`,
						);
					}
				} else if (shouldAdd === "no") {
					log.info(`Skipping ENV step.`);
				} else if (shouldAdd === "other") {
					if (!envFiles.length) {
						cancel("No env files found. Please create an env file first.");
						process.exit(0);
					}
					const envFilesToUpdate = await multiselect({
						message: "Select the .env files you want to update",
						options: envFiles.map((x) => ({
							value: path.join(cwd, x),
							label: x,
						})),
						required: false,
					});
					if (isCancel(envFilesToUpdate)) {
						cancel("✋ Operation cancelled.");
						process.exit(0);
					}
					if (envFilesToUpdate.length === 0) {
						log.info("No .env files to update. Skipping...");
					} else {
						try {
							await updateEnvs({
								files: envFilesToUpdate,
								envs: envs,
								isCommented: false,
							});
						} catch (error) {
							log.error(`Failed to update .env files:`);
							log.error(JSON.stringify(error, null, 2));
							process.exit(1);
						}
						log.success(`🚀 ENV files successfully updated!`);
					}
				}
			}
		} catch (error) {
			// if fails, ignore, and do not proceed with ENV operations.
		}
	}

	outro(outroText);
	console.log();
	process.exit(0);
}

// ===== Init Command =====

export const init = new Command("init")
	.option("-c, --cwd <cwd>", "The working directory.", process.cwd())
	.option(
		"--config <config>",
		"The path to the auth configuration file. defaults to the first `auth.ts` file found.",
	)
	.option("--tsconfig <tsconfig>", "The path to the tsconfig file.")
	.option("--skip-db", "Skip the database setup.")
	.option("--skip-plugins", "Skip the plugins setup.")
	.option(
		"--package-manager <package-manager>",
		"The package manager you want to use.",
	)
	.action(initAction);

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
	isCommented,
}: {
	/**
	 * The ENVs to append to the file
	 */
	envs: string[];
	/**
	 * Full file paths
	 */
	files: string[];
	/**
	 * Whether to comment the all of the envs or not
	 */
	isCommented: boolean;
}) {
	let previouslyGeneratedSecret: string | null = null;
	for (const file of files) {
		const content = await fs.readFile(file, "utf8");
		const lines = content.split("\n");
		const newLines = envs.map(
			(x) =>
				`${isCommented ? "# " : ""}${x}=${
					getEnvDescription(x) ?? `"some_value"`
				}`,
		);
		newLines.push("");
		newLines.push(...lines);
		await fs.writeFile(file, newLines.join("\n"), "utf8");
	}

	function getEnvDescription(env: string) {
		if (env === "DATABASE_HOST") {
			return `"The host of your database"`;
		}
		if (env === "DATABASE_PORT") {
			return `"The port of your database"`;
		}
		if (env === "DATABASE_USER") {
			return `"The username of your database"`;
		}
		if (env === "DATABASE_PASSWORD") {
			return `"The password of your database"`;
		}
		if (env === "DATABASE_NAME") {
			return `"The name of your database"`;
		}
		if (env === "DATABASE_URL") {
			return `"The URL of your database"`;
		}
		if (env === "BETTER_AUTH_SECRET") {
			previouslyGeneratedSecret =
				previouslyGeneratedSecret ?? generateSecretHash();
			return `"${previouslyGeneratedSecret}"`;
		}
		if (env === "BETTER_AUTH_URL") {
			return `"http://localhost:3000" # Your APP URL`;
		}
	}
}
