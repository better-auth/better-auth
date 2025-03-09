import { cancel, confirm, isCancel, log } from "@clack/prompts";
import type { Step } from "../types";
import chalk from "chalk";
import { generateAuth } from "../generators/generate-auth";
import { generateAuthClient } from "../generators/generate-auth-client";
import type { SupportedFramework } from "../supported-frameworks";
import { mkdirSync, readdirSync, writeFileSync } from "fs";
import path from "path";

export const generateAuthFilesStep: Step<[framework: SupportedFramework]> = {
	description: "Generate auth.ts and auth-client.ts files",
	id: "generate-auth-files",
	exec: async (helpers, options, framework) => {
		const enabled = await confirm({
			message: `Would you like us to generate ${chalk.bold(
				`auth.ts`,
			)} and ${chalk.bold(`auth-client.ts`)} files?`,
		});

		if (isCancel(enabled)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		if (!enabled) {
			return {
				result: {
					state: "skipped",
					data: null,
					error: null,
					message: `${chalk.yellowBright(
						"skipped",
					)} generating auth.ts and auth-client.ts files.`,
				},
				shouldContinue: true,
			};
		}

		const realtimeData = helpers.getRuntimeData();

		let authFile = await generateAuth({
			format: helpers.format,
			appName: realtimeData.appName,
			plugins: realtimeData.plugins ?? [],
			database: realtimeData.database,
			emailAndPasswordAuthentication:
				realtimeData.emailAndPasswordAuthentication,
			socialProviders: realtimeData.socialProviders || [],
		});

		const files = readdirSync(options.cwd, "utf-8");
		let root_path = options.cwd;
		if (files.includes("src")) root_path = path.join(root_path, "src");
		root_path = path.join(root_path, "lib");
		const authConfigPath = path.join(root_path, "auth.ts");


		mkdirSync(path.dirname(authConfigPath), { recursive: true });
		writeFileSync(authConfigPath, authFile, {});

		let authClientFile = await generateAuthClient({
			auth_config_path: "./auth.ts",
			plugins: realtimeData.plugins ?? [],
			format: helpers.format,
			framework: framework,
		});
		const authClientConfigPath = path.join(root_path, "auth-client.ts");
		mkdirSync(path.dirname(authClientConfigPath), { recursive: true });
		writeFileSync(authClientConfigPath, authClientFile);

		log.info(chalk.gray(`${chalk.bold(`Auth config:`)} ${authConfigPath}`));
		log.info(
			chalk.gray(
				`${chalk.bold(`Auth client config:`)} ${authClientConfigPath}`,
			),
		);

		helpers.setRuntimeData({
			...helpers.getRuntimeData(),
			authConfigPath,
			authClientConfigPath,
		});

		return {
			result: {
				state: "success",
				data: null,
				error: null,
				message: `${chalk.greenBright(
					"successfully",
				)} generated auth.ts and auth-client.ts files.`,
			},
			shouldContinue: true,
		};
	},
};
