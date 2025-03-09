import { cancel, confirm, isCancel } from "@clack/prompts";
import type { Step } from "../types";
import chalk from "chalk";

export const emailAndPasswordStep: Step<[]> = {
	description: "Email & Password Authentication",
	id: "email-password",
	exec: async (helpers, options) => {
		if (options.SkipEmailPassword === true) {
			return {
				result: {
					data: null,
					error: null,
					message: `Skipped ${chalk.yellowBright(
						"email & password authentication",
					)} step.`,
					state: "skipped",
				},
				shouldContinue: true,
			};
		} else if (typeof options.EmailPassword !== "undefined") {
			helpers.setRuntimeData({
				...helpers.getRuntimeData(),
				emailAndPasswordAuthentication: !!options.EmailPassword,
			});
			return {
				result: {
					data: null,
					error: null,
					message: `Email & password authentication ${chalk.greenBright(
						options.EmailPassword === true ? "enabled" : "disabled",
					)}`,
					state: "success",
				},
				shouldContinue: true,
			};
		}

		const enabled = await confirm({
			message: "Would you like to enable email & password authentication?",
		});

		if (isCancel(enabled)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		helpers.setRuntimeData({
			...helpers.getRuntimeData(),
			emailAndPasswordAuthentication: enabled,
		});

		return {
			result: {
				state: "success",
				data: null,
				error: null,
				message: `Email & Password authentication ${chalk.greenBright(
					enabled ? "enabled" : "disabled",
				)}.`,
			},
			shouldContinue: true,
		};
	},
};
