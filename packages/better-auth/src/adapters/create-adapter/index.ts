import { getAuthTables } from "../../db/get-tables";
import type { Adapter, BetterAuthOptions, Where } from "../../types";
import { logger } from "../../utils";
import type {
	AdapterConfig,
	AdapterTestDebugLogs,
	CreateCustomAdapter,
} from "./types";
import { initTransformInput } from "./transform-input";
import { initTransformOutput } from "./transform-output";
import { initTransformWhere } from "./transform-where";
import { initDebugLogs } from "./debug-logs";
import { initIdField } from "./id-field";
import { initGetDefaultFieldName } from "./get-default-field-name";
import { initGetDefaultModelName } from "./get-default-model-name";
import { initGetModelName } from "./get-model-name";
import { initGetFieldName } from "./get-field-name";
import { initGetFieldAttributes } from "./get-field-attributes";

export * from "./types";

let debugLogs: any[] = [];
let transactionId = -1;

const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	underscore: "\x1b[4m",
	blink: "\x1b[5m",
	reverse: "\x1b[7m",
	hidden: "\x1b[8m",
	fg: {
		black: "\x1b[30m",
		red: "\x1b[31m",
		green: "\x1b[32m",
		yellow: "\x1b[33m",
		blue: "\x1b[34m",
		magenta: "\x1b[35m",
		cyan: "\x1b[36m",
		white: "\x1b[37m",
	},
	bg: {
		black: "\x1b[40m",
		red: "\x1b[41m",
		green: "\x1b[42m",
		yellow: "\x1b[43m",
		blue: "\x1b[44m",
		magenta: "\x1b[45m",
		cyan: "\x1b[46m",
		white: "\x1b[47m",
	},
};

/**
 * Throws an error if the adapter doesn't support numeric ids,
 * yet the user enabled it in their auth config.
 */
function checkIfDatabaseSupportsNumberIds({
	config,
	options,
}: {
	config: AdapterConfig;
	options: BetterAuthOptions;
}) {
	if (
		options.advanced?.database?.useNumberId === true &&
		config.supportsNumericIds === false
	) {
		throw new Error(
			`[${config.adapterName}] Your database or database adapter does not support numeric ids. Please disable "useNumberId" in your config.`,
		);
	}
}

export const createAdapter =
	({
		adapter,
		config: cfg,
	}: {
		config: AdapterConfig;
		adapter: CreateCustomAdapter;
	}) =>
	(options: BetterAuthOptions): Adapter => {
		const config = {
			...cfg,
			supportsBooleans: cfg.supportsBooleans ?? true,
			supportsDates: cfg.supportsDates ?? true,
			supportsJSONB: cfg.supportsJSONB ?? false,
			supportsJSON: cfg.supportsJSON ?? false,
			supportsArrays: cfg.supportsArrays ?? true,
			supportsNumbers: cfg.supportsNumbers ?? true,
			adapterName: cfg.adapterName ?? cfg.adapterId,
			supportsNumericIds: cfg.supportsNumericIds ?? true,
		};

		checkIfDatabaseSupportsNumberIds({ config, options });

		const debugLog = initDebugLogs({ config, debugLogs });
		const schema = getAuthTables(options);
		const getDefaultModelName = initGetDefaultModelName({
			schema,
			debugLog,
			config,
		});
		const getDefaultFieldName = initGetDefaultFieldName({
			schema,
			debugLog,
			getDefaultModelName,
		});
		const getModelName = initGetModelName({
			config,
			getDefaultModelName,
			schema,
		});
		const getFieldName = initGetFieldName({
			getDefaultFieldName,
			getDefaultModelName,
			schema,
		});
		const idField = initIdField({ config, options, getDefaultModelName });
		const getFieldAttributes = initGetFieldAttributes({
			getDefaultFieldName,
			getDefaultModelName,
			idField,
			schema,
		});
		const transformInput = initTransformInput({
			schema,
			config,
			options,
			idField,
		});
		const transformOutput = initTransformOutput({
			schema,
			config,
			options,
		});
		const transformWhereClause = initTransformWhere({
			config,
			getDefaultFieldName,
			getDefaultModelName,
			getFieldAttributes,
			getFieldName,
			options,
		});
		const adapterInstance = adapter({
			options,
			schema,
			debugLog,
			getFieldName,
			getModelName,
			getDefaultModelName,
			getDefaultFieldName,
			getFieldAttributes,
		});

		return {
			create: async <T extends Record<string, any>, R = T>({
				data: unsafeData,
				model: unsafeModel,
				select,
				forceAllowId = false,
			}: {
				model: string;
				data: T;
				select?: string[];
				forceAllowId?: boolean;
			}): Promise<R> => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);

				if ("id" in unsafeData && !forceAllowId) {
					logger.warn(
						`[${config.adapterName}] - You are trying to create a record with an id. This is not allowed as we handle id generation for you, unless you pass in the \`forceAllowId\` parameter. The id will be ignored.`,
					);
					const err = new Error();
					const stack = err.stack
						?.split("\n")
						.filter((_, i) => i !== 1)
						.join("\n")
						.replace("Error:", "Create method with `id` being called at:");
					console.log(stack);
					//@ts-ignore
					unsafeData.id = undefined;
				}
				debugLog(
					{ method: "create" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(1, 4)}`,
					`${formatMethod("create")} ${formatAction("Unsafe Input")}:`,
					{ model, data: unsafeData },
				);
				const data = (await transformInput(
					unsafeData,
					unsafeModel,
					"create",
					forceAllowId,
				)) as T;
				debugLog(
					{ method: "create" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(2, 4)}`,
					`${formatMethod("create")} ${formatAction("Parsed Input")}:`,
					{ model, data },
				);
				const res = await adapterInstance.create<T>({ data, model });
				debugLog(
					{ method: "create" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(3, 4)}`,
					`${formatMethod("create")} ${formatAction("DB Result")}:`,
					{ model, res },
				);
				const transformed = await transformOutput(res, unsafeModel, select);
				debugLog(
					{ method: "create" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(4, 4)}`,
					`${formatMethod("create")} ${formatAction("Parsed Result")}:`,
					{ model, data: transformed },
				);
				return transformed;
			},
			update: async <T>({
				model: unsafeModel,
				where: unsafeWhere,
				update: unsafeData,
			}: {
				model: string;
				where: Where[];
				update: Record<string, any>;
			}): Promise<T | null> => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				const where = transformWhereClause({
					model: unsafeModel,
					where: unsafeWhere,
				});
				debugLog(
					{ method: "update" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(1, 4)}`,
					`${formatMethod("update")} ${formatAction("Unsafe Input")}:`,
					{ model, data: unsafeData },
				);
				const data = (await transformInput(
					unsafeData,
					unsafeModel,
					"update",
				)) as T;
				debugLog(
					{ method: "update" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(2, 4)}`,
					`${formatMethod("update")} ${formatAction("Parsed Input")}:`,
					{ model, data },
				);
				const res = await adapterInstance.update<T>({
					model,
					where,
					update: data,
				});
				debugLog(
					{ method: "update" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(3, 4)}`,
					`${formatMethod("update")} ${formatAction("DB Result")}:`,
					{ model, data: res },
				);
				const transformed = await transformOutput(res as any, unsafeModel);
				debugLog(
					{ method: "update" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(4, 4)}`,
					`${formatMethod("update")} ${formatAction("Parsed Result")}:`,
					{ model, data: transformed },
				);
				return transformed;
			},
			updateMany: async ({
				model: unsafeModel,
				where: unsafeWhere,
				update: unsafeData,
			}: {
				model: string;
				where: Where[];
				update: Record<string, any>;
			}) => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				const where = transformWhereClause({
					model: unsafeModel,
					where: unsafeWhere,
				});
				debugLog(
					{ method: "updateMany" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(1, 4)}`,
					`${formatMethod("updateMany")} ${formatAction("Unsafe Input")}:`,
					{ model, data: unsafeData },
				);
				const data = await transformInput(unsafeData, unsafeModel, "update");
				debugLog(
					{ method: "updateMany" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(2, 4)}`,
					`${formatMethod("updateMany")} ${formatAction("Parsed Input")}:`,
					{ model, data },
				);

				const updatedCount = await adapterInstance.updateMany({
					model,
					where,
					update: data,
				});
				debugLog(
					{ method: "updateMany" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(3, 4)}`,
					`${formatMethod("updateMany")} ${formatAction("DB Result")}:`,
					{ model, data: updatedCount },
				);
				debugLog(
					{ method: "updateMany" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(4, 4)}`,
					`${formatMethod("updateMany")} ${formatAction("Parsed Result")}:`,
					{ model, data: updatedCount },
				);
				return updatedCount;
			},
			findOne: async <T extends Record<string, any>>({
				model: unsafeModel,
				where: unsafeWhere,
				select,
			}: {
				model: string;
				where: Where[];
				select?: string[];
			}) => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				const where = transformWhereClause({
					model: unsafeModel,
					where: unsafeWhere,
				});
				debugLog(
					{ method: "findOne" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(1, 3)}`,
					`${formatMethod("findOne")}:`,
					{ model, where, select },
				);
				const res = await adapterInstance.findOne<T>({
					model,
					where,
					select,
				});
				debugLog(
					{ method: "findOne" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(2, 3)}`,
					`${formatMethod("findOne")} ${formatAction("DB Result")}:`,
					{ model, data: res },
				);
				const transformed = await transformOutput(
					res as any,
					unsafeModel,
					select,
				);
				debugLog(
					{ method: "findOne" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(3, 3)}`,
					`${formatMethod("findOne")} ${formatAction("Parsed Result")}:`,
					{ model, data: transformed },
				);
				return transformed;
			},
			findMany: async <T extends Record<string, any>>({
				model: unsafeModel,
				where: unsafeWhere,
				limit: unsafeLimit,
				sortBy,
				offset,
			}: {
				model: string;
				where?: Where[];
				limit?: number;
				sortBy?: { field: string; direction: "asc" | "desc" };
				offset?: number;
			}) => {
				transactionId++;
				let thisTransactionId = transactionId;
				const limit =
					unsafeLimit ??
					options.advanced?.database?.defaultFindManyLimit ??
					100;
				const model = getModelName(unsafeModel);
				const where = transformWhereClause({
					model: unsafeModel,
					where: unsafeWhere,
				});
				debugLog(
					{ method: "findMany" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(1, 3)}`,
					`${formatMethod("findMany")}:`,
					{ model, where, limit, sortBy, offset },
				);
				const res = await adapterInstance.findMany<T>({
					model,
					where,
					limit: limit,
					sortBy,
					offset,
				});
				debugLog(
					{ method: "findMany" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(2, 3)}`,
					`${formatMethod("findMany")} ${formatAction("DB Result")}:`,
					{ model, data: res },
				);
				const transformed = await Promise.all(
					res.map(async (r) => await transformOutput(r as any, unsafeModel)),
				);
				debugLog(
					{ method: "findMany" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(3, 3)}`,
					`${formatMethod("findMany")} ${formatAction("Parsed Result")}:`,
					{ model, data: transformed },
				);
				return transformed;
			},
			delete: async ({
				model: unsafeModel,
				where: unsafeWhere,
			}: {
				model: string;
				where: Where[];
			}) => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				const where = transformWhereClause({
					model: unsafeModel,
					where: unsafeWhere,
				});
				debugLog(
					{ method: "delete" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(1, 2)}`,
					`${formatMethod("delete")}:`,
					{ model, where },
				);
				await adapterInstance.delete({
					model,
					where,
				});
				debugLog(
					{ method: "delete" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(2, 2)}`,
					`${formatMethod("delete")} ${formatAction("DB Result")}:`,
					{ model },
				);
			},
			deleteMany: async ({
				model: unsafeModel,
				where: unsafeWhere,
			}: {
				model: string;
				where: Where[];
			}) => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				const where = transformWhereClause({
					model: unsafeModel,
					where: unsafeWhere,
				});
				debugLog(
					{ method: "deleteMany" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(1, 2)}`,
					`${formatMethod("deleteMany")} ${formatAction("DeleteMany")}:`,
					{ model, where },
				);
				const res = await adapterInstance.deleteMany({
					model,
					where,
				});
				debugLog(
					{ method: "deleteMany" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(2, 2)}`,
					`${formatMethod("deleteMany")} ${formatAction("DB Result")}:`,
					{ model, data: res },
				);
				return res;
			},
			count: async ({
				model: unsafeModel,
				where: unsafeWhere,
			}: {
				model: string;
				where?: Where[];
			}) => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				const where = transformWhereClause({
					model: unsafeModel,
					where: unsafeWhere,
				});
				debugLog(
					{ method: "count" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(1, 2)}`,
					`${formatMethod("count")}:`,
					{
						model,
						where,
					},
				);
				const res = await adapterInstance.count({
					model,
					where,
				});
				debugLog(
					{ method: "count" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(2, 2)}`,
					`${formatMethod("count")}:`,
					{
						model,
						data: res,
					},
				);
				return res;
			},
			createSchema: adapterInstance.createSchema
				? async (_, file) => {
						const tables = getAuthTables(options);

						if (
							options.secondaryStorage &&
							!options.session?.storeSessionInDatabase
						) {
							// biome-ignore lint/performance/noDelete: If the user has enabled secondaryStorage, as well as not specifying to store session table in DB, then createSchema shouldn't generate schema table.
							delete tables.session;
						}

						if (
							options.rateLimit &&
							options.rateLimit.storage === "database" &&
							// rate-limit will default to enabled in production,
							// and given storage is database, it will try to use the rate-limit table,
							// so we should make sure to generate rate-limit table schema
							(typeof options.rateLimit.enabled === "undefined" ||
								// and of course if they forcefully set to true, then they want rate-limit,
								// thus we should also generate rate-limit table schema
								options.rateLimit.enabled === true)
						) {
							tables.ratelimit = {
								modelName: options.rateLimit.modelName ?? "ratelimit",
								fields: {
									key: {
										type: "string",
										unique: true,
										required: true,
										fieldName: options.rateLimit.fields?.key ?? "key",
									},
									count: {
										type: "number",
										required: true,
										fieldName: options.rateLimit.fields?.count ?? "count",
									},
									lastRequest: {
										type: "number",
										required: true,
										bigint: true,
										defaultValue: () => Date.now(),
										fieldName:
											options.rateLimit.fields?.lastRequest ?? "lastRequest",
									},
								},
							};
						}
						return adapterInstance.createSchema!({ file, tables });
					}
				: undefined,
			options: {
				adapterConfig: config,
				...(adapterInstance.options ?? {}),
			},
			id: config.adapterId,

			// Secretly export values ONLY if this adapter has enabled adapter-test-debug-logs.
			// This would then be used during our adapter-tests to help print debug logs if a test fails.
			//@ts-expect-error - ^^
			...(config.debugLogs?.isRunningAdapterTests
				? {
						adapterTestDebugLogs: {
							resetDebugLogs() {
								debugLogs = [];
							},
							printDebugLogs() {
								const separator = `─`.repeat(80);

								//`${colors.fg.blue}|${colors.reset} `,
								let log: any[] = debugLogs
									.reverse()
									.map((log) => {
										log[0] = `\n${log[0]}`;
										return [...log, "\n"];
									})
									.reduce(
										(prev, curr) => {
											return [...curr, ...prev];
										},
										[`\n${separator}`],
									);

								console.log(...log);
							},
						} satisfies AdapterTestDebugLogs,
					}
				: {}),
		};
	};

function formatTransactionId(transactionId: number) {
	return `${colors.fg.magenta}#${transactionId}${colors.reset}`;
}

function formatStep(step: number, total: number) {
	return `${colors.bg.black}${colors.fg.yellow}[${step}/${total}]${colors.reset}`;
}

function formatMethod(method: string) {
	return `${colors.bright}${method}${colors.reset}`;
}

function formatAction(action: string) {
	return `${colors.dim}(${action})${colors.reset}`;
}
