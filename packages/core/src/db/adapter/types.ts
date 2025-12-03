import type { BetterAuthOptions } from "../../types";
import type { Prettify } from "../../types/helper";
import type { BetterAuthDBSchema, DBFieldAttribute } from "../type";
import type {
	DBAdapterSchemaCreation as AdapterSchemaCreation,
	CustomAdapter as CoreCustomAdapter,
	DBAdapterFactoryConfig,
	JoinConfig,
	DBTransactionAdapter as TransactionAdapter,
	Where,
} from "./index";

export type AdapterFactoryOptions = {
	config: AdapterFactoryConfig;
	adapter: AdapterFactoryCustomizeAdapterCreator;
};

export interface AdapterFactoryConfig
	extends Omit<DBAdapterFactoryConfig<BetterAuthOptions>, "transaction"> {
	/**
	 * Execute multiple operations in a transaction.
	 *
	 * If the database doesn't support transactions, set this to `false` and operations will be executed sequentially.
	 *
	 * @default false
	 */
	transaction?:
		| (
				| false
				| (<R>(callback: (trx: TransactionAdapter) => Promise<R>) => Promise<R>)
		  )
		| undefined;
}

export type AdapterFactoryCustomizeAdapterCreator = (config: {
	options: BetterAuthOptions;
	/**
	 * The schema of the user's Better-Auth instance.
	 */
	schema: BetterAuthDBSchema;
	/**
	 * The debug log function.
	 *
	 * If the config has defined `debugLogs` as `false`, no logs will be shown.
	 */
	debugLog: (...args: any[]) => void;
	/**
	 * Get the model name which is expected to be saved in the database based on the user's schema.
	 */
	getModelName: (model: string) => string;
	/**
	 * Get the field name which is expected to be saved in the database based on the user's schema.
	 */
	getFieldName: ({ model, field }: { model: string; field: string }) => string;
	/**
	 * This function helps us get the default model name from the schema defined by devs.
	 * Often times, the user will be using the `modelName` which could had been customized by the users.
	 * This function helps us get the actual model name useful to match against the schema. (eg: schema[model])
	 *
	 * If it's still unclear what this does:
	 *
	 * 1. User can define a custom modelName.
	 * 2. When using a custom modelName, doing something like `schema[model]` will not work.
	 * 3. Using this function helps us get the actual model name based on the user's defined custom modelName.
	 * 4. Thus allowing us to use `schema[model]`.
	 */
	getDefaultModelName: (model: string) => string;
	/**
	 * This function helps us get the default field name from the schema defined by devs.
	 * Often times, the user will be using the `fieldName` which could had been customized by the users.
	 * This function helps us get the actual field name useful to match against the schema. (eg: schema[model].fields[field])
	 *
	 * If it's still unclear what this does:
	 *
	 * 1. User can define a custom fieldName.
	 * 2. When using a custom fieldName, doing something like `schema[model].fields[field]` will not work.
	 *
	 */
	getDefaultFieldName: ({
		model,
		field,
	}: {
		model: string;
		field: string;
	}) => string;
	/**
	 * Get the field attributes for a given model and field.
	 *
	 * Note: any model name or field name is allowed, whether default to schema or not.
	 */
	getFieldAttributes: ({
		model,
		field,
	}: {
		model: string;
		field: string;
	}) => DBFieldAttribute;
	// The following functions are exposed primarily for the purpose of having wrapper adapters.
	transformInput: (
		data: Record<string, any>,
		defaultModelName: string,
		action: "create" | "update",
		forceAllowId?: boolean | undefined,
	) => Promise<Record<string, any>>;
	transformOutput: (
		data: Record<string, any>,
		defaultModelName: string,
		select?: string[] | undefined,
		joinConfig?: JoinConfig | undefined,
	) => Promise<Record<string, any>>;
	transformWhereClause: <W extends Where[] | undefined>({
		model,
		where,
	}: {
		where: W;
		model: string;
	}) => W extends undefined ? undefined : CleanedWhere[];
}) => CustomAdapter;

/**
 * @deprecated Use `CustomAdapter` from `@better-auth/core/db/adapter` instead.
 */
export interface CustomAdapter extends Omit<CoreCustomAdapter, "createSchema"> {
	createSchema?:
		| ((props: {
				/**
				 * The file the user may have passed in to the `generate` command as the expected schema file output path.
				 */
				file?: string;
				/**
				 * The tables from the user's Better-Auth instance schema.
				 */
				tables: BetterAuthDBSchema;
		  }) => Promise<AdapterSchemaCreation>)
		| undefined;
}

/**
 * @deprecated Use `CleanedWhere` from `@better-auth/core/db/adapter` instead.
 */
export type CleanedWhere = Prettify<Required<Where>>;

export type AdapterTestDebugLogs = {
	resetDebugLogs: () => void;
	printDebugLogs: () => void;
};

/**
 * @deprecated Use `AdapterFactoryOptions` instead. This export will be removed in a future version.
 */
export type CreateAdapterOptions = AdapterFactoryOptions;

/**
 * @deprecated Use `AdapterFactoryConfig` instead. This export will be removed in a future version.
 */
export type AdapterConfig = AdapterFactoryConfig;

/**
 * @deprecated Use `AdapterFactoryCustomizeAdapterCreator` instead. This export will be removed in a future version.
 */
export type CreateCustomAdapter = AdapterFactoryCustomizeAdapterCreator;
