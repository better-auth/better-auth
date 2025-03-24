import { safeJSONParse } from "../../utils/json";
import { withApplyDefault } from "../../adapters/utils";
import { getAuthTables } from "../../db/get-tables";
import type { Adapter, BetterAuthOptions, Where } from "../../types";
import { generateId as defaultGenerateId, logger } from "../../utils";
import type { AdapterConfig, CreateCustomAdapter } from "./types";
export * from "./types";

export const createAdapter =
	({
		adapter,
		config,
	}: {
		config: AdapterConfig;
		adapter: CreateCustomAdapter;
	}) =>
	(options: BetterAuthOptions): Adapter => {
		config.supportsBooleans = config.supportsBooleans ?? true;
		config.supportsDates = config.supportsDates ?? true;
		config.supportsJSON = config.supportsJSON ?? true;
		config.adapterName = config.adapterName ?? config.adapterId;

		// End-user's Better-Auth instance's schema
		const schema = getAuthTables(options);

		/**
		 * Get the actual field name from the schema.
		 * The adapter is used by developers, not the users. Meaning the devs do not know if the user customizes the model names or field names.
		 *
		 * This function helps us get the actual field name from the schema.
		 */
		function getField({
			model: model_name,
			field,
		}: { model: string; field: string }) {
			// Plugin `schema`s can't define their own `id`. Better-auth auto provides `id` to every schema model.
			// Given this, we can't just check if the `field` (that being `id`) is within the schema's fields, since it is never defined.
			// So we check if the `field` is `id` and if so, we return `id` itself. Otherwise, we return the `field` from the schema.
			if (field === "id") {
				return field;
			}
			const model = getDefaultModelName(model_name); // Just to make sure the model name is correct.

			let f = schema[model]?.fields[field];
			if (!f) {
				//@ts-expect-error - The model name can be a custom modelName, not one of the default ones.
				f = Object.values(schema).find((f) => f.modelName === model)!;
			}
			if (!f) {
				debugLog(`Field ${field} not found in model ${model}`);
				debugLog(`Schema:`, schema);
				throw new Error(`Field ${field} not found in model ${model}`);
			}
			return f?.fieldName || field;
		}

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
		 */
		const getDefaultModelName = (model: string) => {
			let m = schema[model] ? model : undefined;
			if (!m) {
				m = Object.entries(schema).find(([_, f]) => f.modelName === model)?.[0];
			}
			if (!m) {
				debugLog(`Model "${model}" not found in schema`);
				debugLog(`Schema:`, schema);
				throw new Error(`Model "${model}" not found in schema`);
			}
			return m;
		};

		/**
		 * Users can overwrite the default model of some tables. This function helps find the correct model name.
		 * Furthermore, if the user passes `usePlural` as true in their adapter config,
		 * then we should return the model name ending with an `s`.
		 */
		const getModelName = (model: string) => {
			return schema[model].modelName !== model
				? schema[model].modelName
				: config.usePlural
					? `${model}s`
					: model;
		};

		const debugLog = (...args: any[]) => {
			if (config.debugLogs === true || typeof config.debugLogs === "object") {
				if (typeof args[0] === "object" && "method" in args[0]) {
					const method = args.shift().method;
					if (typeof config.debugLogs === "object") {
						if (method === "create" && !config.debugLogs.create) {
							return;
						} else if (method === "update" && !config.debugLogs.update) {
							return;
						} else if (
							method === "updateMany" &&
							!config.debugLogs.updateMany
						) {
							return;
						} else if (method === "findOne" && !config.debugLogs.findOne) {
							return;
						} else if (method === "findMany" && !config.debugLogs.findMany) {
							return;
						} else if (method === "delete" && !config.debugLogs.delete) {
							return;
						} else if (
							method === "deleteMany" &&
							!config.debugLogs.deleteMany
						) {
							return;
						} else if (method === "count" && !config.debugLogs.count) {
							return;
						}
						logger.info(`[${config.adapterName}]`, ...args);
					} else {
						logger.info(`[${config.adapterName}]`, ...args);
					}
				} else {
					logger.info(`[${config.adapterName}]`, ...args);
				}
			}
		};

		const adapterInstance = adapter({
			options,
			schema,
			debugLog,
			getField,
			getDefaultModelName,
		});
		adapterInstance.options = options;

		const transformInput = async (
			data: Record<string, any>,
			unsafe_model: string,
			action: "create" | "update",
		) => {
			const transformedData: Record<string, any> = {};
			const fields = schema[unsafe_model].fields;
			const newMappedKeys = config.mapKeysTransformInput ?? {};
			if (!config.disableIdGeneration) {
				fields.id = {
					type: "string",
					defaultValue() {
						if (config.disableIdGeneration) return undefined;
						if (options.advanced?.generateId === false) return undefined;
						return (
							options.advanced?.generateId?.({ model: unsafe_model }) ??
							defaultGenerateId()
						);
					},
				};
			}
			for (const field in fields) {
				const value = data[field];
				const fieldAttributes = fields[field];

				let newFieldName: string =
					newMappedKeys[field] || fields[field].fieldName || field;
				if (
					value === undefined &&
					((!fieldAttributes.defaultValue &&
						!fieldAttributes.transform?.input) ||
						action === "update")
				) {
					continue;
				}
				// If the value is undefined, but the fieldAttr provides a `defaultValue`, then we'll use that.
				let newValue = withApplyDefault(value, fieldAttributes, action);

				// If the field attr provides a custom transform input, then we'll let it handle the value transformation.
				// Afterwards, we'll continue to apply the default transformations just to make sure it saves in the correct format.
				if (fieldAttributes.transform?.input) {
					newValue = await fieldAttributes.transform.input(newValue);
				}
				if (
					config.supportsJSON === false &&
					typeof newValue === "object" &&
					//@ts-expect-error -Future proofing
					fieldAttributes.type === "json"
				) {
					newValue = JSON.stringify(newValue);
				}

				if (
					config.supportsDates === false &&
					newValue instanceof Date &&
					fieldAttributes.type === "date"
				) {
					newValue = newValue.toISOString();
				}

				if (
					config.supportsBooleans === false &&
					typeof newValue === "boolean"
				) {
					newValue = newValue ? 1 : 0;
				}

				if (config.customTransformInput) {
					newValue = config.customTransformInput({
						data: newValue,
						action,
						field: newFieldName,
						fieldAttributes: fieldAttributes,
						model: unsafe_model,
						schema,
						options,
					});
				}

				transformedData[newFieldName] = newValue;
			}
			return transformedData;
		};

		const transformOutput = async (
			data: Record<string, any> | null,
			unsafe_model: string,
			select: string[] = [],
		) => {
			if (!data) return null;
			const newMappedKeys = config.mapKeysTransformOutput ?? {};
			const transformedData: Record<string, any> = {};
			const tableSchema = schema[unsafe_model].fields;
			const idKey = Object.entries(newMappedKeys).find(
				([_, v]) => v === "id",
			)?.[0];
			tableSchema[idKey ?? "id"] = {
				type: "string",
			};
			for (const key in tableSchema) {
				if (select.length && !select.includes(key)) {
					continue;
				}
				const field = tableSchema[key];
				if (field) {
					const originalKey = field.fieldName || key;
					// If the field is mapped, we'll use the mapped key. Otherwise, we'll use the original key.
					let newValue =
						data[
							Object.entries(newMappedKeys).find(
								([_, v]) => v === originalKey,
							)?.[0] || originalKey
						];

					if (field.transform?.output) {
						newValue = await field.transform.output(newValue);
					}

					let newFieldName: string = newMappedKeys[key] || key;
					if (
						config.supportsJSON === false &&
						typeof newValue === "string" &&
						//@ts-expect-error  -Future proofing
						field.type === "json"
					) {
						newValue = safeJSONParse(newValue);
					}

					if (
						config.supportsDates === false &&
						typeof newValue === "string" &&
						field.type === "date"
					) {
						newValue = new Date(newValue);
					}

					if (
						config.supportsBooleans === false &&
						typeof newValue === "number" &&
						field.type === "boolean"
					) {
						newValue = newValue === 1;
					}

					if (config.customTransformOutput) {
						newValue = config.customTransformOutput({
							data: newValue,
							field: newFieldName,
							fieldAttributes: field,
							select,
							model: unsafe_model,
							schema,
							options,
						});
					}

					transformedData[newFieldName] = newValue;
				}
			}
			return transformedData as any;
		};
		let transactionId = -1;
		return {
			create: async <T extends Record<string, any>, R = T>({
				data: unsafeData,
				model: unsafeModel,
				select,
			}: {
				model: string;
				data: T;
				select?: string[];
			}): Promise<R> => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				if (options.advanced?.generateId) {
					//@ts-ignore
					unsafeData.id = options.advanced.generateId({ model });
				} else if (
					!("id" in unsafeData) &&
					options.advanced?.generateId !== false &&
					config.disableIdGeneration !== true
				) {
					//@ts-ignore
					unsafeData.id = defaultGenerateId();
				}
				debugLog(
					{ method: "create" },
					`#${thisTransactionId} (1/4)`,
					"Create (Unsafe Input):",
					{ model, data: unsafeData },
				);
				const data = (await transformInput(
					unsafeData,
					unsafeModel,
					"create",
				)) as T;
				debugLog(
					{ method: "create" },
					`#${thisTransactionId} (2/4)`,
					"Create (Parsed Input):",
					{ model, data },
				);
				const res = await adapterInstance.create<T>({ data, model });
				debugLog(
					{ method: "create" },
					`#${thisTransactionId} (3/4)`,
					"Create (DB Result):",
					{ model, res },
				);
				const transformed = await transformOutput(res, unsafeModel, select);
				debugLog(
					{ method: "create" },
					`#${thisTransactionId} (4/4)`,
					"Create (Parsed Result):",
					{ model, data: transformed },
				);
				return transformed;
			},
			update: async <T>({
				model: unsafeModel,
				where,
				update: unsafeData,
			}: {
				model: string;
				where: Where[];
				update: Record<string, any>;
			}): Promise<T | null> => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				debugLog(
					{ method: "update" },
					`#${thisTransactionId} (1/4)`,
					"Update (Unsafe Input):",
					{ model, data: unsafeData },
				);
				const data = (await transformInput(
					unsafeData,
					unsafeModel,
					"update",
				)) as T;
				debugLog(
					{ method: "update" },
					`#${thisTransactionId} (2/4)`,
					"Update (Parsed Input):",
					{ model, data },
				);
				const res = await adapterInstance.update<T>({
					model,
					where,
					update: data,
				});
				debugLog(
					{ method: "update" },
					`#${thisTransactionId} (3/4)`,
					"Update (DB Result):",
					{ model, data: res },
				);
				const transformed = await transformOutput(res as any, unsafeModel);
				debugLog(
					{ method: "update" },
					`#${thisTransactionId} (4/4)`,
					"Update (Parsed Result):",
					{ model, data: transformed },
				);
				return transformed;
			},
			updateMany: async ({
				model: unsafeModel,
				where,
				update: unsafeData,
			}: {
				model: string;
				where: Where[];
				update: Record<string, any>;
			}) => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				debugLog(
					{ method: "updateMany" },
					`#${thisTransactionId} (1/4)`,
					"UpdateMany (Unsafe Input):",
					{ model, data: unsafeData },
				);
				const data = await transformInput(unsafeData, unsafeModel, "update");
				debugLog(
					{ method: "updateMany" },
					`#${thisTransactionId} (2/4)`,
					"UpdateMany (Parsed Input):",
					{ model, data },
				);
				const updatedCount = await adapterInstance.updateMany({
					model,
					where,
					update: data,
				});
				debugLog(
					{ method: "updateMany" },
					`#${thisTransactionId} (3/4)`,
					"UpdateMany (DB Result):",
					{ model, data:  updatedCount },
				);
				debugLog(
					{ method: "updateMany" },
					`#${thisTransactionId} (4/4)`,
					"UpdateMany (Parsed Result):",
					{ model, data: updatedCount },
				);
				return updatedCount;
			},
			findOne: async <T>({
				model: unsafeModel,
				where,
				select,
			}: {
				model: string;
				where: Where[];
				select?: string[];
			}) => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				debugLog(
					{ method: "findOne" },
					`#${thisTransactionId} (1/3)`,
					"FindOne:",
					{ model, where, select },
				);
				const res = await adapterInstance.findOne<T>({
					model,
					where,
					select,
				});
				debugLog(
					{ method: "findOne" },
					`#${thisTransactionId} (2/3)`,
					"FindOne (DB Result):",
					{ model, data: res },
				);
				const transformed = await transformOutput(
					res as any,
					unsafeModel,
					select,
				);
				debugLog(
					{ method: "findOne" },
					`#${thisTransactionId} (3/3)`,
					"FindOne (Parsed Result):",
					{ model, data: transformed },
				);
				return transformed;
			},
			findMany: async <T>({
				model: unsafeModel,
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
			}) => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				debugLog(
					{ method: "findMany" },
					`#${thisTransactionId} (1/3)`,
					"FindMany:",
					{ model, where, limit, sortBy, offset },
				);
				const res = await adapterInstance.findMany<T>({
					model,
					where,
					limit,
					sortBy,
					offset,
				});
				debugLog(
					{ method: "findMany" },
					`#${thisTransactionId} (2/3)`,
					"FindMany (DB Result):",
					{ model, data: res },
				);
				const transformed = await Promise.all(
					res.map(async (r) => await transformOutput(r as any, unsafeModel)),
				);
				debugLog(
					{ method: "findMany" },
					`#${thisTransactionId} (3/3)`,
					"FindMany (Parsed Result):",
					{ model, data: transformed },
				);
				return transformed;
			},
			delete: async ({
				model: unsafeModel,
				where,
			}: {
				model: string;
				where: Where[];
			}) => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				debugLog(
					{ method: "delete" },
					`#${thisTransactionId} (1/2)`,
					"Delete:",
					{ model, where },
				);
				await adapterInstance.delete({
					model,
					where,
				});
				debugLog(
					{ method: "delete" },
					`#${thisTransactionId} (2/2)`,
					"Delete (DB Result):",
					{ model },
				);
			},
			deleteMany: async ({
				model: unsafeModel,
				where,
			}: {
				model: string;
				where: Where[];
			}) => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				debugLog(
					{ method: "deleteMany" },
					`#${thisTransactionId} (1/2)`,
					"DeleteMany:",
					{ model, where },
				);
				const res = await adapterInstance.deleteMany({
					model,
					where,
				});
				debugLog(
					{ method: "deleteMany" },
					`#${thisTransactionId} (2/2)`,
					"DeleteMany:",
					{ model, data: res },
				);
				return res;
			},
			count: async ({
				model: unsafeModel,
				where,
			}: {
				model: string;
				where?: Where[];
			}) => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				debugLog({ method: "count" }, `#${thisTransactionId} (1/2)`, "Count:", {
					model,
					where,
				});
				const res = await adapterInstance.count({
					model,
					where,
				});
				debugLog({ method: "count" }, `#${thisTransactionId} (2/2)`, "Count:", {
					model,
					data: res,
				});
				return res;
			},
			createSchema: adapterInstance.createSchema
				? async (_, file) => {
						return adapterInstance.createSchema!(file);
					}
				: undefined,
			options: {
				adapterConfig: config,
				...(adapterInstance.options ? adapterInstance.options : {}),
			},
			id: config.adapterId,
		};
	};
