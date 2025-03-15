import { format as prettierFormat } from "prettier";
import {
	cancel,
	confirm,
	isCancel,
	log,
	multiselect,
	select,
	spinner,
} from "@clack/prompts";
import { type Options, type RuntimeData } from ".";
import type {
	DependenciesGroup,
	Env,
	Format,
	PackageManager,
	Step,
	StepHelper,
	StepResult,
} from "./types";
import chalk from "chalk";
import { getPackageInfo } from "../../utils/get-package-info";
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "fs";
import dotenv from "dotenv";
import { checkPackageManagers } from "../../utils/check-package-managers";
import { installDependencies } from "../../utils/install-dependencies";
import path from "path";

const getEnvVariables: StepHelper["getEnvVariables"] = async (path: string) => {
	let envContents: string;
	try {
		envContents = readFileSync(path, "utf-8");
	} catch (error: any) {
		return {
			error: error?.message || error,
			result: null,
			success: false,
		};
	}
	try {
		const env = dotenv.parse(envContents);
		return {
			success: true,
			error: null,
			result: env as Record<string, string>,
		};
	} catch (error: any) {
		return {
			success: false,
			error: error?.message || error,
			result: null,
		};
	}
};

const getEnvFiles: StepHelper["getEnvFiles"] = async (cwd: string) => {
	try {
		const files = readdirSync(cwd, "utf-8");
		const envFiles = files.filter((file) => file.startsWith(".env"));
		return {
			success: true,
			error: null,
			result: envFiles,
		};
	} catch (error: any) {
		return {
			success: false,
			error: error?.message || error,
			result: null,
		};
	}
};

const getPackageJson: StepHelper["getPackageJson"] = async (cwd: string) => {
	try {
		const pkgJson = getPackageInfo(cwd);
		return {
			success: true,
			error: null,
			result: pkgJson,
		};
	} catch (error: any) {
		return {
			success: false,
			error: error?.message || error,
			result: null,
		};
	}
};

export const promptForEnvFiles = async ({
	getRuntimeData,
	setRuntimeData,
	cwd,
}: {
	getRuntimeData: () => RuntimeData;
	setRuntimeData: (d: RuntimeData) => void;
	cwd: string;
}): Promise<{
	success: boolean;
	errorMessage?: string;
	envFiles: { name: string; variables: Record<string, string> }[];
}> => {
	let envFiles = getRuntimeData().envFiles;
	if (envFiles === null) {
		const envFilesResult = await getEnvFiles(cwd);
		if (envFilesResult.error) {
			console.error(envFilesResult.error);
			return {
				errorMessage: `Skipping ENV file checks step given the error in fetching ENV files in your project at: ${cwd}`,
				success: false,
				envFiles: [],
			};
		}
		if (envFilesResult.result!.length === 0) {
			log.info(`No ENV files found.`);
			const shouldCreateEnvFile = await confirm({
				message: `Would you like to create an env file?`,
			});
			if (isCancel(shouldCreateEnvFile)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			if (shouldCreateEnvFile) {
				writeFileSync(".env", "", "utf-8");
				envFiles = [".env"];
			} else {
				return {
					success: false,
					errorMessage: `Skipping ENV file generation.`,
					envFiles: [],
				};
			}
		} else {
			const selection = await multiselect({
				message:
					"Select the ENV files which are allowed to include Better Auth related ENV variables",
				options: envFilesResult.result!.map((x) => ({ value: x, label: x })),
			});
			if (isCancel(selection)) {
				cancel("✋ Operation cancelled.");
				process.exit(0);
			}
			envFiles = selection;
		}
		setRuntimeData({
			...getRuntimeData(),
			envFiles,
		});

		const envFilesAndVariables: {
			name: string;
			variables: Record<string, string>;
		}[] = [];
		for await (const envFile of envFiles) {
			const envPath = path.join(cwd, envFile);
			const {
				result: variables,
				error,
				success,
			} = await getEnvVariables(envPath);
			if (error) {
				log.error(`Failed to get ENV variables from ${envFile}`);
				log.error(error);
				continue;
			}
			if (variables) {
				envFilesAndVariables.push({
					name: envFile,
					variables,
				});
			}
		}
		return {
			success: true,
			envFiles: envFilesAndVariables,
		};
	}
	const envFilesAndVariables: {
		name: string;
		variables: Record<string, string>;
	}[] = [];
	for await (const envFile of envFiles) {
		const envPath = path.join(cwd, envFile);
		const {
			result: variables,
			error,
			success,
		} = await getEnvVariables(envPath);
		if (error) {
			log.error(`Failed to get ENV variables from ${envFile}`);
			log.error(error);
			continue;
		}
		if (variables) {
			envFilesAndVariables.push({
				name: envFile,
				variables,
			});
		}
	}
	return {
		success: true,
		envFiles: envFilesAndVariables,
	};
};

const format: Format = (str, opts) =>
	prettierFormat(str, {
		filepath: opts?.fileExtension?.replace(".", "") ? `file.${opts.fileExtension}` : "auth.ts",
		trailingComma: "all",
		semi: true,
	});

export const prepareSteps = ({
	getRuntimeData,
	setRuntimeData,
	runOutro,
	options,
}: {
	getRuntimeData: () => RuntimeData;
	setRuntimeData: (data: RuntimeData) => void;
	runOutro: () => void;
	options: Options;
}) => {
	let stepsCount = 0;

	const getPackageManager: StepHelper["getPackageManager"] = async () => {
		const runtime_data = getRuntimeData();
		if (runtime_data.packageManager !== null) {
			return {
				status: "success",
				result: runtime_data.packageManager,
			};
		}
		const { hasBun, hasPnpm } = await checkPackageManagers();
		if (!hasBun && !hasPnpm)
			return { result: "npm" as PackageManager, status: "success" };
		const selectedPackageManager = await select({
			message: "Select a package manager",
			options: [
				...(hasBun ? [{ value: "bun" }] : []),
				...(hasPnpm ? [{ value: "pnpm" }] : []),
				{ value: "npm" },
			],
		});
		if (isCancel(selectedPackageManager))
			return { status: "cancelled", result: null };

		setRuntimeData({
			...getRuntimeData(),
			packageManager: selectedPackageManager as PackageManager,
		});
		return {
			status: "success",
			result: selectedPackageManager as PackageManager,
		};
	};

	const stepHelper: StepHelper = {
		getEnvVariables,
		getEnvFiles,
		getPackageJson,
		getPackageManager,
		getRuntimeData,
		setRuntimeData,
		format,
	};

	async function autoInstallDependencies({
		result,
	}: { result: StepResult<any> }) {
		if (
			result.dependencyGroups &&
			result.dependencyGroups.length > 0 &&
			result.autoInstallDependencies !== false
		) {
			const dependencyGroups = result.dependencyGroups.filter(
				(x) => x.dependencies.length > 0,
			);
			for await (const dependencyGroup of dependencyGroups) {
				const installResult = await promptToInstallGroupDependencies({
					dependencyGroup: dependencyGroup,
					cwd: options.cwd,
					getPackageManager,
				});
				const res: StepResult<any> = {
					result: {
						data: null,
						error: installResult.failureReason || null,
						message:
							installResult.status === "cancelled"
								? "Operation cancelled."
								: null,
						state: installResult.status === "success" ? "success" : "failure",
					},
					shouldContinue: true,
				};
				logStepResult(res, runOutro);
			}
		}
	}

	async function autoApplyEnvs({
		result,
		getRuntimeData,
		setRuntimeData,
		cwd,
	}: {
		result: StepResult<any>;
		getRuntimeData: () => RuntimeData;
		setRuntimeData: (d: RuntimeData) => void;
		cwd: string;
	}): Promise<{
		success: boolean;
		errorMessage?: any | null;
	}> {
		if (
			result.autoApplyEnvs !== false &&
			result.envs &&
			result.envs.length > 0
		) {
			const d = await promptForEnvFiles({
				cwd: cwd,
				getRuntimeData,
				setRuntimeData,
			});
			if (!d.success) return { success: false, errorMessage: d.errorMessage };
			const envFiles = d.envFiles;
			let filesToUpdate: Record<string, Env[]> = {};
			for await (const envFile of envFiles) {
				for (const env of result.envs) {
					if (
						Object.keys(envFile.variables)
							.map((x) => x.toUpperCase())
							.includes(env.name.toUpperCase())
					)
						continue;

					filesToUpdate[envFile.name] = filesToUpdate[envFile.name]
						? [...filesToUpdate[envFile.name]!, env]
						: [env];
				}
			}

			if (Object.keys(filesToUpdate).length === 0) {
				log.info(`No ENV files to update.`);
				return { success: true };
			}

			for await (const [filename, envs] of Object.entries(filesToUpdate)) {
				const confirmed = await confirm({
					message: `Do you want to update ${chalk.bold(
						filename,
					)} with the new ENVs? ${envs
						.map((x) => chalk.greenBright(x.name))
						.join(", ")}`,
				});
				if (isCancel(confirm)) {
					return { success: false };
				}
				if (!confirmed) continue;
				const fileContent = envs
					.map(
						(env) =>
							`${env.name.toUpperCase()}${env.value ? `=${env.value}` : ""}${
								env.comment ? ` # ${env.comment}` : ""
							}`,
					)
					.join("\n");
				appendFileSync(path.join(options.cwd, filename), `\n${fileContent}`);
				log.success(`🎉 ENV files successfully updated in ${filename}`);
			}
		}
		return { success: true };
	}

	return {
		processStep: async function <StepT extends Step>(
			step: StepT,
			...parameters: StepT extends Step<infer Parameters> ? Parameters : any[]
		): Promise<
			{ id: string } & StepResult<
				StepT extends Step<infer P, infer Data> ? Data : any
			>
		> {
			const runtime_data = getRuntimeData();
			if (runtime_data.skippedSteps.includes(step.id)) {
				return {
					id: step.id,
					result: {
						data: null,
						error: null,
						message: null,
						state: "skipped",
					},
					shouldContinue: false,
				};
			}
			stepsCount++;
			logCurrentStep(stepsCount, step);

			const result = await step.exec(stepHelper, options, ...parameters);
			const new_runtime_data = getRuntimeData();

			setRuntimeData({
				...new_runtime_data,
				skippedSteps: [...new_runtime_data.skippedSteps],
			});

			logStepResult(result, runOutro);

			await autoInstallDependencies({ result });
			const envResults = await autoApplyEnvs({
				getRuntimeData,
				setRuntimeData,
				result,
				cwd: options.cwd,
			});
			if (envResults.success === false) {
				log.error(envResults.errorMessage);
				process.exit(1);
			}

			return {
				id: step.id,
				...result,
			};
		},
		processSubStep: async function <StepT extends Step>(
			step: StepT,
			...parameters: StepT extends Step<infer Parameters> ? Parameters : any[]
		): Promise<
			{ id: string } & StepResult<
				StepT extends Step<infer P, infer Data> ? Data : any
			>
		> {
			const runtime_data = getRuntimeData();
			if (runtime_data.skippedSteps.includes(step.id)) {
				return {
					id: step.id,
					result: {
						data: null,
						error: null,
						message: null,
						state: "skipped",
					},
					shouldContinue: false,
				};
			}
			stepsCount += 0.1;
			logCurrentStep(stepsCount, step);

			const result = await step.exec(stepHelper, options, ...parameters);
			const new_runtime_data = getRuntimeData();

			setRuntimeData({
				...new_runtime_data,
				skippedSteps: [...new_runtime_data.skippedSteps],
			});

			logStepResult(result, runOutro);

			await autoInstallDependencies({ result });
			const envResults = await autoApplyEnvs({
				getRuntimeData,
				setRuntimeData,
				result,
				cwd: options.cwd,
			});
			if (envResults.success === false) {
				log.error(envResults.errorMessage);
				process.exit(1);
			}

			return {
				id: step.id,
				...result,
			};
		},
	};
};

function logStepResult(result: StepResult<any>, runOutro: () => void) {
	const state = result.result.state;

	if (result.result.error) {
		log.message(result.result.error);
	}
	if (state === "success") {
		if (result.result.message) log.success(`✅ ${result.result.message}`);
	} else if (state === "failure") {
		if (result.result.message) log.error(`❌ ${result.result.message}`);
	} else if (state === "warning") {
		if (result.result.message) log.warning(`⚠️ ${result.result.message}`);
	} else if (state === "skipped") {
		if (result.result.message) log.info(`― ${result.result.message}`);
	}

	if (result.shouldContinue === false) {
		runOutro();
		process.exit(0);
	}
}

function logCurrentStep(stepsCount: number, step: Step) {
	log.message("");
	if (stepsCount !== 1) {
		// log.message(
		// 	chalk.gray(`―――――――――――――――――――――――――――――――――――――――――――――――――――――`),
		// );
		log.message("");
	}
	// log.step(
	// 	chalk.gray(
	// 		`${chalk.bold(
	// 			`${
	// 				!Number.isInteger(stepsCount) ? stepsCount.toFixed(1) : stepsCount
	// 			} ${stepsCount < 10 ? " " : ""}${step.id}`,
	// 		)}: ${step.description}`,
	// 	),
	// );
}

export const promptToInstallGroupDependencies = async ({
	dependencyGroup,
	cwd,
	getPackageManager,
}: {
	dependencyGroup: DependenciesGroup;
	cwd: string;
	getPackageManager: () => Promise<{
		status: "cancelled" | "success";
		result: PackageManager | null;
	}>;
}): Promise<{
	status: "cancelled" | "success" | "denied" | "failure";
	failureReason?: string;
}> => {
	const accept = await confirm({
		message: `Would you like to install the following dependencies? ${dependencyGroup.dependencies
			.map((it) =>
				chalk.cyanBright(
					`${it.packageName}${it.version ? `@${it.version}` : ""}`,
				),
			)
			.join(", ")}${chalk.green(
			dependencyGroup.type === "dev"
				? " (--save-dev)"
				: dependencyGroup.type === "peer"
					? " (--save-peer)"
					: "",
		)}`,
	});

	if (isCancel(accept)) {
		return {
			status: "cancelled",
		};
	}

	if (accept === false) {
		return {
			status: "denied",
		};
	}

	const pkgManagerResult = await getPackageManager();
	if (pkgManagerResult.status === "cancelled") {
		cancel("✋ Operation cancelled.");
		process.exit(0);
	}
	const packageManager = pkgManagerResult.result!;

	const s = spinner({ indicator: "dots" });
	s.start(`Installing dependencies with ${chalk.greenBright(packageManager)}`);

	const start = Date.now();
	const result = await installDependencies({
		cwd,
		dependencies: dependencyGroup,
		packageManager,
	});

	if (result.success === false) {
		s.stop(`Failed to install dependencies.`, 1);
		return {
			status: "failure",
			failureReason: result.error!,
		};
	}
	s.stop(
		`Dependencies installed successfully! ${chalk.gray(
			`${parseFloat((Date.now() - start).toFixed(2))}ms`,
		)}`,
	);

	return {
		status: "success",
	};
};
