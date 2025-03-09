import { cancel, confirm, isCancel, log } from "@clack/prompts";
import { getTsconfigInfo } from "../../../utils/get-tsconfig-info";
import type { Step } from "../types";
import chalk from "chalk";
import { writeFileSync } from "fs";
import path from "path";

export const checkTsConfig: Step<[]> = {
	id: "check-tsconfig",
	description: "Checking if your tsconfig setup is correct",
	exec: async (helpers, options) => {
		let tsconfigInfo: Record<string, any>;
		try {
			tsconfigInfo = await getTsconfigInfo(options.cwd);
		} catch (error: any) {
			return {
				result: {
					state: "failure",
					data: null,
					message: `Couldn't read your tsconfig.json file. (dir: ${options.cwd})`,
					error: error.message || error,
				},
                shouldContinue: true,
			};
		}
		if (
			!(
				"compilerOptions" in tsconfigInfo &&
				"strict" in tsconfigInfo.compilerOptions &&
				tsconfigInfo.compilerOptions.strict === true
			)
		) {
			log.warn(
				`Missing "${chalk.bold("compilerOptions.strict")}" to "${chalk.bold(
					"true",
				)}" in your tsconfig.json file.`,
			);
			const shouldAdd = await confirm({
				message: `Would you like us to add "${chalk.bold(
					"compilerOptions.strict",
				)}" to "${chalk.bold("true")}" in your tsconfig.json file?`,
			});

			if (isCancel(shouldAdd)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}

			if (shouldAdd) {
				try {
					writeFileSync(
						path.join(options.cwd, "tsconfig.json"),
						await helpers.format(
							JSON.stringify(
								Object.assign(tsconfigInfo, {
									compilerOptions: {
										strict: true,
									},
								}),
							),
							{ fileExtension: "json" },
						),
						"utf-8",
					);
					return {
						result: {
							data: null,
							error: null,
							message: `tsconfig.json ${chalk.greenBright(
								"successfully",
							)} updated.`,
							state: "success",
						},
						shouldContinue: true,
					};
				} catch (error: any) {
					return {
						result: {
							data: null,
							error: error.message || error,
							message: `Failed to update your tsconfig.json file.`,
							state: "failure",
						},
						shouldContinue: true,
					};
				}
			}
		}
        return {
            result: {
                data: null,
                error: null,
                message: `tsconfig.json is ${chalk.greenBright(
                    "correctly",
                )} setup.`,
                state: "success",
            },
            shouldContinue: true,
        };
	},
};
