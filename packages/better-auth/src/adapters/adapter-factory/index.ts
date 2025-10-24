import { safeJSONParse } from "../../utils/json";
import { withApplyDefault } from "../../adapters/utils";
import { getAuthTables } from "../../db/get-tables";
import type { BetterAuthOptions } from "@better-auth/core";
import { generateId as defaultGenerateId } from "../../utils";
import type {
	AdapterFactoryConfig,
	AdapterFactoryOptions,
	AdapterTestDebugLogs,
} from "./types";
import type { DBFieldAttribute } from "@better-auth/core/db";
import { logger, TTY_COLORS, getColorDepth } from "@better-auth/core/env";
import type {
	DBAdapter,
	DBTransactionAdapter,
	Where,
	CleanedWhere,
	Join,
	ResolvedJoin,
} from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
import { initGetDefaultModelName } from "./get-default-model-name";
import { initGetDefaultFieldName } from "./get-default-field-name";
import { initGetModelName } from "./get-model-name";
import { initGetFieldName } from "./get-field-name";

export {
	initGetDefaultModelName,
	initGetDefaultFieldName,
	initGetModelName,
	initGetFieldName,
};

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
			disableTransformJoin: cfg.disableTransformJoin ?? false,
		} satisfies AdapterFactoryConfig;

		if (
			options.advanced?.database?.useNumberId === true &&
			config.supportsNumericIds === false
		) {
			throw new BetterAuthError(
				`[${config.adapterName}] Your database or database adapter does not support numeric ids. Please disable "useNumberId" in your config.`,
			);
		}

		// End-user's Better-Auth instance's schema
		const schema = getAuthTables(options);

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

		const getDefaultModelName = initGetDefaultModelName({
			usePlural: config.usePlural,
			schema,
		});

		const getDefaultFieldName = initGetDefaultFieldName({
			usePlural: config.usePlural,
			schema,
		});

		const getModelName = initGetModelName({
			usePlural: config.usePlural,
			schema,
		});
		const getFieldName = initGetFieldName({
			schema,
			usePlural: config.usePlural,
		});

		const idField = ({
			customModelName,
			forceAllowId,
		}: {
			customModelName?: string;
			forceAllowId?: boolean;
		}) => {
			const shouldGenerateId =
				!config.disableIdGeneration &&
				!options.advanced?.database?.useNumberId &&
				!forceAllowId;
			const model = getDefaultModelName(customModelName ?? "id");
			return {
				type: options.advanced?.database?.useNumberId ? "number" : "string",
				required: shouldGenerateId ? true : false,
				...(shouldGenerateId
					? {
							defaultValue() {
								if (config.disableIdGeneration) return undefined;
								const useNumberId = options.advanced?.database?.useNumberId;
								let generateId = options.advanced?.database?.generateId;
								if (options.advanced?.generateId !== undefined) {
									logger.warn(
										"Your Better Auth config includes advanced.generateId which is deprecated. Please use advanced.database.generateId instead. This will be removed in future releases.",
									);
									generateId = options.advanced?.generateId;
								}
								if (generateId === false || useNumberId) return undefined;
								if (generateId) {
									return generateId({
										model,
									});
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
				fields.id = idField({
					customModelName: defaultModelName,
					forceAllowId: forceAllowId && "id" in data,
				});
			}
			for (const field in fields) {
				const value = data[field];
				const fieldAttributes = fields[field];

				let newFieldName: string =
					newMappedKeys[field] || fields[field]!.fieldName || field;
				if (
					value === undefined &&
					((fieldAttributes!.defaultValue === undefined &&
						!fieldAttributes!.transform?.input &&
						!(action === "update" && fieldAttributes!.onUpdate)) ||
						(action === "update" && !fieldAttributes!.onUpdate))
				) {
					continue;
				}
				// If the value is undefined, but the fieldAttr provides a `defaultValue`, then we'll use that.
				let newValue = withApplyDefault(value, fieldAttributes!, action);

				// If the field attr provides a custom transform input, then we'll let it handle the value transformation.
				// Afterwards, we'll continue to apply the default transformations just to make sure it saves in the correct format.
				if (fieldAttributes!.transform?.input) {
					newValue = await fieldAttributes!.transform.input(newValue);
				}

				if (
					fieldAttributes!.references?.field === "id" &&
					options.advanced?.database?.useNumberId
				) {
					if (Array.isArray(newValue)) {
						newValue = newValue.map((x) => (x !== null ? Number(x) : null));
					} else {
						newValue = newValue !== null ? Number(newValue) : null;
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

				if (newValue !== undefined) {
					transformedData[newFieldName] = newValue;
				}
			}
			return transformedData;
		};

		const transformOutput = async (
			data: Record<string, any> | null,
			unsafe_model: string,
			select: string[] = [],
			join: ResolvedJoin | undefined = undefined,
		) => {
			const transformSingleOutput = async (
				data: Record<string, any> | null,
				unsafe_model: string,
				select: string[] = [],
			) => {
				if (!data) return null;
				const newMappedKeys = config.mapKeysTransformOutput ?? {};
				const transformedData: Record<string, any> = {};
				const tableSchema = schema[getDefaultModelName(unsafe_model)]!.fields;
				const idKey = Object.entries(newMappedKeys).find(
					([_, v]) => v === "id",
				)?.[0];
				tableSchema[idKey ?? "id"] = {
					type: options.advanced?.database?.useNumberId ? "number" : "string",
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

						if (originalKey === "id" || field.references?.field === "id") {
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

						transformedData[newFieldName] = newValue;
					}
				}
				return transformedData as any;
			};

			if (!join) return await transformSingleOutput(data, unsafe_model, select);

			let transformedData: Record<string, any> = {};
			unsafe_model = getDefaultModelName(unsafe_model);
			const requiredModels = [unsafe_model, ...Object.keys(join)].map(
				(model) => ({
					modelName: getModelName(model),
					defaultModelName: getDefaultModelName(model),
				}),
			);

			if (!data) return null;
			// Data is now the base model object directly (not wrapped under a key)
			const baseModel: Record<string, any> = data;
			for (const { modelName, defaultModelName } of requiredModels) {
				if (defaultModelName === unsafe_model) {
					// base model should be represent the entire record, and any joined models should be nested under it.
					transformedData = await transformSingleOutput(
						baseModel,
						modelName,
						select,
					);
				} else {
					// joined models should be nested under the base model.
					let joinedData = baseModel[modelName];

					// Check if the foreign key field in the joined model has a unique constraint
					// If unique, unwrap array to single object; otherwise keep as array
					const joinedModelSchema = schema[defaultModelName]!.fields;
					joinedModelSchema.id = { type: "string", unique: true };

					let isUnique = false;

					// Check forward join: joined model has FK to base model
					const forwardForeignKeyField = Object.entries(joinedModelSchema).find(
						([_, fieldAttributes]) =>
							fieldAttributes.references?.model === unsafe_model,
					)?.[0];

					if (forwardForeignKeyField) {
						const fieldDef =
							joinedModelSchema[
								getDefaultFieldName({
									field: forwardForeignKeyField,
									model: defaultModelName,
								})
							];
						isUnique = fieldDef?.unique === true;
					} else {
						// Check backward join: base model has FK to joined model
						const baseModelSchema = schema[unsafe_model]!.fields;
						const backwardForeignKeyField = Object.entries(
							baseModelSchema,
						).find(
							([_, fieldAttributes]) =>
								fieldAttributes.references?.model === defaultModelName,
						)?.[0];

						if (backwardForeignKeyField) {
							const fieldDef = baseModelSchema[backwardForeignKeyField];
							if (!fieldDef?.references) return;
							const baseModelFieldDef =
								schema[getDefaultModelName(fieldDef.references.model)]?.fields[
									fieldDef.references.field
								];
							isUnique = baseModelFieldDef?.unique === true;
						}
					}

					if (isUnique && !Array.isArray(joinedData)) {
						joinedData = [joinedData];
					}

					let td = [];

					if (!Array.isArray(joinedData)) {
						throw new BetterAuthError(
							`Joined data for model ${defaultModelName} is not an array`,
						);
					}

					for (const item of joinedData) {
						td.push(await transformSingleOutput(item, modelName, select));
					}

					// If unique, return single object; otherwise return array
					if (isUnique) {
						transformedData[defaultModelName] = td.length > 0 ? td[0] : null;
					} else {
						transformedData[defaultModelName] = td;
					}
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

				if (
					defaultFieldName === "id" ||
					fieldAttr!.references?.field === "id"
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

		const transformJoinClause = (
			baseModel: string,
			unsanitizedJoin: Join | undefined,
		): ResolvedJoin | undefined => {
			if (!unsanitizedJoin) return undefined;
			const transformedJoin: ResolvedJoin = {};
			for (const [model, join] of Object.entries(unsanitizedJoin)) {
				if (join !== true) continue; // for now only support "true" on joins, indicating a simple join
				const defaultModelName = getDefaultModelName(model);
				const defaultBaseModelName = getDefaultModelName(baseModel);

				// First, check if the joined model has FKs to the base model (forward join)
				let foreignKeys = Object.entries(
					schema[defaultModelName]!.fields,
				).filter(
					([field, fieldAttributes]) =>
						fieldAttributes.references?.model === defaultBaseModelName,
				);

				let isForwardJoin = true;

				// If no forward join found, check backwards: does the base model have FKs to the joined model?
				if (!foreignKeys.length) {
					foreignKeys = Object.entries(
						schema[defaultBaseModelName]!.fields,
					).filter(
						([field, fieldAttributes]) =>
							fieldAttributes.references?.model === defaultModelName,
					);
					isForwardJoin = false;
				}

				if (!foreignKeys.length) {
					throw new BetterAuthError(
						`No foreign key found for model ${model} and base model ${baseModel} while performing join operation.`,
					);
				} else if (foreignKeys.length > 1) {
					throw new BetterAuthError(
						`Multiple foreign keys found for model ${model} and base model ${baseModel} while performing join operation. Only one foreign key is supported.`,
					);
				}

				const [foreignKey, foreignKeyAttributes] = foreignKeys[0]!;
				if (!foreignKeyAttributes.references) {
					// this should never happen, as we filter for references in the foreign keys.
					// it's here for typescript to be happy.
					throw new BetterAuthError(
						`No references found for foreign key ${foreignKey} on model ${model} while performing join operation.`,
					);
				}

				let from: string;
				let to: string;

				if (isForwardJoin) {
					// joined model has FK to base model
					from = getFieldName({
						model: baseModel,
						field: foreignKeyAttributes.references.field,
					});

					to = getFieldName({
						model,
						field: foreignKey,
					});
				} else {
					// base model has FK to joined model
					from = getFieldName({
						model: baseModel,
						field: foreignKey,
					});

					to = getFieldName({
						model,
						field: foreignKeyAttributes.references.field,
					});
				}

				transformedJoin[getModelName(model)] = {
					on: {
						from,
						to,
					},
					type: "inner", // for now only support inner joins
				};
			}
			return transformedJoin;
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
						if (
							typeof config.debugLogs === "object" &&
							"isRunningAdapterTests" in config.debugLogs &&
							config.debugLogs.isRunningAdapterTests
						) {
							// hide warning in adapter tests
						} else {
							logger.warn(
								`[${config.adapterName}] - Transactions are not supported. Executing operations sequentially.`,
							);
						}
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
				join: unsafeJoin,
			}: {
				model: string;
				where: Where[];
				select?: string[];
				join?: Join;
			}) => {
				transactionId++;
				let thisTransactionId = transactionId;
				const model = getModelName(unsafeModel);
				const where = transformWhereClause({
					model: unsafeModel,
					where: unsafeWhere,
				});
				unsafeModel = getDefaultModelName(unsafeModel);
				let join: ResolvedJoin | undefined;
				if (!config.disableTransformJoin) {
					join = transformJoinClause(unsafeModel, unsafeJoin);
				} else {
					// assume it's already transformed if transformation is disabled
					join = unsafeJoin as never as ResolvedJoin;
				}
				debugLog(
					{ method: "findOne" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(1, 3)}`,
					`${formatMethod("findOne")}:`,
					{ model, where, select, join },
				);
				const res = await adapterInstance.findOne<T>({
					model,
					where,
					select,
					join,
				});
				debugLog(
					{ method: "findOne" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(2, 3)}`,
					`${formatMethod("findOne")} ${formatAction("DB Result")}:`,
					{ model, data: res },
				);
				let transformed = res as any;
				if (!config.disableTransformOutput) {
					transformed = await transformOutput(
						res as any,
						unsafeModel,
						select,
						join,
					);
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
				join: unsafeJoin,
			}: {
				model: string;
				where?: Where[];
				limit?: number;
				sortBy?: { field: string; direction: "asc" | "desc" };
				offset?: number;
				join?: Join;
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
				let join: ResolvedJoin | undefined;
				if (!config.disableTransformJoin) {
					join = transformJoinClause(unsafeModel, unsafeJoin);
				} else {
					// assume it's already transformed if transformation is disabled
					join = unsafeJoin as never as ResolvedJoin;
				}
				debugLog(
					{ method: "findMany" },
					`${formatTransactionId(thisTransactionId)} ${formatStep(1, 3)}`,
					`${formatMethod("findMany")}:`,
					{ model, where, limit, sortBy, offset, join },
				);
				const res = await adapterInstance.findMany<T>({
					model,
					where,
					limit: limit,
					sortBy,
					offset,
					join,
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
						res.map(
							async (r) =>
								await transformOutput(r, unsafeModel, undefined, join),
						),
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
