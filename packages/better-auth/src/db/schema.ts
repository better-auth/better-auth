import type { BetterAuthOptions } from "@better-auth/core";
import type {
	BetterAuthPluginDBSchema,
	DBFieldAttribute,
} from "@better-auth/core/db";
import { APIError } from "better-call";
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

function getAllFields(options: BetterAuthOptions, table: string) {
	if (!cache.has(options)) {
		cache.set(options, new Map());
	}
	const tableCache = cache.get(options)!;
	if (tableCache.has(table)) {
		return tableCache.get(table)!;
	}
	let schema: Record<string, DBFieldAttribute> = {
		...(table === "user" ? options.user?.additionalFields : {}),
		...(table === "session" ? options.session?.additionalFields : {}),
	};
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
	return {
		...parseOutputData(user, { fields: schema }),
		id: user.id,
	};
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
						parsedData[key] = fields[key]!.defaultValue;
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
				const result = fields[key]!.validator.input["~standard"].validate(
					data[key],
				);
				if (result instanceof Promise) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: "Async validation is not supported for additional fields",
					});
				}
				if ("issues" in result && result.issues) {
					throw new APIError("BAD_REQUEST", {
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
