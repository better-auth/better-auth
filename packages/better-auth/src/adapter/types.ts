import type { BetterAuthDbSchema } from "../db/get-tables";
import type { AdapterSchemaCreation, BetterAuthOptions, Where } from "../types";

export interface AdapterConfig {
	/**
	 * Use plural table names.
	 *
	 * All tables will be named with an `s` at the end.
	 */
	usePlural: boolean;
	/**
	 * Enable debug logs.
	 */
	debugLogs: boolean;
	/**
	 * Name of the adapter.
	 *
	 * This is used to identify the adapter in the debug logs.
	 */
	adapterName: string;
	/**
	 * Adapter id
	 */
	adapterId: string;
	/**
	 * If the database doesn't support JSON columns, set this to `false`.
	 *
	 * We will handle the translation between using `JSON` columns, and saving `string`s to the database.
	 */
	supportsJSON: boolean;
	/**
	 * If the database doesn't support dates, set this to `false`.
	 *
	 * We will handle the translation between using `Date` objects, and saving `string`s to the database.
	 */
	supportsDates: boolean;
	/**
	 * Custom transform input function.
	 *
	 * This function is used to transform the input data before it is saved to the database.
	 */
	customTransformInput?: (
		data: Record<string, any>,
		/**
		 * The fields of the model.
		 */
		fields: Record<string, any>,
		/**
		 * The action to perform.
		 */
		action: "create" | "update",
	) => Record<string, any>;
	/**
	 * Custom transform output function.
	 *
	 * This function is used to transform the output data before it is returned to the user.
	 */
	customTransformOutput?: (
		data: Record<string, any>,
		/**
		 * The fields of the model.
		 */
		fields: Record<string, any>,
		/**
		 * The fields to select.
		 */
		select: string[],
	) => Record<string, any>;
}

export interface CustomAdapter {
	create: <T extends Record<string, any>>({
		data,
		model,
	}: {
		model: string;
		data: T;
	}) => Promise<T>;
	update: <T>(data: {
		model: string;
		where: Where[];
		update: T;
	}) => Promise<T | null>;
	updateMany: (data: {
		model: string;
		where: Where[];
		update: Record<string, any>;
	}) => Promise<number>;
	findOne: <T>({
		model,
		where,
		select,
	}: {
		model: string;
		where: Where[];
		select?: string[];
	}) => Promise<T | null>;
	findMany: <T>({
		model,
		where,
		limit,
		sortBy,
		offset,
	}: {
		model: string;
		where?: Where[];
		limit?: number;
		sortBy?: { field: string; direction: "asc" | "desc" };
		offset?: number;
	}) => Promise<T[]>;
	delete: ({
		model,
		where,
	}: {
		model: string;
		where: Where[];
	}) => Promise<void>;
	deleteMany: ({
		model,
		where,
	}: {
		model: string;
		where: Where[];
	}) => Promise<number>;
	count: ({
		model,
		where,
	}: {
		model: string;
		where?: Where[];
	}) => Promise<number>;
	createSchema?: (file?: string) => Promise<AdapterSchemaCreation>;
	/**
	 * Your adapter's options.
	 */
	options: Record<string, any>;
}

export type CreateCustomAdapter = ({
	options,
	debugLog,
	schema,
}: {
	options: BetterAuthOptions;
	/**
	 * The schema of the user's Better-Auth instance.
	 */
	schema: BetterAuthDbSchema;
	/**
	 * The debug log function.
	 *
	 * If the config has defined `debugLogs` as `false`, no logs will be shown.
	 */
	debugLog: (...args: any[]) => void;
	/**
	 * Get the actual field name from the schema.
	 */
	getField: (model: string, field: string) => string;
}) => CustomAdapter;
