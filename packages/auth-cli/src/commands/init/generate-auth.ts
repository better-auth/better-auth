import type { ZodSchema } from "zod";
import type { DatabaseAdapter } from "./configs/databases.config";
import type { Framework } from "./configs/frameworks.config";
import type { Plugin } from "./configs/temp-plugins.config";
import {
	formatCode,
	generateInnerAuthConfigCode,
	getDatabaseCode,
} from "./utility";
import type { ImportGroup } from "./utility/imports";
import { createImport, getImportString } from "./utility/imports";
import { getPluginConfigs } from "./utility/plugin";

export type GetArgumentsOptions = {
	/**
	 * Unique flag identifier for the question.
	 * Allows for CLIs to override the question based on provided CLI flags.
	 */
	flag: string;
	/**
	 * Description of this argument. Used to display documentation in the CLI --help flag.
	 */
	description: string;
	/**
	 * The question to ask the user.
	 */
	question?: string;
	/**
	 * The options for the multiselect question.
	 */
	isMultiselectOptions?: {
		value: any;
		label?: string;
		hint?: string;
	}[];
	/**
	 * The options for the select question.
	 */
	isSelectOptions?: {
		value: any;
		label?: string;
		hint?: string;
	}[];
	/**
	 * Whether the argument is a confirmation question.
	 */
	isConformation?: boolean;
	/**
	 * Whether the argument is a number question.
	 */
	isNumber?: boolean;
	/**
	 * Whether the argument is required.
	 * If not provided, the argument is optional.
	 */
	isRequired?: boolean;
	/**
	 * Whether the argument is a nested object, thus meaning this specific argument
	 * cannot be prompted for, but rather the arguments for the nested object should be prompted for.
	 */
	isNestedObject?: false | GetArgumentsOptions[] | undefined;
	/**
	 * Whether to skip the question prompt for the argument, however still check the CLI flag for the argument.
	 * Useful for arguments that *could* be provided by CLI flags but shouldn't be prompted for.
	 */
	skipPrompt?: boolean;
	/**
	 * Default value for the argument of no value is provided.
	 */
	defaultValue?: any;
	/**
	 * Transform function to apply to the CLI input before schema validation.
	 * Useful for converting string input (e.g., comma-separated) into arrays.
	 */
	cliTransform?: (value: any) => any;
	/**
	 * Argument details
	 */
	argument: {
		/**
		 * The index of the argument in the function.
		 */
		index: number;
		/**
		 * If it's a property, this means that this index is an object and the property name is this string value.
		 * Else if `false`, it means this index is an entire value represented by this argument value.
		 */
		isProperty: false | string;
		/**
		 * Zod schema for validation and transformation of the argument value.
		 */
		schema?: ZodSchema;
	};
};

export type GetArgumentsFn = (
	options: GetArgumentsOptions,
) => any | Promise<any>;

export type GenerateAuthFileOptions = {
	plugins: Plugin[];
	database: DatabaseAdapter | null;
	framework: Framework;
	appName?: string;
	baseURL?: string;
	emailAndPassword?: boolean;
	socialProviders?: string[];
	/**
	 * A callback function that allows for the retrieval of arguments for the auth config.
	 * For example, certain plugins may require additional arguments to be passed to the plugin options.
	 */
	getArguments: GetArgumentsFn;
	installDependency: (dependencies: string | string[]) => Promise<void>;
};

export const generateAuthConfigCode = async ({
	plugins: pluginsConfig,
	database: databaseConfig,
	appName,
	baseURL,
	emailAndPassword,
	socialProviders,
	getArguments,
	installDependency,
}: GenerateAuthFileOptions) => {
	const database = getDatabaseCode(databaseConfig);
	const plugins = getPluginConfigs(pluginsConfig);

	let imports: ImportGroup[] = [
		{
			imports: [createImport({ name: "betterAuth" })],
			path: "better-auth",
			isNamedImport: false,
		},
		...Object.values(plugins)
			.map(({ auth }) => auth.imports)
			.flat(),
		...(database?.imports ?? []),
	];

	const authConfigCode = await generateInnerAuthConfigCode({
		plugins,
		database,
		appName,
		baseURL,
		emailAndPassword,
		socialProviders,
		getArguments,
	});

	const segmentedCode = {
		imports: await getImportString(imports),
		exports: "",
		preAuthConfig: database?.preCode ?? "",
		authConfig: authConfigCode,
		postAuthConfig: "",
	};

	// Database dependencies are now installed in the Configure Database step

	const code: string[] = [
		segmentedCode.imports,
		``,
		segmentedCode.preAuthConfig,
		``,
		`export const auth = betterAuth({`,
		segmentedCode.authConfig,
		`});`,
		``,
		segmentedCode.postAuthConfig,
		``,
		segmentedCode.exports,
	];
	return await formatCode(code.join("\n"));
};
