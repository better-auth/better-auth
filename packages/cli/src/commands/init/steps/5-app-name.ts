import { cancel, confirm, isCancel, text } from "@clack/prompts";
import type { Step } from "../types";
import chalk from "chalk";

export const appNameStep: Step<[]> = {
	description: "Setting the app name",
	id: "app-name",
	exec: async (helpers, options) => {
		if (options.SkipAppName === true) {
			return {
				result: {
					data: null,
					error: null,
					message: `Skipped ${chalk.yellowBright("app name")} step.`,
					state: "skipped",
				},
				shouldContinue: true,
			};
		}else if (typeof options["appName"] !== "undefined") {
			helpers.setRuntimeData({
				...helpers.getRuntimeData(),
				appName: options["appName"],
			});
			return {
				result: {
					data: null,
					error: null,
					message: `App name selected: ${chalk.greenBright(options["appName"])}`,
					state: "success",
				},
				shouldContinue: true,
			};
		}

		const conformation = await confirm({
			message: `Would you like to set up an app name?`,
		});

		if (isCancel(conformation)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		if (!conformation) {
			return {
				result: {
					state: "skipped",
					data: null,
					error: null,
					message: `Skipped ${chalk.yellowBright("app name")} step.`,
				},
				shouldContinue: true,
			};
		}

		const pkgJsonRes = await helpers.getPackageJson(options.cwd);
		if (!pkgJsonRes.success) {
			return {
				result: {
					state: "failure",
					data: null,
					message: `Failed to get package.json file at ${options.cwd}`,
					error: pkgJsonRes.error,
				},
				shouldContinue: false,
			};
		}
		const pkgJson = pkgJsonRes.result!;
		let appName: string;
		if (!pkgJson.name) {
			const newAppName = await text({
				message: `What is the name of your application? ${chalk.gray(
					`This will be used as the issuer for 2fa apps or social providers.`,
				)}`,
			});
			if (isCancel(newAppName)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			appName = newAppName;
		} else {
			const conformation = await confirm({
				message: `Is your app name ${chalk.bold(pkgJson.name)}?`,
			});

			if (isCancel(conformation)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}

			if (conformation) {
				appName = pkgJson.name;
			} else {
				const newAppName = await text({
					message: `What is the name of your application? ${chalk.gray(
						`This will be used as the issuer for 2fa apps or social providers.`,
					)}`,
				});
				if (isCancel(newAppName)) {
					cancel("✋ Operation cancelled.");
					process.exit(0);
				}
				appName = newAppName;
			}
		}

		helpers.setRuntimeData({
			...helpers.getRuntimeData(),
			appName,
		});

		return {
			result: {
				state: "success",
				data: null,
				error: null,
				message: `App name set: ${chalk.greenBright(appName)}`,
			},
			shouldContinue: true,
		};
	},
};
