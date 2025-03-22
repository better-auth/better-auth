import { withApplyDefault } from "../adapters/utils";
import { getAuthTables } from "../db/get-tables";
import type { Adapter, BetterAuthOptions, Where } from "../types";
import { generateId as defaultGenerateId, logger } from "../utils";
import { safeJSONParse } from "../utils/json";
import type { AdapterConfig, CreateCustomAdapter } from "./types";

export const createAdapter =
	({
		adapter,
		config,
	}: {
		config: AdapterConfig;
		adapter: CreateCustomAdapter;
	}) =>
	(options: BetterAuthOptions): Adapter => {
		// End-user's Better-Auth instance's schema
		const schema = getAuthTables(options);

		function getField(model: string, field: string) {
			// Plugin `schema`s can't define their own `id`. Better-auth auto provides `id` to every schema model.
			// Given this, we can't just check if the `model` (that being `id`) is within the schema's fields, since it is never defined.
			// So we check if the `field` is `id` and if so, we return `id` itself. Otherwise, we return the `field` from the schema.
			if (field === "id") {
				return field;
			}
			let f = schema[model]?.fields[field];
			if (!f) {
				//@ts-expect-error - The model name can be a sanitized, thus using the custom model name, not one of the default ones.
				f = Object.values(schema).find((f) => f.modelName === model)!;
			}
			return f.fieldName || field;
		}

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
			if (config.debugLogs) {
				logger.info(`[${config.adapterName}]`, ...args);
			}
		};

		const adapterInstance = adapter({
			options,
			schema,
			debugLog,
			getField,
		});

		const transformInput = async (
			data: Record<string, any>,
			unsafe_model: string,
			action: "create" | "update",
		) => {
			const transformedData: Record<string, any> = {};
			const fields = schema[unsafe_model].fields;
			fields.id = {
				type: "string",
			};
			for (const field in fields) {
				const value = data[field];
				const fieldAttributes = fields[field];

				if (
					value === undefined &&
					!fieldAttributes.defaultValue &&
					!fieldAttributes.transform?.input
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

				if (config.customTransformInput) {
					newValue = config.customTransformInput({
						data: newValue,
						action,
						field,
						fields: fieldAttributes,
					});
				} else {
					if (
						config.supportsJSON === false &&
						typeof newValue === "object" &&
						//@ts-expect-error -Future proofing
						fieldAttributes.type === "json"
					) {
						newValue = JSON.stringify(newValue);
					}

					if (config.supportsDates === false && newValue instanceof Date) {
						newValue = value.toISOString();
					}

					if (
						config.supportsBooleans === false &&
						typeof newValue === "boolean"
					) {
						newValue = newValue ? 1 : 0;
					}
				}
				transformedData[fields[field].fieldName || field] = newValue;
			}
			return transformedData;
		};

		const transformOutput = async (
			data: Record<string, any> | null,
			unsafe_model: string,
			select: string[] = [],
		) => {
			if (!data) return null;
			const transformedData: Record<string, any> =
				data.id || data._id
					? select.length === 0 || select.includes("id")
						? {
								id: data.id,
							}
						: {}
					: {};
			const tableSchema = schema[unsafe_model].fields;
			tableSchema.id = {
				type: "string",
			};
			for (const key in tableSchema) {
				if (select.length && !select.includes(key)) {
					continue;
				}
				const field = tableSchema[key];
				if (field) {
					let newValue = data[field.fieldName || key];

					if (field.transform?.output) {
						newValue = await field.transform.output(newValue);
					}

					if (config.customTransformOutput) {
						newValue = config.customTransformOutput({
							data: newValue,
							field: key,
							fields: field,
							select,
						});
					} else {
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
					}
					transformedData[key] = newValue;
				}
			}
			return transformedData as any;
		};

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
				const model = getModelName(unsafeModel);
				if (options.advanced?.generateId) {
					//@ts-ignore
					unsafeData.id = options.advanced.generateId({ model });
				} else if (
					!("id" in unsafeData) &&
					options.advanced?.generateId !== false
				) {
					//@ts-ignore
					unsafeData.id = defaultGenerateId();
				}
				const data = (await transformInput(
					unsafeData,
					unsafeModel,
					"create",
				)) as T;
				debugLog("Create:", model, data);
				const res = await adapterInstance.create<T>({ data, model });
				debugLog("Create Result:", model, res);
				return await transformOutput(res, unsafeModel, select);
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
				const model = getModelName(unsafeModel);
				const data = (await transformInput(
					unsafeData,
					unsafeModel,
					"update",
				)) as T;
				debugLog("Update:", model, data);
				const res = await adapterInstance.update<T>({
					model,
					where,
					update: data,
				});
				debugLog("Update Result:", model, res);
				return await transformOutput(res as any, unsafeModel);
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
				const model = getModelName(unsafeModel);
				const data = await transformInput(unsafeData, unsafeModel, "update");
				debugLog("UpdateMany:", model, data);
				const res = await adapterInstance.updateMany({
					model,
					where,
					update: data,
				});
				debugLog("UpdateMany Result:", model, res);
				return await transformOutput(res as any, unsafeModel);
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
				const model = getModelName(unsafeModel);
				debugLog("FindOne:", model, where, select);
				const res = await adapterInstance.findOne<T>({
					model,
					where,
					select,
				});
				debugLog("FindOne Result:", model, res);
				return await transformOutput(res as any, unsafeModel, select);
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
				const model = getModelName(unsafeModel);
				debugLog("FindMany:", model, where, limit, sortBy, offset);
				const res = await adapterInstance.findMany<T>({
					model,
					where,
					limit,
					sortBy,
					offset,
				});
				debugLog("FindMany Result:", model, res);
				return await Promise.all(
					res.map(async (r) => await transformOutput(r as any, unsafeModel)),
				);
			},
			delete: async ({
				model: unsafeModel,
				where,
			}: {
				model: string;
				where: Where[];
			}) => {
				const model = getModelName(unsafeModel);
				debugLog("Delete:", model, where);
				await adapterInstance.delete({
					model,
					where,
				});
				debugLog("Delete Result:", model);
			},
			deleteMany: async ({
				model: unsafeModel,
				where,
			}: {
				model: string;
				where: Where[];
			}) => {
				const model = getModelName(unsafeModel);
				debugLog("DeleteMany:", model, where);
				const res = await adapterInstance.deleteMany({
					model,
					where,
				});
				debugLog("DeleteMany Result:", model, res);
				return res;
			},
			count: async ({
				model: unsafeModel,
				where,
			}: {
				model: string;
				where?: Where[];
			}) => {
				const model = getModelName(unsafeModel);
				debugLog("Count:", model, where);
				const res = await adapterInstance.count({
					model,
					where,
				});
				debugLog("Count Result:", model, res);
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
