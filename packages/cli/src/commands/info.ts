import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { getConfig } from "../utils/get-config";
import { getPackageInfo } from "../utils/get-package-info";

function getSystemInfo() {
	const platform = os.platform();
	const arch = os.arch();
	const version = os.version();
	const release = os.release();
	const cpus = os.cpus();
	const memory = os.totalmem();
	const freeMemory = os.freemem();

	return {
		platform,
		arch,
		version,
		release,
		cpuCount: cpus.length,
		cpuModel: cpus[0]?.model || "Unknown",
		totalMemory: `${(memory / 1024 / 1024 / 1024).toFixed(2)} GB`,
		freeMemory: `${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
	};
}

function getNodeInfo() {
	return {
		version: process.version,
		env: process.env.NODE_ENV || "development",
	};
}

function getPackageManager() {
	const userAgent = process.env.npm_config_user_agent || "";

	if (userAgent.includes("yarn")) {
		return { name: "yarn", version: getVersion("yarn") };
	}
	if (userAgent.includes("pnpm")) {
		return { name: "pnpm", version: getVersion("pnpm") };
	}
	if (userAgent.includes("bun")) {
		return { name: "bun", version: getVersion("bun") };
	}
	return { name: "npm", version: getVersion("npm") };
}

function getVersion(command: string): string {
	try {
		const output = execSync(`${command} --version`, { encoding: "utf8" });
		return output.trim();
	} catch {
		return "Not installed";
	}
}

function getFrameworkInfo(projectRoot: string) {
	const packageJsonPath = path.join(projectRoot, "package.json");

	if (!existsSync(packageJsonPath)) {
		return null;
	}

	try {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
		const deps = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		};

		const frameworks: Record<string, string | undefined> = {
			next: deps["next"],
			react: deps["react"],
			vue: deps["vue"],
			nuxt: deps["nuxt"],
			svelte: deps["svelte"],
			"@sveltejs/kit": deps["@sveltejs/kit"],
			express: deps["express"],
			fastify: deps["fastify"],
			hono: deps["hono"],
			remix: deps["@remix-run/react"],
			astro: deps["astro"],
			solid: deps["solid-js"],
			qwik: deps["@builder.io/qwik"],
		};

		const installedFrameworks = Object.entries(frameworks)
			.filter(([_, version]) => version)
			.map(([name, version]) => ({ name, version }));

		return installedFrameworks.length > 0 ? installedFrameworks : null;
	} catch {
		return null;
	}
}

function getDatabaseInfo(projectRoot: string) {
	const packageJsonPath = path.join(projectRoot, "package.json");

	if (!existsSync(packageJsonPath)) {
		return null;
	}

	try {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
		const deps = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		};

		const databases: Record<string, string | undefined> = {
			"better-sqlite3": deps["better-sqlite3"],
			"@libsql/client": deps["@libsql/client"],
			"@libsql/kysely-libsql": deps["@libsql/kysely-libsql"],
			mysql2: deps["mysql2"],
			pg: deps["pg"],
			postgres: deps["postgres"],
			"@prisma/client": deps["@prisma/client"],
			drizzle: deps["drizzle-orm"],
			kysely: deps["kysely"],
			mongodb: deps["mongodb"],
			"@neondatabase/serverless": deps["@neondatabase/serverless"],
			"@vercel/postgres": deps["@vercel/postgres"],
			"@planetscale/database": deps["@planetscale/database"],
		};

		const installedDatabases = Object.entries(databases)
			.filter(([_, version]) => version)
			.map(([name, version]) => ({ name, version }));

		return installedDatabases.length > 0 ? installedDatabases : null;
	} catch {
		return null;
	}
}

function sanitizeBetterAuthConfig(config: any): any {
	if (!config) return null;

	const sanitized = JSON.parse(JSON.stringify(config));

	// List of sensitive keys to redact
	const sensitiveKeys = [
		"secret",
		"clientSecret",
		"clientId",
		"authToken",
		"apiKey",
		"apiSecret",
		"privateKey",
		"publicKey",
		"password",
		"token",
		"webhook",
		"connectionString",
		"databaseUrl",
		"databaseURL",
		"TURSO_AUTH_TOKEN",
		"TURSO_DATABASE_URL",
		"MYSQL_DATABASE_URL",
		"DATABASE_URL",
		"POSTGRES_URL",
		"MONGODB_URI",
		"stripeKey",
		"stripeWebhookSecret",
	];

	// Keys that should NOT be redacted even if they contain sensitive keywords
	const allowedKeys = [
		"baseURL",
		"callbackURL",
		"redirectURL",
		"trustedOrigins",
		"appName",
	];

	function redactSensitive(obj: any, parentKey?: string): any {
		if (typeof obj !== "object" || obj === null) {
			// Check if the parent key is sensitive
			if (parentKey && typeof obj === "string" && obj.length > 0) {
				// First check if it's in the allowed list
				if (
					allowedKeys.some(
						(allowed) => parentKey.toLowerCase() === allowed.toLowerCase(),
					)
				) {
					return obj;
				}

				const lowerKey = parentKey.toLowerCase();
				if (
					sensitiveKeys.some((key) => {
						const lowerSensitiveKey = key.toLowerCase();
						// Exact match or the key ends with the sensitive key
						return (
							lowerKey === lowerSensitiveKey ||
							lowerKey.endsWith(lowerSensitiveKey)
						);
					})
				) {
					return "[REDACTED]";
				}
			}
			return obj;
		}

		if (Array.isArray(obj)) {
			return obj.map((item) => redactSensitive(item, parentKey));
		}

		const result: any = {};
		for (const [key, value] of Object.entries(obj)) {
			// First check if this key is in the allowed list
			if (
				allowedKeys.some(
					(allowed) => key.toLowerCase() === allowed.toLowerCase(),
				)
			) {
				result[key] = value;
				continue;
			}

			const lowerKey = key.toLowerCase();

			// Check if this key should be redacted
			if (
				sensitiveKeys.some((sensitiveKey) => {
					const lowerSensitiveKey = sensitiveKey.toLowerCase();
					// Exact match or the key ends with the sensitive key
					return (
						lowerKey === lowerSensitiveKey ||
						lowerKey.endsWith(lowerSensitiveKey)
					);
				})
			) {
				if (typeof value === "string" && value.length > 0) {
					result[key] = "[REDACTED]";
				} else if (typeof value === "object" && value !== null) {
					// Still recurse into objects but mark them as potentially sensitive
					result[key] = redactSensitive(value, key);
				} else {
					result[key] = value;
				}
			} else {
				result[key] = redactSensitive(value, key);
			}
		}
		return result;
	}

	// Special handling for specific config sections
	if (sanitized.database) {
		// Redact database connection details
		if (typeof sanitized.database === "string") {
			sanitized.database = "[REDACTED]";
		} else if (sanitized.database.url) {
			sanitized.database.url = "[REDACTED]";
		}
		if (sanitized.database.authToken) {
			sanitized.database.authToken = "[REDACTED]";
		}
	}

	if (sanitized.socialProviders) {
		// Redact all social provider secrets
		for (const provider in sanitized.socialProviders) {
			if (sanitized.socialProviders[provider]) {
				sanitized.socialProviders[provider] = redactSensitive(
					sanitized.socialProviders[provider],
					provider,
				);
			}
		}
	}

	if (sanitized.emailAndPassword?.sendResetPassword) {
		sanitized.emailAndPassword.sendResetPassword = "[Function]";
	}

	if (sanitized.emailVerification?.sendVerificationEmail) {
		sanitized.emailVerification.sendVerificationEmail = "[Function]";
	}

	// Redact plugin configurations
	if (sanitized.plugins && Array.isArray(sanitized.plugins)) {
		sanitized.plugins = sanitized.plugins.map((plugin: any) => {
			if (typeof plugin === "function") {
				return "[Plugin Function]";
			}
			if (plugin && typeof plugin === "object") {
				// Get plugin name if available
				const pluginName = plugin.id || plugin.name || "unknown";
				return {
					name: pluginName,
					config: redactSensitive(plugin.config || plugin),
				};
			}
			return plugin;
		});
	}

	return redactSensitive(sanitized);
}

async function getBetterAuthInfo(
	projectRoot: string,
	configPath?: string,
	suppressLogs = false,
) {
	try {
		// Temporarily suppress console output if needed
		const originalLog = console.log;
		const originalWarn = console.warn;
		const originalError = console.error;

		if (suppressLogs) {
			console.log = () => {};
			console.warn = () => {};
			console.error = () => {};
		}

		try {
			const config = await getConfig({
				cwd: projectRoot,
				configPath,
				shouldThrowOnError: false,
			});
			const packageInfo = await getPackageInfo();
			const betterAuthVersion =
				packageInfo.dependencies?.["better-auth"] ||
				packageInfo.devDependencies?.["better-auth"] ||
				packageInfo.peerDependencies?.["better-auth"] ||
				packageInfo.optionalDependencies?.["better-auth"] ||
				"Unknown";

			return {
				version: betterAuthVersion,
				config: sanitizeBetterAuthConfig(config),
			};
		} finally {
			// Restore console methods
			if (suppressLogs) {
				console.log = originalLog;
				console.warn = originalWarn;
				console.error = originalError;
			}
		}
	} catch (error) {
		return {
			version: "Unknown",
			config: null,
			error:
				error instanceof Error
					? error.message
					: "Failed to load Better Auth config",
		};
	}
}

function formatOutput(data: any, indent = 0): string {
	const spaces = " ".repeat(indent);

	if (data === null || data === undefined) {
		return `${spaces}${chalk.gray("N/A")}`;
	}

	if (
		typeof data === "string" ||
		typeof data === "number" ||
		typeof data === "boolean"
	) {
		return `${spaces}${data}`;
	}

	if (Array.isArray(data)) {
		if (data.length === 0) {
			return `${spaces}${chalk.gray("[]")}`;
		}
		return data.map((item) => formatOutput(item, indent)).join("\n");
	}

	if (typeof data === "object") {
		const entries = Object.entries(data);
		if (entries.length === 0) {
			return `${spaces}${chalk.gray("{}")}`;
		}

		return entries
			.map(([key, value]) => {
				if (
					typeof value === "object" &&
					value !== null &&
					!Array.isArray(value)
				) {
					return `${spaces}${chalk.cyan(key)}:\n${formatOutput(value, indent + 2)}`;
				}
				return `${spaces}${chalk.cyan(key)}: ${formatOutput(value, 0)}`;
			})
			.join("\n");
	}

	return `${spaces}${JSON.stringify(data)}`;
}

export const info = new Command("info")
	.description("Display system and Better Auth configuration information")
	.option("--cwd <cwd>", "The working directory", process.cwd())
	.option("--config <config>", "Path to the Better Auth configuration file")
	.option("-j, --json", "Output as JSON")
	.option("-c, --copy", "Copy output to clipboard (requires pbcopy/xclip)")
	.action(async (options) => {
		const projectRoot = path.resolve(options.cwd || process.cwd());

		// Collect all information
		const systemInfo = getSystemInfo();
		const nodeInfo = getNodeInfo();
		const packageManager = getPackageManager();
		const frameworks = getFrameworkInfo(projectRoot);
		const databases = getDatabaseInfo(projectRoot);
		const betterAuthInfo = await getBetterAuthInfo(
			projectRoot,
			options.config,
			options.json,
		);

		const fullInfo = {
			system: systemInfo,
			node: nodeInfo,
			packageManager,
			frameworks,
			databases,
			betterAuth: betterAuthInfo,
		};

		if (options.json) {
			const jsonOutput = JSON.stringify(fullInfo, null, 2);
			console.log(jsonOutput);

			if (options.copy) {
				try {
					const platform = os.platform();
					if (platform === "darwin") {
						execSync("pbcopy", { input: jsonOutput });
						console.log(chalk.green("\n✓ Copied to clipboard"));
					} else if (platform === "linux") {
						execSync("xclip -selection clipboard", { input: jsonOutput });
						console.log(chalk.green("\n✓ Copied to clipboard"));
					} else if (platform === "win32") {
						execSync("clip", { input: jsonOutput });
						console.log(chalk.green("\n✓ Copied to clipboard"));
					}
				} catch {
					console.log(chalk.yellow("\n⚠ Could not copy to clipboard"));
				}
			}
			return;
		}

		// Format and display output
		console.log(chalk.bold("\n📊 Better Auth System Information\n"));
		console.log(chalk.gray("=".repeat(50)));

		console.log(chalk.bold.white("\n🖥️  System Information:"));
		console.log(formatOutput(systemInfo, 2));

		console.log(chalk.bold.white("\n📦 Node.js:"));
		console.log(formatOutput(nodeInfo, 2));

		console.log(chalk.bold.white("\n📦 Package Manager:"));
		console.log(formatOutput(packageManager, 2));

		if (frameworks) {
			console.log(chalk.bold.white("\n🚀 Frameworks:"));
			console.log(formatOutput(frameworks, 2));
		}

		if (databases) {
			console.log(chalk.bold.white("\n💾 Database Clients:"));
			console.log(formatOutput(databases, 2));
		}

		console.log(chalk.bold.white("\n🔐 Better Auth:"));
		if (betterAuthInfo.error) {
			console.log(`  ${chalk.red("Error:")} ${betterAuthInfo.error}`);
		} else {
			console.log(`  ${chalk.cyan("Version")}: ${betterAuthInfo.version}`);
			if (betterAuthInfo.config) {
				console.log(`  ${chalk.cyan("Configuration")}:`);
				console.log(formatOutput(betterAuthInfo.config, 4));
			}
		}

		console.log(chalk.gray("\n" + "=".repeat(50)));
		console.log(chalk.gray("\n💡 Tip: Use --json flag for JSON output"));
		console.log(chalk.gray("💡 Use --copy flag to copy output to clipboard"));
		console.log(
			chalk.gray("💡 When reporting issues, include this information\n"),
		);

		if (options.copy) {
			const textOutput = `
Better Auth System Information
==============================

System Information:
${JSON.stringify(systemInfo, null, 2)}

Node.js:
${JSON.stringify(nodeInfo, null, 2)}

Package Manager:
${JSON.stringify(packageManager, null, 2)}

Frameworks:
${JSON.stringify(frameworks, null, 2)}

Database Clients:
${JSON.stringify(databases, null, 2)}

Better Auth:
${JSON.stringify(betterAuthInfo, null, 2)}
`;

			try {
				const platform = os.platform();
				if (platform === "darwin") {
					execSync("pbcopy", { input: textOutput });
					console.log(chalk.green("✓ Copied to clipboard"));
				} else if (platform === "linux") {
					execSync("xclip -selection clipboard", { input: textOutput });
					console.log(chalk.green("✓ Copied to clipboard"));
				} else if (platform === "win32") {
					execSync("clip", { input: textOutput });
					console.log(chalk.green("✓ Copied to clipboard"));
				}
			} catch {
				console.log(chalk.yellow("⚠ Could not copy to clipboard"));
			}
		}
	});
