import type { BetterAuthOptions } from "@better-auth/core";
import type {
	BetterAuthPluginDBSchema,
	DBFieldAttribute,
} from "@better-auth/core/db";
import { getAuthTables } from "@better-auth/core/db";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import type { Account, Session, User } from "../types";

// Cache for parsed schemas to avoid reparsing on every request
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

function getFields(
	options: BetterAuthOptions,
	table: string,
	mode: "input" | "output",
) {
	const cacheKey = `${table}:${mode}`;
	if (!cache.has(options)) {
		cache.set(options, new Map());
	}
	const tableCache = cache.get(options)!;
	if (tableCache.has(cacheKey)) {
		return tableCache.get(cacheKey)!;
	}
	const coreSchema =
		mode === "output" ? (getAuthTables(options)[table]?.fields ?? {}) : {};
	const additionalFields =
		table === "user" || table === "session" || table === "account"
			? options[table]?.additionalFields
			: undefined;
	let schema: Record<string, DBFieldAttribute> = {
		...coreSchema,
		...(additionalFields ?? {}),
	};
	for (const plugin of options.plugins || []) {
		if (plugin.schema && plugin.schema[table]) {
			schema = {
				...schema,
				...plugin.schema[table].fields,
			};
		}
	}
	tableCache.set(cacheKey, schema);
	return schema;
}

export function parseUserOutput<T extends User>(
	options: BetterAuthOptions,
	user: T,
) {
	const schema = getFields(options, "user", "output");
	return parseOutputData(user, { fields: schema });
}

export function parseSessionOutput<T extends Session>(
	options: BetterAuthOptions,
	session: T,
) {
	const schema = getFields(options, "session", "output");
	return parseOutputData(session, { fields: schema });
}

export function parseAccountOutput<T extends Account>(
	options: BetterAuthOptions,
	account: T,
) {
	const schema = getFields(options, "account", "output");
	const parsed = parseOutputData(account, { fields: schema });
	// destructuring for type inference
	// runtime filtering is already done by `parseOutputData`
	const {
		accessToken,
		refreshToken,
		idToken,
		accessTokenExpiresAt,
		refreshTokenExpiresAt,
		password,
		...rest
	} = parsed;
	return rest;
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
						parsedData[key] = fields[key]!.defaultValue;
						continue;
					}
				}
				if (data[key]) {
					throw APIError.from("BAD_REQUEST", {
						...BASE_ERROR_CODES.FIELD_NOT_ALLOWED,
						message: `${key} is not allowed to be set`,
					});
				}
				continue;
			}
			if (fields[key]!.validator?.input && data[key] !== undefined) {
				const result = fields[key]!.validator.input["~standard"].validate(
					data[key],
				);
				if (result instanceof Promise) {
					throw APIError.from(
						"INTERNAL_SERVER_ERROR",
						BASE_ERROR_CODES.ASYNC_VALIDATION_NOT_SUPPORTED,
					);
				}
				if ("issues" in result && result.issues) {
					throw APIError.from("BAD_REQUEST", {
						...BASE_ERROR_CODES.VALIDATION_ERROR,
						message: result.issues[0]?.message || "Validation Error",
					});
				}
				parsedData[key] = result.value;
				continue;
			}
			if (fields[key]!.transform?.input && data[key] !== undefined) {
				parsedData[key] = fields[key]!.transform?.input(data[key]);
				continue;
			}
			parsedData[key] = data[key];
			continue;
		}

		if (fields[key]!.defaultValue !== undefined && action === "create") {
			if (typeof fields[key]!.defaultValue === "function") {
				parsedData[key] = fields[key]!.defaultValue();
				continue;
			}
			parsedData[key] = fields[key]!.defaultValue;
			continue;
		}

		if (fields[key]!.required && action === "create") {
			throw APIError.from("BAD_REQUEST", {
				...BASE_ERROR_CODES.MISSING_FIELD,
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
	const schema = getFields(options, "user", "input");
	return parseInputData(user, { fields: schema, action });
}

export function parseAdditionalUserInput(
	options: BetterAuthOptions,
	user?: Record<string, any> | undefined,
) {
	const schema = getFields(options, "user", "input");
	return parseInputData(user || {}, { fields: schema });
}

export function parseAccountInput(
	options: BetterAuthOptions,
	account: Partial<Account>,
) {
	const schema = getFields(options, "account", "input");
	return parseInputData(account, { fields: schema });
}

export function parseSessionInput(
	options: BetterAuthOptions,
	session: Partial<Session>,
) {
	const schema = getFields(options, "session", "input");
	return parseInputData(session, { fields: schema });
}

export function mergeSchema<S extends BetterAuthPluginDBSchema>(
	schema: S,
	newSchema?:
		| {
				[K in keyof S]?:
					| {
							modelName?: string | undefined;
							fields?:
								| {
										[P: string]: string;
								  }
								| undefined;
					  }
					| undefined;
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
