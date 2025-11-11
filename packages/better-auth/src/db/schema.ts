import type { BetterAuthOptions } from "@better-auth/core";
import type {
	BetterAuthPluginDBSchema,
	DBFieldAttribute,
} from "@better-auth/core/db";
import { APIError } from "better-call";
import { z } from "zod";
import type { Account, Session, User } from "../types";
import { fromZodSchema, isZodObject, isZodType } from "./from-zod";

const cache = new WeakMap<
	BetterAuthOptions,
	Map<string, Record<string, DBFieldAttribute>>
>();

function parseOutputData<T extends Record<string, any>>(
	data: T,
	schema: {
		fields: Record<string, DBFieldAttribute>;
	},
) {
	const fields = schema.fields;
	const parsedData: Record<string, any> = {};
	for (const key in data) {
		const field = fields[key];
		if (!field) {
			parsedData[key] = data[key];
			continue;
		}
		if (field.returned === false) {
			continue;
		}
		parsedData[key] = data[key];
	}
	return parsedData as T;
}

function getAllFields(options: BetterAuthOptions, table: string) {
	if (!cache.has(options)) {
		cache.set(options, new Map());
	}
	const tableCache = cache.get(options)!;
	if (tableCache.has(table)) {
		return tableCache.get(table)!;
	}

	let schema: Record<string, DBFieldAttribute> = {};

	const tableConfig = options[table as "user" | "session" | "account"];
	if (tableConfig?.additionalFields) {
		if (isZodObject(tableConfig.additionalFields)) {
			schema = fromZodSchema(tableConfig.additionalFields);
		} else {
			schema = tableConfig.additionalFields as Record<string, DBFieldAttribute>;
		}
	}
	for (const plugin of options.plugins || []) {
		if (plugin.schema && plugin.schema[table]) {
			schema = {
				...schema,
				...plugin.schema[table].fields,
			};
		}
	}
	cache.get(options)!.set(table, schema);
	return schema;
}

export function parseUserOutput(options: BetterAuthOptions, user: User) {
	const schema = getAllFields(options, "user");
	return parseOutputData(user, { fields: schema });
}

export function parseAccountOutput(
	options: BetterAuthOptions,
	account: Account,
) {
	const schema = getAllFields(options, "account");
	return parseOutputData(account, { fields: schema });
}

export function parseSessionOutput(
	options: BetterAuthOptions,
	session: Session,
) {
	const schema = getAllFields(options, "session");
	return parseOutputData(session, { fields: schema });
}

export function parseInputData<T extends Record<string, any>>(
	data: T,
	schema: {
		fields: Record<string, DBFieldAttribute>;
		action?: ("create" | "update") | undefined;
	},
) {
	const action = schema.action || "create";
	const fields = schema.fields;
	const parsedData: Record<string, any> = Object.assign(
		Object.create(null),
		null,
	);
	for (const key in fields) {
		if (key in data) {
			if (fields[key]!.input === false) {
				if (fields[key]!.defaultValue !== undefined) {
					if (action !== "update") {
						const dv = fields[key]!.defaultValue as unknown;
						parsedData[key] =
							typeof dv === "function" ? (dv as () => unknown)() : dv;
						continue;
					}
				}

				if (data[key]) {
					throw new APIError("BAD_REQUEST", {
						message: `${key} is not allowed to be set`,
					});
				}
				continue;
			}
			if (fields[key]!.validator?.input && data[key] !== undefined) {
				const validator = fields[key]!.validator!.input;

				if (isZodType(validator)) {
					const result = (validator as z.ZodTypeAny).safeParse(data[key]);
					if (!result.success) {
						throw new APIError("BAD_REQUEST", {
							message: `${key}: ${result.error.issues[0]?.message}`,
							zodIssues: result.error.issues,
						});
					}
					parsedData[key] = result.data;
					continue;
				}
				if (validator["~standard"]) {
					parsedData[key] = validator["~standard"].validate(data[key]);
					continue;
				} else {
					throw new APIError("BAD_REQUEST", {
						message: `${key}: Unsupported validator type`,
					});
				}
			}
			if (fields[key]!.transform?.input && data[key] !== undefined) {
				parsedData[key] = fields[key]!.transform?.input(data[key]);
				continue;
			}
			parsedData[key] = data[key];
			continue;
		}

		if (fields[key]!.defaultValue !== undefined && action === "create") {
			const dv = fields[key]!.defaultValue as unknown;
			parsedData[key] = typeof dv === "function" ? (dv as () => unknown)() : dv;
			continue;
		}

		if (fields[key]!.required && action === "create") {
			throw new APIError("BAD_REQUEST", {
				message: `${key} is required`,
			});
		}
	}
	return parsedData as Partial<T>;
}

export function parseUserInput(
	options: BetterAuthOptions,
	user: Record<string, any> = {},
	action: "create" | "update",
) {
	const schema = getAllFields(options, "user");
	return parseInputData(user, { fields: schema, action });
}

export function parseAdditionalUserInput(
	options: BetterAuthOptions,
	user?: Record<string, any> | undefined,
) {
	const schema = getAllFields(options, "user");
	return parseInputData(user || {}, { fields: schema });
}

export function parseAccountInput(
	options: BetterAuthOptions,
	account: Partial<Account>,
) {
	const schema = getAllFields(options, "account");
	return parseInputData(account, { fields: schema });
}

export function parseSessionInput(
	options: BetterAuthOptions,
	session: Partial<Session>,
) {
	const schema = getAllFields(options, "session");
	return parseInputData(session, { fields: schema });
}

export function mergeSchema<S extends BetterAuthPluginDBSchema>(
	schema: S,
	newSchema?:
		| {
				[K in keyof S]?: {
					modelName?: string;
					fields?: {
						[P: string]: string;
					};
				};
		  }
		| undefined,
) {
	if (!newSchema) {
		return schema;
	}
	for (const table in newSchema) {
		const newModelName = newSchema[table]?.modelName;
		if (newModelName) {
			schema[table]!.modelName = newModelName;
		}
		for (const field in schema[table]!.fields) {
			const newField = newSchema[table]?.fields?.[field];
			if (!newField) {
				continue;
			}
			schema[table]!.fields[field]!.fieldName = newField;
		}
	}
	return schema;
}
