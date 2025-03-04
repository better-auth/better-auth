import semver from "semver";
import { Command } from "commander";
import { z } from "zod";
import path from "path";
import chalk from "chalk";
import fs from "node:fs/promises";
import { getTsconfigInfo } from "../utils/get-tsconfig-info";
import {
	intro,
	isCancel,
	log,
	multiselect,
	outro,
	spinner,
} from "@clack/prompts";
import { getPackageInfo } from "../utils/get-package-info";
import { existsSync } from "node:fs";
import { findAuthConfig } from "../utils/find-auth-config";

type Result<Data = null> = {
	success: boolean;
	shouldThrow: boolean;
	message: string;
	data: Data | null;
};

export async function doctorAction(opts: any) {
	const options = z
		.object({
			cwd: z.string(),
			config: z.string().optional(),
		})
		.parse(opts);

	intro("👋 Better Auth Doctor");

	// check package.json
	const packageJsonResult = await checkPackageJson({ cwd: options.cwd });
	handleResult(packageJsonResult);
	const packageJson = packageJsonResult.data!;

	// check tsconfig.json values
	const tsConfigResult = await checkTsConfig({ cwd: options.cwd });
	handleResult(tsConfigResult);

	// check better-auth version
	const betterAuthVersionResult = await checkBetterAuthVersion({
		cwd: options.cwd,
		packageInfo: packageJson,
	});
	handleResult(betterAuthVersionResult);

	// check better-auth/cli version
	const betterAuthCliVersionResult = await checkBetterAuthCliVersion();
	handleResult(betterAuthCliVersionResult);

	// find auth config
	const configPathResult = await checkAuthConfig({
		cwd: options.cwd,
		config: options.config,
	});
	handleResult(configPathResult);
	const { configCode, configPath } = configPathResult.data!;

	// check nextCookies is included and is at end of array.
	const nextCookiesResult = await checkNextCookies({
		configCode,
		packageJson,
	});
	handleResult(nextCookiesResult);
	const isNextJs = nextCookiesResult.data!;

	// check ENV file includes needed variables
	const envResult = await checkEnv({ cwd: options.cwd });
	handleResult(envResult);

	outro("🚀 Better Auth Doctor finished successfully!");
	process.exit(0);
}

export const doctor = new Command("doctor")
	.option(
		"-c, --cwd <cwd>",
		"the working directory. defaults to the current directory.",
		process.cwd(),
	)
	.option(
		"--config <config>",
		"the path to the configuration file. defaults to the first configuration file found.",
	)

	.action(doctorAction);

function handleResult(res: Result<any>) {
	if (res.success) {
		log.success(`✅ ${res.message}`);
	} else if (res.shouldThrow) {
		log.error(`❌ ${res.message}`);
		outro(
			`Better Auth Doctor failed. Please fix the issues above and try again.`,
		);
		process.exit(1);
	} else {
		log.warn(`⚠️ ${res.message}`);
	}
}

async function checkTsConfig({ cwd }: { cwd: string }): Promise<Result> {
	let tsconfigInfo: Record<string, any>;
	try {
		tsconfigInfo = await getTsconfigInfo(cwd);
	} catch (error) {
		log.message(`${error}`);
		return {
			success: false,
			shouldThrow: true,
			message: `Couldn't read your tsconfig.json file. (dir: ${cwd})`,
			data: null,
		};
	}
	if (
		!(
			"compilerOptions" in tsconfigInfo &&
			"strict" in tsconfigInfo.compilerOptions &&
			tsconfigInfo.compilerOptions.strict === true
		)
	) {
		return {
			success: false,
			shouldThrow: false,
			message:
				'Your tsconfig.json file doesn\'t have "compilerOptions.strict" set to true.',
			data: null,
		};
	}
	return {
		success: true,
		shouldThrow: false,
		message: "tsconfig.json successfully checked.",
		data: null,
	};
}

async function checkPackageJson({
	cwd,
}: { cwd: string }): Promise<Result<Record<string, any>>> {
	let packageInfo: Record<string, any>;
	try {
		packageInfo = await getPackageInfo(cwd);
	} catch (error) {
		console.error(error);
		return {
			success: false,
			shouldThrow: true,
			message: `Couldn't read your package.json file. (dir: ${cwd})`,
			data: null,
		};
	}
	return {
		success: true,
		shouldThrow: false,
		message: "package.json successfully checked.",
		data: packageInfo,
	};
}

async function checkEnv({ cwd }: { cwd: string }): Promise<Result> {
	let envFiles = (await fs.readdir(cwd)).filter((x) => x.startsWith(".env"));
	if (!envFiles.length) {
		return {
			success: false,
			shouldThrow: true,
			message: "No .env files found. Please create an env file first.",
			data: null,
		};
	}

	if (envFiles.length > 1) {
		const envs = await multiselect({
			message: "Select each .env file you intend to check",
			options: envFiles.map((x) => ({
				value: path.join(cwd, x),
				label: x,
			})),
		});

		if (isCancel(envs)) {
			return {
				success: false,
				shouldThrow: true,
				message: "Operation cancelled.",
				data: null,
			};
		}
		envFiles = envs;
	}

	for await (const envFile of envFiles) {
		const content = await fs.readFile(envFile, "utf8");
		const lines = content.split("\n").map((x) => x.trim());
		if (!lines.find((x) => x.startsWith("BETTER_AUTH_SECRET"))) {
			return {
				success: false,
				shouldThrow: false,
				message: `BETTER_AUTH_SECRET is missing from ${path.basename(envFile)}`,
				data: null,
			};
		}
		if (!lines.find((x) => x.startsWith("BETTER_AUTH_URL"))) {
			return {
				success: false,
				shouldThrow: false,
				message: `BETTER_AUTH_URL is missing from ${path.basename(envFile)}`,
				data: null,
			};
		}
	}
	return {
		success: true,
		message: "ENV files successfully checked.",
		shouldThrow: false,
		data: null,
	};
}

async function checkBetterAuthVersion({
	cwd,
	packageInfo,
}: { cwd: string; packageInfo: Record<string, any> }): Promise<Result> {
	const s = spinner({ indicator: "dots" });
	s.start(`Checking better-auth installation`);

	let latest_betterauth_version: string;
	try {
		latest_betterauth_version = await getLatestNpmVersion("better-auth");
	} catch (error) {
		console.error(error);
		return {
			success: false,
			shouldThrow: true,
			message: `Couldn't get latest version of better-auth.`,
			data: null,
		};
	}

	if (
		!packageInfo.dependencies ||
		!Object.keys(packageInfo.dependencies).includes("better-auth")
	) {
		s.stop("Finished fetching latest version of better-auth.");
		return {
			success: false,
			shouldThrow: true,
			message: `Better Auth is not installed.`,
			data: null,
		};
	} else if (
		packageInfo.dependencies["better-auth"] !== "workspace:*" &&
		semver.lt(
			semver.coerce(packageInfo.dependencies["better-auth"])?.toString()!,
			semver.clean(latest_betterauth_version)!,
		)
	) {
		s.stop("Finished fetching latest version of better-auth.");
		return {
			success: false,
			shouldThrow: true,
			message: `Better Auth is out-of-date. You're on ${chalk.bold(
				`v${semver.coerce(
					packageInfo.dependencies["better-auth"]?.toString()!,
				)}`,
			)} but the latest version is ${chalk.bold(
				`v${semver.clean(latest_betterauth_version)}`,
			)}`,
			data: null,
		};
	} else {
		s.stop("Finished fetching latest version of better-auth.");
		return {
			success: true,
			shouldThrow: false,
			message: `Better Auth is ${chalk.greenBright(`up-to-date`)}!`,
			data: null,
		};
	}
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

async function checkBetterAuthCliVersion(): Promise<Result> {
	const cwd = path.join(import.meta.dirname, "../");
	let pkgJson: Record<string, any>;
	try {
		pkgJson = await getPackageInfo(cwd);
	} catch (error) {
		return {
			success: false,
			shouldThrow: true,
			message: `Couldn't find the Better Auth CLI package.json file. (dir: ${cwd})`,
			data: null,
		};
	}
	const s = spinner({ indicator: "dots" });
	s.start(`Checking @better-auth/cli version`);

	let latest_betterauth_cli_version: string;
	try {
		latest_betterauth_cli_version =
			await getLatestNpmVersion("@better-auth/cli");
	} catch (err) {
		s.stop("Failed to fetch latest version of @better-auth/cli.");
		console.error(err);
		return {
			success: false,
			shouldThrow: true,
			message: `Couldn't get latest version of better-auth-cli.`,
			data: null,
		};
	}

	if (!semver.satisfies(latest_betterauth_cli_version, `^${pkgJson.version}`)) {
		s.stop("Finished fetching latest version of @better-auth/cli.");
		return {
			success: false,
			shouldThrow: false,
			message: `@better-auth/cli is out-of-date. You're on ${chalk.bold(
				`v${pkgJson.version}`,
			)} but the latest version is ${chalk.bold(
				`v${latest_betterauth_cli_version}`,
			)}`,
			data: null,
		};
	}

	s.stop("Finished fetching latest version of @better-auth/cli.");
	return {
		success: true,
		shouldThrow: false,
		message: `@better-auth/cli is ${chalk.greenBright(`up-to-date`)}!`,
		data: null,
	};
}

async function checkNextCookies({
	configCode,
	packageJson,
}: {
	configCode: string;
	packageJson: Record<string, any>;
}): Promise<Result<boolean>> {
	if (packageJson.dependencies["next"]) {
		// is using nextjs.

		if (!configCode.includes("nextCookies")) {
			return {
				success: false,
				data: true,
				shouldThrow: false,
				message: "The nextCookies plugin is not included in the auth config.",
			};
		} else {
			let stripped = configCode
				.replaceAll(" ", "")
				.replaceAll("\n", "")
				.replaceAll(",", "");

			if (!stripped.includes("nextCookies()]")) {
				return {
					success: false,
					data: true,
					shouldThrow: true,
					message:
						"The nextCookies plugin is not at the end of the plugins array.",
				};
			} else {
				return {
					success: true,
					data: true,
					shouldThrow: false,
					message:
						"nextCookies plugin is correctly configured in the auth config.",
				};
			}
		}
	}

	return {
		success: true,
		shouldThrow: false,
		message: "Not using Next.js, nextCookies check is skipped.",
		data: false,
	};
}

async function checkAuthConfig({
	cwd,
	config,
}: { cwd: string; config?: string }): Promise<
	Result<{ configPath: string; configCode: string }>
> {
	if (config) {
		if (existsSync(path.join(cwd, config))) {
			const config_path = path.join(cwd, config);
			return {
				success: true,
				data: {
					configPath: config_path,
					configCode: await fs.readFile(config_path, "utf-8"),
				},
				shouldThrow: false,
				message: `Found auth config. ${chalk.gray(`(${config_path})`)}`,
			};
		} else {
			return {
				success: false,
				shouldThrow: true,
				message: `Couldn't find auth config based on the provided path. (${config})`,
				data: null,
			};
		}
	}
	const config_path = await findAuthConfig(cwd);

	if (!config_path) {
		return {
			success: false,
			shouldThrow: true,
			message: `Couldn't find auth config. Please provide a relative path to the auth config file via the --config flag.`,
			data: null,
		};
	}

	return {
		success: true,
		shouldThrow: false,
		message: `Auth config found. ${chalk.gray(`(${config_path})`)}`,
		data: {
			configCode: await fs.readFile(config_path, "utf-8"),
			configPath: config_path,
		},
	};
}
