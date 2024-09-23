import { z } from "zod";
import type { FieldAttribute } from "../db";
import type { BetterAuthOptions } from "../types";

export const accountSchema = z.object({
	id: z.string(),
	providerId: z.string(),
	accountId: z.string(),
	userId: z.string(),
	accessToken: z.string().nullable().optional(),
	refreshToken: z.string().nullable().optional(),
	idToken: z.string().nullable().optional(),
	/**
	 * Access token expires at
	 */
	expiresAt: z.date().nullable().optional(),
	/**
	 * Password is only stored in the credential provider
	 */
	password: z.string().optional().nullable(),
});

export const userSchema = z.object({
	id: z.string(),
	email: z.string().transform((val) => val.toLowerCase()),
	emailVerified: z.boolean().default(false),
	name: z.string(),
	image: z.string().optional(),
	createdAt: z.date().default(new Date()),
	updatedAt: z.date().default(new Date()),
});

export const sessionSchema = z.object({
	id: z.string(),
	userId: z.string(),
	expiresAt: z.date(),
	ipAddress: z.string().optional(),
	userAgent: z.string().optional(),
});

export type User = z.infer<typeof userSchema>;
export type Account = z.infer<typeof accountSchema>;
export type Session = z.infer<typeof sessionSchema>;
export interface MigrationTable {
	name: string;
	timestamp: string;
}

export function parseData<T extends Record<string, any>>(
	data: T,
	schema: {
		fields: Record<string, FieldAttribute>;
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

export function getAllFields(options: BetterAuthOptions, table: string) {
	let schema: Record<string, FieldAttribute> = {};
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

export function parseUser(options: BetterAuthOptions, user: User) {
	const schema = getAllFields(options, "user");
	return parseData(user, { fields: schema });
}

export function parseAccount(options: BetterAuthOptions, account: Account) {
	const schema = getAllFields(options, "account");
	return parseData(account, { fields: schema });
}

export function parseSession(options: BetterAuthOptions, session: Session) {
	const schema = getAllFields(options, "session");
	return parseData(session, { fields: schema });
}
