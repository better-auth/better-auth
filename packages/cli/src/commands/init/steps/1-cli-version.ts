import path from "path";
import type { Step } from "../types";
import { getPackageInfo } from "../../../utils/get-package-info";
import { spinner } from "@clack/prompts";
import { getNpmPackageVersion } from "../../../utils/get-npm-pkg-version";
import semver from "semver";
import chalk from "chalk";

export const cliVersionStep: Step<[]> = {
	description: "Making sure the Better Auth CLI is up-to-date...",
	id: "cli-version",
	exec: async (helpers) => {
		const cwd = path.join(import.meta.dirname, "../");
		let pkgJson: Record<string, any>;
		try {
			pkgJson = await getPackageInfo(cwd);
		} catch (error: any) {
			return {
				result: {
					state: "failure",
					data: null,
					message: `Couldn't find the Better Auth CLI package.json file. (dir: ${cwd})`,
					error: error.message || error,
				},
				shouldContinue: true,
			};
		}

		const s = spinner({ indicator: "dots" });
		s.start(`Checking @better-auth/cli version`);

		const result = await getNpmPackageVersion("@better-auth/cli");
		if (!result.success) {
			s.stop("Failed to fetch latest version of @better-auth/cli.");
			return {
				result: {
					data: null,
					state: "failure",
					message: null,
					error: result.error,
				},
				shouldContinue: true,
			};
		}

		s.stop("Finished fetching latest version of @better-auth/cli. 🚀");

		const latestVersion = semver.valid(semver.coerce(result.version))!;
		const userVersion = ["*", "workspace:*"].includes(pkgJson.version)
			? latestVersion
			: semver.valid(semver.coerce(pkgJson.version!));

		if (userVersion === null) {
			return {
				result: {
					state: "failure",
					error: `Invalid semver version: ${pkgJson.version}`,
					data: null,
					message: null,
				},
				shouldContinue: false,
			};
		}

		if (!semver.satisfies(userVersion, `^${latestVersion}`)) {
			return {
				result: {
					state: "failure",
					data: null,
					message: "Please consider using the latest CLI version.",
					error: `@better-auth/cli is not on latest. You're on ${chalk.bold(
						`v${pkgJson.version}`,
					)} but the latest version is ${chalk.bold(`v${result.version}`)}.`,
				},
				shouldContinue: true,
			};
		}

		return {
			result: {
				state: "success",
				data: null,
				error: null,
				message: `@better-auth/cli is ${chalk.greenBright(`up-to-date`)}!`,
			},
			shouldContinue: true,
		};
	},
};
