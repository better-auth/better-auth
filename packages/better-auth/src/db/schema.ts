import { field, type FieldAttributeFor } from ".";
import type { AuthPluginSchema } from "../types/plugins";
import type { BetterAuthOptions } from "../types/options";
import { APIError } from "better-call";
import type { SchemaTypes } from "../types";

type SCHEMA = typeof schema;

export const coreSchema = {
	id: field("string"),
	createdAt: field("date", { defaultValue: () => new Date() }),
	updatedAt: field("date", { defaultValue: () => new Date() }),
}

export const accountSchema = {
	fields: {
		providerId: field("string"),
		accountId: field("string"),
		userId: field("string"),
		accessToken: field("string", { required: false }),
		refreshToken: field("string", { required: false }),
		idToken: field("string", { required: false }),
		/**
		 * Access token expires at
		 */
		accessTokenExpiresAt: field("date", { required: false }),
		/**
		 * Refresh token expires at
		 */
		refreshTokenExpiresAt: field("date", { required: false }),
		/**
		 * The scopes that the user has authorized
		 */
		scope: field("string", { required: false }),
		/**
		 * Password is only stored in the credential provider
		 */
		password: field("string", { required: false }),


		...coreSchema
	},

	modelName: "account"
}

export const userSchema = {
	fields: {
		email: field("string", { transform: { input: (val) => val.toLowerCase() } }),
		emailVerified: field("boolean", { defaultValue: false }),
		name: field("string"),
		image: field("string", { required: false }),

		...coreSchema
	},
	modelName: "user"
}

export const sessionSchema = {
	fields: {
		userId: field("string"),
		expiresAt: field("date"),
		token: field("string"),
		ipAddress: field("string", { required: false }),
		userAgent: field("string", { required: false }),

		...coreSchema
	},
	modelName: "session"
}

export const verificationSchema = {
	fields: {
		value: field("string"),
		expiresAt: field("date"),
		identifier: field("string"),

		...coreSchema
	},
	modelName: "verification"
}

export const rateLimitSchema = {
	fields: {
		key: field("string"),
		count: field("number"),
		lastRequest: field("number", { bigint: true }),

		...coreSchema
	},
	modelName: "rateLimit"
}

export const schema = {
	account: accountSchema,
	user: userSchema,
	session: sessionSchema,
	verification: verificationSchema,
	ratelimit: rateLimitSchema
};

export function parseOutputData<S extends AuthPluginSchema, M extends keyof S & string> (
	data: SchemaTypes<S[M]>,
	schema: {
		fields: S[M]["fields"];
	},
) {
	const fields = schema.fields;
	// @ts-expect-error - It will be populated further on
	const parsedData: SchemaTypes<S[M]> = {};
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
	return parsedData;
}

export function getAllFields<S extends AuthPluginSchema, T extends keyof S>(options: BetterAuthOptions<S>, table: T): S[T]["fields"] {
	let schema: Record<string, FieldAttributeFor<any>> = {
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
	return schema;
}

export function parseUserOutput<S extends AuthPluginSchema<SCHEMA>>(options: BetterAuthOptions<S>, user: SchemaTypes<S["user"]>) {
	const schema = getAllFields(options, "user");
	return parseOutputData(user, { fields: schema });
}

export function parseAccountOutput<S extends AuthPluginSchema<SCHEMA>>(
	options: BetterAuthOptions<S>,
	account: SchemaTypes<S["account"]>,
) {
	const schema = getAllFields(options, "account");
	return parseOutputData(account, { fields: schema });
}

export function parseSessionOutput<S extends AuthPluginSchema<SCHEMA>>(
	options: BetterAuthOptions<S>,
	session: SchemaTypes<S["session"]>,
) {
	const schema = getAllFields(options, "session");
	return parseOutputData(session, { fields: schema });
}

export function parseInputData<T extends Record<string, any>>(
	data: T,
	schema: {
		fields: Record<string, FieldAttributeFor<any>>;
		action?: "create" | "update";
	},
) {
	const action = schema.action || "create";
	const fields = schema.fields;
	const parsedData: Record<string, any> = {};
	for (const key in fields) {
		if (key in data) {
			if (fields[key].input === false) {
				if (fields[key].defaultValue) {
					parsedData[key] = fields[key].defaultValue;
					continue;
				}
				continue;
			}
			if (fields[key].validator?.input && data[key] !== undefined) {
				parsedData[key] = fields[key].validator.input?.parse(data[key]);
				continue;
			}
			if (fields[key].transform?.input && data[key] !== undefined) {
				parsedData[key] = fields[key].transform?.input(data[key]);
				continue;
			}
			parsedData[key] = data[key];
			continue;
		}

		if (fields[key].defaultValue && action === "create") {
			parsedData[key] = fields[key].defaultValue;
			continue;
		}

		if (fields[key].required && action === "create") {
			throw new APIError("BAD_REQUEST", {
				message: `${key} is required`,
			});
		}
	}
	return parsedData as Partial<T>;
}

export function parseUserInput<S extends AuthPluginSchema<SCHEMA>>(
	options: BetterAuthOptions<S>,
	user?: Partial<SchemaTypes<S["user"]>>,
	action?: "create" | "update",
) {
	const schema = getAllFields(options, "user");
	return parseInputData(user || {}, { fields: schema, action });
}

export function parseAdditionalUserInput<S extends AuthPluginSchema>(
	options: BetterAuthOptions<S>,
	user?: Record<string, any>,
) {
	const schema = getAllFields(options, "user");
	return parseInputData(user || {}, { fields: schema });
}

export function parseAccountInput<S extends AuthPluginSchema<SCHEMA>>(
	options: BetterAuthOptions<S>,
	account: Partial<SchemaTypes<S["account"]>>,
) {
	const schema = getAllFields(options, "account");
	return parseInputData(account, { fields: schema });
}

export function parseSessionInput<S extends AuthPluginSchema<SCHEMA>>(
	options: BetterAuthOptions<S>,
	session: Partial<SchemaTypes<S["session"]>>,
) {
	const schema = getAllFields(options, "session");
	return parseInputData(session, { fields: schema });
}

export function mergeSchema<S extends AuthPluginSchema>(
	schema: S,
	newSchema?: {
		[K in keyof S]?: {
			modelName?: string;
			fields?: {
				[P: string]: string;
			};
		};
	},
) {
	if (!newSchema) {
		return schema;
	}
	for (const table in newSchema) {
		const newModelName = newSchema[table]?.modelName;
		if (newModelName) {
			schema[table].modelName = newModelName;
		}
		for (const field in schema[table].fields) {
			const newField = newSchema[table]?.fields?.[field];
			if (!newField) {
				continue;
			}
			schema[table].fields[field].fieldName = newField;
		}
	}
	return schema;
}
