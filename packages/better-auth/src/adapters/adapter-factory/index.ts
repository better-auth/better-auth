import type { BetterAuthOptions } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import type {
	CleanedWhere,
	DBAdapter,
	DBTransactionAdapter,
	Where,
} from "@better-auth/core/db/adapter";
import { getColorDepth, logger, TTY_COLORS } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import { withApplyDefault } from "../../adapters/utils";
import { getAuthTables } from "../../db/get-tables";
import { generateId as defaultGenerateId } from "../../utils";
import { safeJSONParse } from "../../utils/json";
import type {
	AdapterFactoryConfig,
	AdapterFactoryOptions,
	AdapterTestDebugLogs,
} from "./types";

export * from "./types";

let debugLogs: { instance: string; args: any[] }[] = [];
let transactionId = -1;

const createAsIsTransaction =
	(adapter: DBAdapter<BetterAuthOptions>) =>
	<R>(fn: (trx: DBTransactionAdapter<BetterAuthOptions>) => Promise<R>) =>
		fn(adapter);

export type AdapterFactory = (
	options: BetterAuthOptions,
) => DBAdapter<BetterAuthOptions>;

export const createAdapterFactory =
	({
		adapter: customAdapter,
		config: cfg,
	}: AdapterFactoryOptions): AdapterFactory =>
	(options: BetterAuthOptions): DBAdapter<BetterAuthOptions> => {
		const uniqueAdapterFactoryInstanceId = Math.random()
			.toString(36)
			.substring(2, 15);

		const config = {
			...cfg,
			supportsBooleans: cfg.supportsBooleans ?? true,
			supportsDates: cfg.supportsDates ?? true,
			supportsJSON: cfg.supportsJSON ?? false,
			adapterName: cfg.adapterName ?? cfg.adapterId,
			supportsNumericIds: cfg.supportsNumericIds ?? true,
			transaction: cfg.transaction ?? false,
			disableTransformInput: cfg.disableTransformInput ?? false,
			disableTransformOutput: cfg.disableTransformOutput ?? false,
		} satisfies AdapterFactoryConfig;
		const useNumberId =
			options.advanced?.database?.useNumberId === true ||
			options.advanced?.database?.generateId === "serial";
		if (useNumberId && config.supportsNumericIds === false) {
			throw new BetterAuthError(
				`[${config.adapterName}] Your database or database adapter does not support numeric ids. Please disable "useNumberId" in your config.`,
			);
		}

		// End-user's Better-Auth instance's schema
		const schema = getAuthTables(options);

		// This function helps us determine if a given field is the ID field for a model. It is implelemted to remove hardcoded "id" checks.
		const isIdField = (model: string, field: string): boolean => {
			const defaultModelName = getDefaultModelName(model);
			const modelSchema = schema[defaultModelName];
			
			// If field is literally "id", it's always the ID field (all tables have id)
			// This handles plugin tables that don't explicitly define id in their schema
			if (field === "id") {
				return true;
			}
			
			// MongoDB uses "_id" as the primary key field name, but we map it to "id" internally
			if (field === "_id") {
				return true;
			}
			
			if (!modelSchema) return false;

			// Check if the field name matches the ID field's fieldName (for custom ID fields like "user_id")
			const idFieldAttr = modelSchema.fields.id;
			if (idFieldAttr && idFieldAttr.fieldName === field) {
				return true;
			}

			return false;
		};
		// Function to get the actual ID field name for a model.
		const getIdFieldName = (model: string): string => {
			const defaultModelName = getDefaultModelName(model);
			const modelSchema = schema[defaultModelName];
			if (!modelSchema) {
				return "id";
			}
			if (!modelSchema?.fields?.id) {
				return "id";
			}
			const idFieldAttr = modelSchema.fields.id;
			return idFieldAttr.fieldName || "id";
		};
		/**
		 * This function helps us get the default field name from the schema defined by devs.
		 * Often times, the user will be using the `fieldName` which could had been customized by the users.
		 * This function helps us get the actual field name useful to match against the schema. (eg: schema[model].fields[field])
		 *
		 * If it's still unclear what this does:
		 *
		 * 1. User can define a custom fieldName.
		 * 2. When using a custom fieldName, doing something like `schema[model].fields[field]` will not work.
		 */

		const getDefaultFieldName = ({
			field,
			model: unsafe_model,
		}: {
			model: string;
			field: string;
		}) => {
			// Plugin `schema`s can't define their own `id`. Better-auth auto provides `id` to every schema model.
			// Given this, we can't just check if the `field` (that being `id`) is within the schema's fields, since it is never defined.
			// So we check if the `field` is `id` and if so, we return `id` itself. Otherwise, we return the `field` from the schema.
			// All tables have an id field (added automatically for plugin tables), so if field is "id", return it
			if (isIdField(unsafe_model, field)) {
				return "id";
			}
			const model = getDefaultModelName(unsafe_model); // Just to make sure the model name is correct.

			let f = schema[model]?.fields[field];
			if (!f) {
				const result = Object.entries(schema[model]!.fields!).find(
					([_, f]) => f.fieldName === field,
				);
				if (result) {
					f = result[1];
					field = result[0];
				}
			}
			if (!f) {
				debugLog(`Field ${field} not found in model ${model}`);
				debugLog(`Schema:`, schema);
				throw new BetterAuthError(`Field ${field} not found in model ${model}`);
			}
			return field;
		};

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
			// It's possible this `model` could had applied `usePlural`.
			// Thus we'll try the search but without the trailing `s`.
			if (config.usePlural && model.charAt(model.length - 1) === "s") {
				let pluralessModel = model.slice(0, -1);
				let m = schema[pluralessModel] ? pluralessModel : undefined;
				if (!m) {
					m = Object.entries(schema).find(
						([_, f]) => f.modelName === pluralessModel,
					)?.[0];
				}

				if (m) {
					return m;
				}
			}

			let m = schema[model] ? model : undefined;
			if (!m) {
				m = Object.entries(schema).find(([_, f]) => f.modelName === model)?.[0];
			}

			if (!m) {
				debugLog(`Model "${model}" not found in schema`);
				debugLog(`Schema:`, schema);
				throw new BetterAuthError(`Model "${model}" not found in schema`);
			}
			return m;
		};

		/**
		 * Users can overwrite the default model of some tables. This function helps find the correct model name.
		 * Furthermore, if the user passes `usePlural` as true in their adapter config,
		 * then we should return the model name ending with an `s`.
		 */
		const getModelName = (model: string) => {
			const defaultModelKey = getDefaultModelName(model);
			const usePlural = config && config.usePlural;
			const useCustomModelName =
				schema &&
				schema[defaultModelKey] &&
				schema[defaultModelKey].modelName !== model;

			if (useCustomModelName) {
				return usePlural
					? `${schema[defaultModelKey]!.modelName}s`
					: schema[defaultModelKey]!.modelName;
			}

			return usePlural ? `${model}s` : model;
		};
		/**
		 * Get the field name which is expected to be saved in the database based on the user's schema.
		 *
		 * This function is useful if you need to save the field name to the database.
		 *
		 * For example, if the user has defined a custom field name for the `user` model, then you can use this function to get the actual field name from the schema.
		 */
		function getFieldName({
			model: model_name,
			field: field_name,
		}: {
			model: string;
			field: string;
		}) {
			const model = getDefaultModelName(model_name);
			const field = getDefaultFieldName({ model, field: field_name });

			return schema[model]?.fields[field]?.fieldName || field;
		}

		const debugLog = (...args: any[]) => {
			if (config.debugLogs === true || typeof config.debugLogs === "object") {
				// If we're running adapter tests, we'll keep debug logs in memory, then print them out if a test fails.
				if (
					typeof config.debugLogs === "object" &&
					"isRunningAdapterTests" in config.debugLogs
				) {
					if (config.debugLogs.isRunningAdapterTests) {
						args.shift(); // Removes the {method: "..."} object from the args array.
						debugLogs.push({ instance: uniqueAdapterFactoryInstanceId, args });
					}
					return;
				}

				if (
					typeof config.debugLogs === "object" &&
					config.debugLogs.logCondition &&
					!config.debugLogs.logCondition?.()
				) {
					return;
				}

				if (typeof args[0] === "object" && "method" in args[0]) {
					const method = args.shift().method;
					// Make sure the method is enabled in the config.
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
					}
					logger.info(`[${config.adapterName}]`, ...args);
				} else {
					logger.info(`[${config.adapterName}]`, ...args);
				}
			}
		};

		const idField = ({
			customModelName,
			forceAllowId,
		}: {
			customModelName?: string;
			forceAllowId?: boolean;
		}) => {
			const useNumberId =
				options.advanced?.database?.useNumberId ||
				options.advanced?.database?.generateId === "serial";
			const shouldGenerateId =
				!config.disableIdGeneration && !useNumberId && !forceAllowId;
			const model = getDefaultModelName(customModelName ?? "id");
			return {
				type: useNumberId ? "number" : "string",
				required: shouldGenerateId ? true : false,
				...(shouldGenerateId
					? {
							defaultValue() {
								if (config.disableIdGeneration) return undefined;
								let generateId = options.advanced?.database?.generateId;
								if (options.advanced?.generateId !== undefined) {
									logger.warn(
										"Your Better Auth config includes advanced.generateId which is deprecated. Please use advanced.database.generateId instead. This will be removed in future releases.",
									);
									generateId = options.advanced?.generateId;
								}
								if (generateId === false || useNumberId) return undefined;
								if (typeof generateId === "function") {
									return generateId({
										model,
									});
								}
								if (generateId === "uuid") {
									return crypto.randomUUID();
								}
								if (config.customIdGenerator) {
									return config.customIdGenerator({ model });
								}
								return defaultGenerateId();
							},
						}
					: {}),
			} satisfies DBFieldAttribute;
		};

		const getFieldAttributes = ({
			model,
			field,
		}: {
			model: string;
			field: string;
		}) => {
			const defaultModelName = getDefaultModelName(model);
			const defaultFieldName = getDefaultFieldName({
				field: field,
				model: defaultModelName,
			});

			const fields = schema[defaultModelName]!.fields;
			fields.id = idField({ customModelName: defaultModelName });
			const fieldAttributes = fields[defaultFieldName];
			if (!fieldAttributes) {
				throw new BetterAuthError(`Field ${field} not found in model ${model}`);
			}
			return fieldAttributes;
		};

		const transformInput = async (
			data: Record<string, any>,
			defaultModelName: string,
			action: "create" | "update",
			forceAllowId?: boolean,
		) => {
			const transformedData: Record<string, any> = {};
			const fields = schema[defaultModelName]!.fields;

			const newMappedKeys = config.mapKeysTransformInput ?? {};
			if (
				!config.disableIdGeneration &&
				!options.advanced?.database?.useNumberId
			) {
				// Preserve the fieldName from the schema when overwriting the id field
				const existingIdField = fields.id;
				fields.id = {
					...idField({
						customModelName: defaultModelName,
						forceAllowId: forceAllowId && "id" in data,
					}),
					fieldName: existingIdField?.fieldName || "id",
				};
			}
			for (const field in fields) {
				let value = data[field];
				const fieldAttributes = fields[field];

				let newFieldName: string =
					newMappedKeys[field] || fields[field]!.fieldName || field;
				
				// EARLY EXIT: When useNumberId is enabled and creating, skip ID field entirely
				// The database will auto-generate the ID, so we should NEVER include it in the data
				// This prevents null/undefined/empty values from being passed to the database
				if (
					action === "create" &&
					options.advanced?.database?.useNumberId &&
					isIdField(defaultModelName, field)
				) {
					continue; // Skip completely - database auto-generates
				}
				
				if (
					value === undefined &&
					((fieldAttributes!.defaultValue === undefined &&
						!fieldAttributes!.transform?.input &&
						!(action === "update" && fieldAttributes!.onUpdate)) ||
						(action === "update" && !fieldAttributes!.onUpdate))
				) {
					continue;
				}

				// In some endpoints (like signUpEmail) where there isn't proper Zod validation,
				// we might recieve a date as a string (this is because of the client converting the Date to a string
				// when sending to the server). Because of this, we'll convert the string to a Date.
				if (
					fieldAttributes &&
					fieldAttributes.type === "date" &&
					!(value instanceof Date) &&
					typeof value === "string"
				) {
					try {
						value = new Date(value);
					} catch {
						logger.error("[Adapter Factory] Failed to convert string to date", {
							value,
							field,
						});
					}
				}

				// If the value is undefined, but the fieldAttr provides a `defaultValue`, then we'll use that.
				let newValue = withApplyDefault(value, fieldAttributes!, action);

				// If the field attr provides a custom transform input, then we'll let it handle the value transformation.
				// Afterwards, we'll continue to apply the default transformations just to make sure it saves in the correct format.
				if (fieldAttributes!.transform?.input) {
					newValue = await fieldAttributes!.transform.input(newValue);
				}

				// Convert ID fields (primary keys and foreign keys) to numbers when useNumberId is enabled
				// Skip conversion if value is undefined/null/empty (e.g., when database auto-generates IDs)
				if (
					options.advanced?.database?.useNumberId &&
					newValue !== undefined &&
					newValue !== null &&
					newValue !== "" &&
					(isIdField(defaultModelName, field) ||
						(fieldAttributes!.references &&
							isIdField(
								fieldAttributes!.references.model,
								fieldAttributes!.references.field,
							)))
				) {
					if (Array.isArray(newValue)) {
						newValue = newValue.map((x) => (x !== null && x !== "" ? Number(x) : null));
					} else {
						const numValue = Number(newValue);
						// Skip if conversion results in NaN
						if (isNaN(numValue)) {
							continue;
						}
						newValue = numValue;
					}
				} else if (
					config.supportsJSON === false &&
					typeof newValue === "object" &&
					fieldAttributes!.type === "json"
				) {
					newValue = JSON.stringify(newValue);
				} else if (
					config.supportsDates === false &&
					newValue instanceof Date &&
					fieldAttributes!.type === "date"
				) {
					newValue = newValue.toISOString();
				} else if (
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
						fieldAttributes: fieldAttributes!,
						model: defaultModelName,
						schema,
						options,
					});
				}

				// Add values to transformedData, preserving null for nullable fields but excluding undefined and NaN
				// Null values are valid for nullable foreign keys and should be preserved
				if (newValue !== undefined && !(typeof newValue === "number" && isNaN(newValue))) {
					transformedData[newFieldName] = newValue;
				}
			}
			return transformedData;
		};

		const transformOutput = async (
			data: Record<string, any> | null,
			unsafe_model: string,
			select: string[] = [],
		) => {
			if (!data) return null;
			const defaultModelName = getDefaultModelName(unsafe_model);
			const newMappedKeys = config.mapKeysTransformOutput ?? {};
			const transformedData: Record<string, any> = {};
			const tableSchema = schema[defaultModelName]!.fields;
			const idKey = Object.entries(newMappedKeys).find(
				([_, v]) => v === "id",
			)?.[0];
			const finalIdKey = idKey ?? "id";
			// Preserve the existing field definition, especially fieldName
			const existingIdField = tableSchema[finalIdKey];
			const idFieldName = getIdFieldName(defaultModelName);
			// Ensure the id field exists and has the correct fieldName
			if (!tableSchema[finalIdKey]) {
				tableSchema[finalIdKey] = {} as DBFieldAttribute;
			}
			tableSchema[finalIdKey] = {
				...(existingIdField || {}),
				fieldName: existingIdField?.fieldName || idFieldName,
				type: options.advanced?.database?.useNumberId ? "number" : "string",
			};
			for (const key in tableSchema) {
				if (select.length && !select.includes(key)) {
					continue;
				}
				const field = tableSchema[key];
				if (field) {
					// For id field, always use getIdFieldName to get the correct database column name
					const originalKey =
						key === finalIdKey ? idFieldName : field.fieldName || key;

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

					// if (originalKey === "id" || field.references?.field === "id") {
					if (
						isIdField(defaultModelName, originalKey) ||
						(field.references &&
							isIdField(field.references.model, field.references.field))
					) {
						// Even if `useNumberId` is true, we must always return a string `id` output.
						if (typeof newValue !== "undefined" && newValue !== null)
							newValue = String(newValue);
					} else if (
						config.supportsJSON === false &&
						typeof newValue === "string" &&
						field.type === "json"
					) {
						newValue = safeJSONParse(newValue);
					} else if (
						config.supportsDates === false &&
						typeof newValue === "string" &&
						field.type === "date"
					) {
						newValue = new Date(newValue);
					} else if (
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

					// Always include all schema fields in the output, even if undefined
					// This ensures the result has all expected fields (required for tests and type safety)
					// Exception: Skip ID field here - it will be handled explicitly below
					if (newFieldName !== finalIdKey) {
						transformedData[newFieldName] = newValue;
					}
				}
			}
			// Explicitly handle id field with custom fieldName - ALWAYS override to ensure correct mapping
			// This ensures the ID field is correctly converted from database column name to logical name
			// Only skip if explicitly excluded in select
			if (!select.length || select.includes(finalIdKey)) {
				// Try all possible ID keys to find the value
				// This handles custom ID fields (user_id) and default ID fields (id)
				const possibleIdKeys = [
					idFieldName, // From getIdFieldName() - should be "user_id" for custom ID
					tableSchema[finalIdKey]?.fieldName, // From schema we set up
					"id", // Standard fallback
				].filter(
					(key): key is string => typeof key === "string" && key.length > 0,
				);

				let idValue: any = undefined;
				for (const key of possibleIdKeys) {
					if (key in data && data[key] !== undefined) {
						idValue = data[key];
						break;
					}
				}

				// Always set the ID field if we found a value (overrides any undefined value from the loop above)
				if (idValue !== undefined && idValue !== null) {
					transformedData[finalIdKey] = String(idValue);
				}
			}
			return transformedData as any;
		};

		const transformWhereClause = <W extends Where[] | undefined>({
			model,
			where,
		}: {
			where: W;
			model: string;
		}): W extends undefined ? undefined : CleanedWhere[] => {
			if (!where) return undefined as any;
			const newMappedKeys = config.mapKeysTransformInput ?? {};

			return where.map((w) => {
				const {
					field: unsafe_field,
					value,
					operator = "eq",
					connector = "AND",
				} = w;
				if (operator === "in") {
					if (!Array.isArray(value)) {
						throw new BetterAuthError("Value must be an array");
					}
				}

				let newValue = value;

				const defaultModelName = getDefaultModelName(model);
				const defaultFieldName = getDefaultFieldName({
					field: unsafe_field,
					model,
				});
				const fieldName: string =
					newMappedKeys[defaultFieldName] ||
					getFieldName({
						field: defaultFieldName,
						model: defaultModelName,
					});

				const fieldAttr = getFieldAttributes({
					field: defaultFieldName,
					model: defaultModelName,
				});

				// if (
				// 	defaultFieldName === "id" ||
				// 	fieldAttr!.references?.field === "id"
				// )
				if (
					isIdField(defaultModelName, defaultFieldName) ||
					(fieldAttr!.references &&
						isIdField(fieldAttr!.references.model, fieldAttr!.references.field))
				) {
					if (options.advanced?.database?.useNumberId) {
						if (Array.isArray(value)) {
							newValue = value.map(Number);
						} else {
							newValue = Number(value);
						}
					}
				}

				if (
					fieldAttr.type === "date" &&
					value instanceof Date &&
					!config.supportsDates
				) {
					newValue = value.toISOString();
				}

				if (
					fieldAttr.type === "boolean" &&
					typeof value === "boolean" &&
					!config.supportsBooleans
				) {
					newValue = value ? 1 : 0;
				}

				if (
					fieldAttr.type === "json" &&
					typeof value === "object" &&
					!config.supportsJSON
				) {
					try {
						const stringifiedJSON = JSON.stringify(value);
						newValue = stringifiedJSON;
					} catch (error) {
						throw new Error(
							`Failed to stringify JSON value for field ${fieldName}`,
							{ cause: error },
						);
					}
				}

				return {
					operator,
					connector,
					field: fieldName,
					value: newValue,
				} satisfies CleanedWhere;
			}) as any;
		};

		const adapterInstance = customAdapter({
			options,
			schema,
			debugLog,
			getFieldName,
			getModelName,
			getDefaultModelName,
			getDefaultFieldName,
			getFieldAttributes,
			transformInput,
			transformOutput,
			transformWhereClause,
		});

		let lazyLoadTransaction:
			| DBAdapter<BetterAuthOptions>["transaction"]
			| null = null;
		const adapter: DBAdapter<BetterAuthOptions> = {
			transaction: async (cb) => {
				if (!lazyLoadTransaction) {
					if (!config.transaction) {
						lazyLoadTransaction = createAsIsTransaction(adapter);
					} else {
						logger.debug(
							`[${config.adapterName}] - Using provided transaction implementation.`,
						);
						lazyLoadTransaction = config.transaction;
					}
				}
				return lazyLoadTransaction(cb);
			},
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
				unsafeModel = getDefaultModelName(unsafeModel);
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
					//@ts-expect-error
					unsafeData.id = undefined;
				}
				debugLog(
					{ method: "create" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(1, 4)}`,
					`${formatMethod("create")} ${formatAction("Unsafe Input")}:`,
					{ model, data: unsafeData },
				);
				let data = unsafeData;
				if (!config.disableTransformInput) {
					data = (await transformInput(
						unsafeData,
						unsafeModel,
						"create",
						forceAllowId,
					)) as T;
				}
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
				let transformed = res as any;
				if (!config.disableTransformOutput) {
					transformed = await transformOutput(res as any, unsafeModel, select);
				}
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
				unsafeModel = getDefaultModelName(unsafeModel);
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
				let data = unsafeData as T;
				if (!config.disableTransformInput) {
					data = (await transformInput(unsafeData, unsafeModel, "update")) as T;
				}
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
				let transformed = res as any;
				if (!config.disableTransformOutput) {
					transformed = await transformOutput(res as any, unsafeModel);
				}
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
				unsafeModel = getDefaultModelName(unsafeModel);
				debugLog(
					{ method: "updateMany" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(1, 4)}`,
					`${formatMethod("updateMany")} ${formatAction("Unsafe Input")}:`,
					{ model, data: unsafeData },
				);
				let data = unsafeData;
				if (!config.disableTransformInput) {
					data = await transformInput(unsafeData, unsafeModel, "update");
				}
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
				unsafeModel = getDefaultModelName(unsafeModel);
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
				let transformed = res as any;
				if (!config.disableTransformOutput) {
					transformed = await transformOutput(res as any, unsafeModel, select);
				}
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
				unsafeModel = getDefaultModelName(unsafeModel);
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
				let transformed = res as any;
				if (!config.disableTransformOutput) {
					transformed = await Promise.all(
						res.map(async (r) => await transformOutput(r as any, unsafeModel)),
					);
				}
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
				unsafeModel = getDefaultModelName(unsafeModel);
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
				unsafeModel = getDefaultModelName(unsafeModel);
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
				unsafeModel = getDefaultModelName(unsafeModel);
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
								debugLogs = debugLogs.filter(
									(log) => log.instance !== uniqueAdapterFactoryInstanceId,
								);
							},
							printDebugLogs() {
								const separator = `─`.repeat(80);
								const logs = debugLogs.filter(
									(log) => log.instance === uniqueAdapterFactoryInstanceId,
								);
								if (logs.length === 0) {
									return;
								}

								//`${colors.fg.blue}|${colors.reset} `,
								let log: any[] = logs
									.reverse()
									.map((log) => {
										log.args[0] = `\n${log.args[0]}`;
										return [...log.args, "\n"];
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
		return adapter;
	};

function formatTransactionId(transactionId: number) {
	if (getColorDepth() < 8) {
		return `#${transactionId}`;
	}
	return `${TTY_COLORS.fg.magenta}#${transactionId}${TTY_COLORS.reset}`;
}

function formatStep(step: number, total: number) {
	return `${TTY_COLORS.bg.black}${TTY_COLORS.fg.yellow}[${step}/${total}]${TTY_COLORS.reset}`;
}

function formatMethod(method: string) {
	return `${TTY_COLORS.bright}${method}${TTY_COLORS.reset}`;
}

function formatAction(action: string) {
	return `${TTY_COLORS.dim}(${action})${TTY_COLORS.reset}`;
}

/**
 * @deprecated Use `createAdapterFactory` instead. This export will be removed in a future version.
 */
export const createAdapter = createAdapterFactory;
