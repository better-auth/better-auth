import { cancel, confirm, isCancel, multiselect } from "@clack/prompts";
import type { Step } from "../types";
import chalk from "chalk";
import { supportedPlugins, type SupportedPlugin } from "../supported-plugins";
import type { SupportedFramework } from "../supported-frameworks";

export const pluginStep: Step<[framework: SupportedFramework]> = {
	description: "Selecting plugins",
	id: "plugins",
	exec: async (helpers, options, framework) => {
		if (options.SkipPlugins === true) {
			return {
				result: {
					data: null,
					error: null,
					message: `Skipped ${chalk.yellowBright("plugins")} step.`,
					state: "skipped",
				},
				shouldContinue: true,
			};
		} else if (options["plugins"].length > 0) {
			const plugins = options["plugins"].map(
				(x) => supportedPlugins.find((y) => y.id === x)!,
			);
			helpers.setRuntimeData({
				...helpers.getRuntimeData(),
				plugins: plugins
			});
			return {
				result: {
					data: null,
					error: null,
					message: `Plugins selected: ${plugins
						.map((x) => chalk.greenBright(x.id))
						.join(", ")}`,
					state: "success",
				},
				shouldContinue: true,
			};
		}

		const conformation = await confirm({
			message: `Would you like set up plugins?`,
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
					message: `Skipped ${chalk.yellowBright("plugins")} step.`,
				},
				shouldContinue: true,
			};
		}

		let pluginChoices: SupportedPlugin[] = supportedPlugins.filter(
			(x) => x.id !== "next-cookies",
		);

		const selectedPlugins = await multiselect({
			message: "Select the plugins you want to use",
			options: pluginChoices.map((it) => ({
				value: it.id,
				label: it.name,
			})),
		});

		if (isCancel(selectedPlugins)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}

		if (framework === "next") {
			const shouldAddNextCookies = await confirm({
				message: `Would you like to add the next-cookies plugin? ${chalk.gray(
					`(Recommended)`,
				)}`,
			});
			if (isCancel(shouldAddNextCookies)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			if (shouldAddNextCookies) {
				selectedPlugins.push("next-cookies");
			}
		}

		helpers.setRuntimeData({
			...helpers.getRuntimeData(),
			plugins: selectedPlugins.map(
				(x) => supportedPlugins.find((y) => y.id === x)!,
			),
		});

		return {
			result: {
				state: "success",
				data: null,
				error: null,
				message: `Selected ${chalk.greenBright(
					selectedPlugins.length,
				)} plugins.`,
			},
			shouldContinue: true,
		};
	},
};
