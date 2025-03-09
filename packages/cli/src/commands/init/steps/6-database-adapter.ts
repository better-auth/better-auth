import { cancel, confirm, isCancel, select } from "@clack/prompts";
import type { Step } from "../types";
import chalk from "chalk";
import { databaseCodeSnippets, supportedDatabases } from "../supported-dbs";

export const databaseAdapterStep: Step<[]> = {
	description: "Selecting a database adapter",
	id: "database-adapter",
	exec: async (helpers, options) => {
		if (options.SkipDb === true) {
			return {
				result: {
					data: null,
					error: null,
					message: `Skipped ${chalk.yellowBright("database")} step.`,
					state: "skipped",
				},
				shouldContinue: true,
			};
		} else if (typeof options["database"] !== "undefined") {
			helpers.setRuntimeData({
				...helpers.getRuntimeData(),
				database: options["database"],
			});
			const db_details = databaseCodeSnippets[options["database"]]!;
			return {
				result: {
					data: null,
					error: null,
					message: `Database selected: ${chalk.greenBright(
						options["database"],
					)}`,
					state: "success",
				},
				shouldContinue: true,
				envs: db_details.envs,
				dependencyGroups: db_details.dependencies,
			};
		}

		const conformation = await confirm({
			message: `Would you like set up a database adapter?`,
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
					message: `Skipped ${chalk.yellowBright("database")} step.`,
				},
				shouldContinue: true,
			};
		}

		const selectedDatabase = await select({
			message: "Select a database adapter",
			options: supportedDatabases.map((it) => ({
				value: it,
				label: it,
			})),
		});

		if (isCancel(selectedDatabase)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		helpers.setRuntimeData({
			...helpers.getRuntimeData(),
			database: selectedDatabase,
		});

		const db_details = databaseCodeSnippets[selectedDatabase]!;

		return {
			result: {
				state: "success",
				data: null,
				error: null,
				message: `Database adapter selected: ${chalk.greenBright(
					selectedDatabase,
				)}`,
			},
			shouldContinue: true,
			dependencyGroups: db_details.dependencies,
			envs: db_details.envs,
		};
	},
};
