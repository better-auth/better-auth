import type { Options, RuntimeData } from ".";

export type Env = {
	name: string;
	value: string | undefined;
	comment?: string;
};

export type Dependency = {
	packageName: string;
	version?: string;
};

/**
 * Used to group dependencies by type
 */
export type DependenciesGroup = {
	type: "dev" | "peer" | "default";
	dependencies: Dependency[];
};

export type PackageManager = "bun" | "pnpm" | "npm";

export type StepHelper = {
	getEnvVariables: (path: string) => Promise<{
		success: boolean;
		error: StepError | null;
		result: Record<string, string> | null;
	}>;
	getEnvFiles: (cwd: string) => Promise<{
		success: boolean;
		error: StepError | null;
		result: string[] | null;
	}>;
	getPackageJson: (cwd: string) => Promise<{
		success: boolean;
		error: StepError | null;
		result: Record<string, any> | null;
	}>;
	getPackageManager: () => Promise<{
		status: "cancelled" | "success";
		result: PackageManager | null;
	}>;
	getRuntimeData: () => RuntimeData;
	setRuntimeData: (d: RuntimeData) => void;
	format: Format;
};

export type Step<Parameters extends any[] = any[], Data = any> = {
	/**
	 * A short description describing what the step does.
	 */
	description: string;
	/**
	 * The step identifier.
	 */
	id: string;
	/**
	 * Start the step.
	 */
	exec: (
		helper: StepHelper,
		options: Options,
		...params: Parameters
	) => StepResult<Data> | Promise<StepResult<Data>>;
};

export type StepResult<Data = any> = {
	result: {
		/**
		 * The state of the step.
		 */
		state: "success" | "failure" | "warning" | "skipped";
		/**
		 * The error details if the step failed.
		 */
		error: StepError | null;
		/**
		 * The data returned by the step.
		 */
		data: Data | null;
		/**
		 * A message to display to the user.
		 */
		message: string | null;
	};
	/**
	 * Whether to continue with the following steps.
	 */
	shouldContinue: boolean;
	/**
	 * An array containing the IDs of steps to skip.
	 */
	skipOtherSteps?: string[];
	/**
	 * Any dependencies that need to be installed.
	 */
	dependencyGroups?: DependenciesGroup[];
	/**
	 * Any ENVs that need to be added.
	 */
	envs?: Env[];
	/**
	 * After the step has finished, should we automatically prompt to install dependencies?
	 */
	autoInstallDependencies?: boolean;
	/**
	 * After the step has finished, should we automatically prompt apply the ENVs?
	 */
	autoApplyEnvs?: boolean;
};

export type StepError = any;

export type Import = {
	path: string;
	variables:
		| { asType?: boolean; name: string; as?: string }[]
		| { asType?: boolean; name: string; as?: string };
};

// export type PluginContents = {
// 	plugin: SupportedPlugin;
// 	contents: string;
// 	imports: Import[];
// };

export type Format = (
	code: string,
	options?: { fileExtension?: string },
) => Promise<string>;
