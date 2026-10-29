import type { BetterAuthOptions } from "../../types";
import type { BetterAuthDBSchema, DBFieldAttribute } from "../type";
import type {
	CleanedWhere,
	CustomAdapter,
	DBAdapterFactoryConfig,
	JoinConfig,
	DBTransactionAdapter as TransactionAdapter,
	Where,
} from "./index";

export type AdapterFactoryOptions = {
	config: AdapterFactoryConfig;
	adapter: AdapterFactoryCustomizeAdapterCreator;
};

/** A migration plan displayed and executed by `auth migrate`. Planning must not apply schema changes. */
export interface DBAdapterMigrationPlan {
	/** Tables the migration will create, with their logical fields. */
	toBeCreated: { table: string; fields: Record<string, DBFieldAttribute> }[];
	/** Fields the migration will add to existing tables. */
	toBeAdded: { table: string; fields: Record<string, DBFieldAttribute> }[];
	/** Indexes the migration will create. */
	toBeAddedIndexes: {
		table: string;
		index: { columns: readonly string[]; unique?: boolean | undefined };
	}[];
	/** Problems that must prevent migration execution. */
	schemaProblems: string[];
	/** Apply the plan after the user confirms it. Reject unsafe changes before applying them. */
	runMigrations: () => Promise<void>;
}

/** Metadata for a column participating in a database index. */
export interface DatabaseIndexColumnMetadata {
	/** Whether the complete column value, rather than a prefix, is indexed. */
	readonly fullLength: boolean;
	readonly name: string | null;
	readonly position: number;
}

/** Normalized index metadata supplied by a database adapter. */
export interface DatabaseIndexMetadata {
	readonly columns: readonly DatabaseIndexColumnMetadata[];
	readonly name: string;
	readonly partial: boolean;
	readonly table: string;
	readonly unique: boolean;
	/** Whether the database reports the index as complete and usable. */
	readonly valid: boolean;
}

/** Read normalized index metadata for the requested physical tables. */
export type DatabaseIndexIntrospector = (
	tableNames: readonly string[],
) => Promise<readonly DatabaseIndexMetadata[]>;

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
	debugLog: (...args: unknown[]) => void;
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
		data: Record<string, unknown>,
		defaultModelName: string,
		action: "create" | "update",
		forceAllowId?: boolean | undefined,
	) => Promise<Record<string, unknown>>;
	transformOutput: (
		data: Record<string, unknown>,
		defaultModelName: string,
		select?: string[] | undefined,
		joinConfig?: JoinConfig | undefined,
	) => Promise<Record<string, unknown>>;
	transformWhereClause: <W extends Where[] | undefined>({
		model,
		where,
		action,
	}: {
		where: W;
		model: string;
		action:
			| "create"
			| "update"
			| "findOne"
			| "findMany"
			| "updateMany"
			| "delete"
			| "deleteMany"
			| "consumeOne"
			| "incrementOne"
			| "count";
	}) => W extends undefined ? undefined : CleanedWhere[];
}) => CustomAdapter;

export type AdapterTestDebugLogs = {
	resetDebugLogs: () => void;
	printDebugLogs: () => void;
};
