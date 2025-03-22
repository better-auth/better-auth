import { readdirSync } from "fs";
import {
	currentlySupportedFrameworks,
	frameworkLabels,
	supportedFrameworks,
	type CurrentlySupportedFrameworks,
	type SupportedFramework,
} from "../supported-frameworks";
import type { Step } from "../types";
import { cancel, confirm, isCancel, log, select } from "@clack/prompts";
import chalk from "chalk";

/*
    Notes:
    - First run through every possible data that would indicate the project's framework of choice without us having to ask.
    - If we can't find a framework, ask the user to choose one.
    - If we did find a framework, ask the user to confirm.
*/
export const getFrameworkStep: Step<[], CurrentlySupportedFrameworks> = {
	description: "Understanding the framework you're using...",
	id: "get-framework",
	exec: async (helpers, options) => {
		if (options.framework) {
			if (
				(currentlySupportedFrameworks as never as string[]).includes(
					options.framework,
				) === false
			) {
				log.warn(
					`The framework ${
						options.framework
					} is currently not supported. Please use one of the following supported frameworks to use the init CLI: ${currentlySupportedFrameworks.join(
						", ",
					)}`,
				);
				return {
					result: {
						data: null,
						error: null,
						message: null,
						state: "failure",
					},
					shouldContinue: false,
				};
			}
			return {
				result: {
					state: "success",
					data: options.framework as CurrentlySupportedFrameworks,
					error: null,
					message: `Framework selected: ${chalk.greenBright(
						frameworkLabels[options.framework],
					)}`,
				},
				shouldContinue: true,
			};
		}

		const cwd = options.cwd;
		const pkgJsonResult = await helpers.getPackageJson(cwd);
		if (!pkgJsonResult.success) {
			return {
				result: {
					state: "failure",
					data: null,
					message: pkgJsonResult.error,
					error: "Failed to read package.json file.",
				},
				shouldContinue: false,
			};
		}
		const pkgJson = pkgJsonResult.result!;

		// Check if the project is using Next.js
		let framework: SupportedFramework = "vanilla";
		let didDetect: boolean = true;
		let files = readdirSync(cwd, "utf-8");

		if (isNext(files, pkgJson)) {
			framework = "next";
		} else if (isRemix(pkgJson)) {
			framework = "remix";
		} else if (isAstro(files, pkgJson)) {
			framework = "astro";
		} else if (isNuxt(files, pkgJson)) {
			framework = "nuxt";
		} else if (isSolid(pkgJson)) {
			framework = "solid";
		} else if (isSvelte(files, pkgJson)) {
			framework = "svelte";
		} else if (isTanstackStart(pkgJson)) {
			framework = "tanstack-start";
		} else {
			didDetect = false;
		}

		if (didDetect) {
			const confirmFramework = await confirm({
				message: `Is ${chalk.cyanBright(
					frameworkLabels[framework],
				)} the framework you are using?`,
			});

			if (isCancel(confirmFramework)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			if (confirmFramework) {
				return {
					result: {
						state: "success",
						data: framework,
						error: null,
						message: `Framework selected: ${chalk.greenBright(
							frameworkLabels[framework],
						)}`,
					},
					shouldContinue: true,
				};
			}
			const selectedFramework = await promptForFramework();
			if (isCancel(selectedFramework)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			if (
				(currentlySupportedFrameworks as never as string[]).includes(
					selectedFramework,
				) === false
			) {
				log.warn(
					`The framework ${
						frameworkLabels[selectedFramework]
					} is currently not supported.\nPlease use one of the following supported frameworks to use the init CLI: ${currentlySupportedFrameworks
						.map((x) => chalk.bold(x))
						.join(", ")}`,
				);
				return {
					result: {
						data: null,
						error: null,
						message: null,
						state: "failure",
					},
					shouldContinue: false,
				};
			}
			return {
				result: {
					state: "success",
					data: selectedFramework as CurrentlySupportedFrameworks,
					error: null,
					message: `Framework selected: ${chalk.greenBright(
						frameworkLabels[selectedFramework],
					)}`,
				},
				shouldContinue: true,
			};
		}
		const selectedFramework = await promptForFramework();
		if (isCancel(selectedFramework)) {
			cancel("✋ Operation cancelled.");
			process.exit(0);
		}
		framework = selectedFramework;

		if (
			(currentlySupportedFrameworks as never as string[]).includes(
				selectedFramework,
			) === false
		) {
			log.warn(
				`The framework ${framework} is currently not supported. Please use one of the following supported frameworks to use the init CLI: ${currentlySupportedFrameworks.join(
					", ",
				)}`,
			);
			return {
				result: {
					data: null,
					error: null,
					message: null,
					state: "failure",
				},
				shouldContinue: false,
			};
		}

		return {
			result: {
				state: "success",
				data: framework as CurrentlySupportedFrameworks,
				error: null,
				message: `Framework selected: ${chalk.greenBright(
					frameworkLabels[framework],
				)}`,
			},
			shouldContinue: true,
		};
	},
};

async function promptForFramework() {
	const selectedFramework = await select({
		message: "Choose a framework",
		options: supportedFrameworks.map((it) => ({
			value: it,
			label: frameworkLabels[it],
		})),
	});
	return selectedFramework;
}

function isNext(files: string[], pkgJson: Record<string, any>) {
	const nextjsFiles = [
		"next.config.js",
		"next.config.ts",
		"next.config.mjs",
		".next/server/next.config.js",
		".next/server/next.config.ts",
		".next/server/next.config.mjs",
	];
	const foundFile = files.some((file) => nextjsFiles.includes(file));
	if (foundFile) return true;
	if (pkgJson.dependencies?.["next"] !== undefined) return true;
	return false;
}

function isRemix(packageJson: Record<string, any>) {
	return packageJson.dependencies?.["@remix-run/react"] !== undefined;
}

function isAstro(files: string[], pkgJson: Record<string, any>) {
	const astroFiles = [
		"astro.config.mjs",
		"astro.config.cjs",
		"astro.config.js",
		"astro.config.ts",
		".astro/config.mjs",
		".astro/config.cjs",
		".astro/config.js",
		".astro/config.ts",
	];
	const foundFile = files.some((file) => astroFiles.includes(file));
	if (foundFile) return true;
	if (
		pkgJson.dependencies?.["astro"] !== undefined ||
		pkgJson.devdependencies?.["astro"] !== undefined
	)
		return true;
	return false;
}

function isNuxt(files: string[], pkgJson: Record<string, any>) {
	const nuxtFiles = [
		"nuxt.config.js",
		"nuxt.config.ts",
		"nuxt.config.mjs",
		".nuxt/nuxt.config.js",
		".nuxt/nuxt.config.ts",
		".nuxt/nuxt.config.mjs",
	];
	const foundFile = files.some((file) => nuxtFiles.includes(file));
	if (foundFile) return true;
	if (
		pkgJson.dependencies?.["nuxt"] !== undefined ||
		pkgJson.devdependencies?.["nuxt"] !== undefined
	)
		return true;
	return false;
}

function isSolid(pkgJson: Record<string, any>) {
	if (
		pkgJson.dependencies?.["solid-js"] !== undefined ||
		pkgJson.devdependencies?.["solid-js"] !== undefined
	)
		return true;
	return false;
}

function isSvelte(files: string[], pkgJson: Record<string, any>) {
	const sveltekitFiles = ["svelte.config.js", "svelte.config.ts"];

	const foundFile = files.some((file) => sveltekitFiles.includes(file));
	if (foundFile) return true;

	if (pkgJson.dependencies?.["svelte"] !== undefined) return true;
	if (pkgJson.devdependencies?.["svelte"] !== undefined) return true;
	return false;
}

function isTanstackStart(pkgJson: Record<string, any>) {
	if (pkgJson.dependencies?.["@tanstack/react-start"] !== undefined)
		return true;
	if (pkgJson.devdependencies?.["@tanstack/react-start"] !== undefined)
		return true;
	return false;
}
