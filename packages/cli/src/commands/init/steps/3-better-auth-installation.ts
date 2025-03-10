import type { Step } from "../types";
import { getPackageInfo } from "../../../utils/get-package-info";
import { cancel, confirm, isCancel, spinner } from "@clack/prompts";
import { installDependencies } from "../../../utils/install-dependencies";
import chalk from "chalk";

export const betterAuthInstallationStep: Step<[], boolean> = {
	description: "Checking if Better Auth is installed",
	id: "better-auth-installation",
	exec: async (helpers, options) => {
		let pkgJson: Record<string, any>;
		try {
			pkgJson = await getPackageInfo(options.cwd);
		} catch (error: any) {
			return {
				result: {
					state: "failure",
					data: null,
					message: `Couldn't find your package.json file. (dir: ${options.cwd})`,
					error: error.message || error,
				},
				shouldContinue: false,
			};
		}

		const rawUserVersion = pkgJson.dependencies?.["better-auth"] as
			| undefined
			| string;

		// Better Auth is in deps, so skip installation step.
		if (rawUserVersion) {
			return {
				result: {
					state: "success",
					data: true,
					error: null,
					message: `Better Auth is already installed.`,
				},
				shouldContinue: true,
			};
		}

		const confirmInstallation = await confirm({
			message: `Would you like to install Better Auth?`,
		});

		if (isCancel(confirmInstallation)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		if (confirmInstallation) {
			const { result: packageManager, status } =
				await helpers.getPackageManager();

			if (status === "cancelled") {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}

			const s = spinner({ indicator: "dots" });
			s.start(
				`Installing Better Auth using ${chalk.greenBright(packageManager)}`,
			);
			const installationResults = await installDependencies({
				cwd: options.cwd,
				dependencies: ["better-auth@latest"],
				packageManager: packageManager!,
			});

			if (installationResults.success === false) {
				s.stop(`Failed to install Better Auth.`, 1);
				return {
					result: {
						error: installationResults.error,
						data: null,
						message: null,
						state: "failure",
					},
					shouldContinue: false,
				};
			}
			s.stop(`Installation complete!`)

			return {
				result: {
					state: "success",
					data: true,
					error: null,
					message: `Better Auth installed successfully!`,
				},
				shouldContinue: true,
			};
		}
		// they choose to skip the installation of better-auth.
		return {
			result: {
				state: "skipped",
				data: false,
				error: null,
				message: "Better Auth installation skipped.",
			},
			shouldContinue: true,
		};
	},
};
