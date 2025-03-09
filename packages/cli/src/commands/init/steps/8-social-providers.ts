import { cancel, confirm, isCancel, log, multiselect } from "@clack/prompts";
import type { Step } from "../types";
import chalk from "chalk";
import { supportedSocialProviders } from "../supported-social-providers";

export const socialProvidersStep: Step<[]> = {
	description: "Selecting OAuth providers",
	id: "social-providers",
	exec: async (helpers, options) => {
		const runtime_data = helpers.getRuntimeData();
		if (options.SkipSocialProviders === true) {
			return {
				result: {
					data: null,
					error: null,
					message: `Skipped ${chalk.yellowBright("social providers")} step.`,
					state: "skipped",
				},
				shouldContinue: true,
			};
		} else if (options["socialProviders"].length > 0) {
			// if the user provided the social providers, then we should skip the prompt.
			helpers.setRuntimeData({
				...runtime_data,
				socialProviders: options["socialProviders"].map(
					(x) => supportedSocialProviders.find((y) => y.id === x)!,
				),
			});
			return {
				result: {
					data: null,
					error: null,
					message: `Social providers selected: ${options["socialProviders"]
						.map((x) => chalk.greenBright(x))
						.join(", ")}`,
					state: "success",
				},
				shouldContinue: true,
			};
		}

		const enabled = await confirm({
			message: `Would you like to set up social providers?`,
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
					message: `Skipped ${chalk.yellowBright("social providers")} step.`,
				},
				shouldContinue: true,
			};
		}

		const selectedSocialProviders = await multiselect({
			message: "Select the social providers you want to enable",
			options: supportedSocialProviders.map((it) => ({
				value: it.id,
				label: it.label,
			})),
		});

		if (isCancel(selectedSocialProviders)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		helpers.setRuntimeData({
			...helpers.getRuntimeData(),
			socialProviders: selectedSocialProviders.map(
				(x) => supportedSocialProviders.find((y) => y.id === x)!,
			),
		});

		log.info(
			chalk.gray(
				`${chalk.bold(
					`TIP:`,
				)} You can always enable any other social providers later by using the ${chalk.bold(
					`Generic OAuth`,
				)} plugin.`,
			),
		);

		return {
			result: {
				state: "success",
				data: null,
				error: null,
				message: `Enabled ${chalk.greenBright(
					selectedSocialProviders.length,
				)} social providers.`,
			},
			shouldContinue: true,
		};
	},
};
