import type { Step } from "../types";
import { cancel, isCancel, log, text } from "@clack/prompts";
import path from "path";
import { existsSync, lstatSync } from "fs";
import chalk from "chalk";
import type { SupportedFramework } from "../supported-frameworks";

export const checkAuthFilesStep: Step<
	[framework: SupportedFramework],
	{
		shouldCreateConfigs: boolean;
	}
> = {
	description: "Checking if auth.ts & auth-client.ts are defined...",
	id: "check-auth-files",
	exec: async (helpers, options, framework) => {
		const cwd = options.cwd;
		let possiblePaths = ["auth.ts", "auth.tsx", "auth.js", "auth.jsx"];
		possiblePaths = [
			...possiblePaths,
			...possiblePaths.map((it) => `lib/server/${it}`),
			...possiblePaths.map((it) => `lib/auth/${it}`),
			...possiblePaths.map((it) => `server/${it}`),
			...possiblePaths.map((it) => `lib/${it}`),
			...possiblePaths.map((it) => `utils/${it}`),
		];
		possiblePaths = [
			...possiblePaths,
			...possiblePaths.map((it) => `src/${it}`),
			...possiblePaths.map((it) => `src/app/${it}`),
			...possiblePaths.map((it) => `app/${it}`),
		];
		let ac_possiblePaths = [
			"auth-client.ts",
			"auth-client.tsx",
			"auth-client.js",
			"auth-client.jsx",
		];
		ac_possiblePaths = [
			...ac_possiblePaths,
			...ac_possiblePaths.map((it) => `lib/server/${it}`),
			...ac_possiblePaths.map((it) => `lib/auth/${it}`),
			...ac_possiblePaths.map((it) => `server/${it}`),
			...ac_possiblePaths.map((it) => `lib/${it}`),
			...ac_possiblePaths.map((it) => `utils/${it}`),
		];
		ac_possiblePaths = [
			...ac_possiblePaths,
			...ac_possiblePaths.map((it) => `src/${it}`),
			...ac_possiblePaths.map((it) => `src/app/${it}`),
			...ac_possiblePaths.map((it) => `app/${it}`),
		];

		let authConfigPath: string | null = null;

		if (options.config) {
			authConfigPath = path.join(cwd, options.config);
		} else {
			for (const possiblePath of possiblePaths) {
				const doesExist = existsSync(path.join(cwd, possiblePath));
				if (doesExist) {
					authConfigPath = path.join(cwd, possiblePath);
					break;
				}
			}
		}

		if (authConfigPath) {
			log.info(
				`Found ${chalk.bold(`auth.ts`)} file: ${chalk.gray(authConfigPath)}`,
			);
			helpers.setRuntimeData({
				...helpers.getRuntimeData(),
				authConfigPath,
			});
		} else {
			log.info(`No ${chalk.bold(`auth.ts`)} file found...`);
		}

		let authClientConfigPath: string | null = null;

		for (const possiblePath of ac_possiblePaths) {
			const doesExist = existsSync(path.join(cwd, possiblePath));
			if (doesExist) {
				authClientConfigPath = path.join(cwd, possiblePath);
				break;
			}
		}

		if (authClientConfigPath) {
			log.info(
				`Found ${chalk.bold(`auth-client.ts`)} file: ${chalk.gray(
					authClientConfigPath,
				)}`,
			);
			helpers.setRuntimeData({
				...helpers.getRuntimeData(),
				authClientConfigPath,
			});
		} else {
			log.info(`No ${chalk.bold(`auth-client.ts`)} file found...`);
		}

		let shouldCreateConfigs = false;

		// missing auth client config
		if (authConfigPath && !authClientConfigPath) {
			log.message(
				`We expect your auth.ts and auth-client.ts to be defined in pairs.`,
			);
			const result = await recursivelyAsk("auth-client.ts", cwd);
			if (result.status === "cancelled") {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}

			authClientConfigPath = result.path!;
			log.info(
				`${chalk.bold(`auth-client.ts`)} file set to: ${chalk.gray(
					authClientConfigPath,
				)}`,
			);
		} else if (authClientConfigPath && !authConfigPath) {
			log.message(
				`We expect your auth.ts and auth-client.ts to be defined in pairs.`,
			);
			const result = await recursivelyAsk("auth.ts", cwd);
			if (result.status === "cancelled") {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}

			authConfigPath = result.path!;
			log.info(
				`${chalk.bold(`auth.ts`)} file set to: ${chalk.gray(authConfigPath)}`,
			);
		} else if (authConfigPath && authClientConfigPath) {
			return {
				result: {
					state: "skipped",
					message: `${chalk.yellowBright(
						`Skipped`,
					)} code generation for auth.ts and auth-client.ts files.`,
					data: { authConfigPath, authClientConfigPath, shouldCreateConfigs },
					error: null,
				},
				shouldContinue: true,
			};
		} else {
			shouldCreateConfigs = true;
		}

		return {
			result: {
				data: { authConfigPath, authClientConfigPath, shouldCreateConfigs },
				error: null,
				message: null,
				state: "success",
			},
			shouldContinue: true,
		};
	},
};

async function recursivelyAsk(
	type: "auth.ts" | "auth-client.ts" = "auth.ts",
	cwd: string,
): Promise<{
	status: "cancelled" | "success";
	path: string | null;
}> {
	const authPath = await text({
		message: `What is the path to your ${type} file?`,
		placeholder: `./src/${type}`,
		validate: (value) => {
			if (
				!(
					value.endsWith(".ts") ||
					value.endsWith(".tsx") ||
					value.endsWith(".js") ||
					value.endsWith(".jsx")
				)
			)
				return "Invalid file extension. Please use .ts, .tsx, .js, or .jsx.";
			const fullPath = path.join(cwd, value);

			if (!(existsSync(fullPath) && lstatSync(fullPath).isFile()))
				return "Invalid path or file doesn't exist.";
		},
	});
	if (isCancel(authPath)) {
		return {
			status: "cancelled",
			path: null,
		};
	}
	if (typeof authPath === "undefined") {
		log.warn("Invalid value.");
		return await recursivelyAsk(type, cwd);
	}
	const fullPath = path.join(cwd, authPath);
	if (existsSync(fullPath) && lstatSync(fullPath).isFile()) {
		return {
			path: fullPath,
			status: "success",
		};
	} else {
		log.warn(`The path ${fullPath} doesn't exist or is not a file.`);
		return await recursivelyAsk(type, cwd);
	}
}
