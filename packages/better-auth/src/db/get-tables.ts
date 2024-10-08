import type { FieldAttribute } from ".";
import type { BetterAuthOptions } from "../types";

export type BetterAuthDbSchema = Record<
	string,
	{
		tableName: string;
		fields: Record<string, FieldAttribute>;
		disableMigrations?: boolean;
		order?: number;
	}
>;

export const getAuthTables = (
	options: BetterAuthOptions,
): BetterAuthDbSchema => {
	const pluginSchema = options.plugins?.reduce(
		(acc, plugin) => {
			const schema = plugin.schema;
			if (!schema) return acc;
			for (const [key, value] of Object.entries(schema)) {
				acc[key] = {
					fields: {
						...acc[key]?.fields,
						...value.fields,
					},
					tableName: key,
				};
			}
			return acc;
		},
		{} as Record<
			string,
			{ fields: Record<string, FieldAttribute>; tableName: string }
		>,
	);

	const shouldAddRateLimitTable = options.rateLimit?.storage === "database";
	const rateLimitTable = {
		rateLimit: {
			tableName: options.rateLimit?.tableName || "rateLimit",
			fields: {
				key: {
					type: "string",
				},
				count: {
					type: "number",
				},
				lastRequest: {
					type: "number",
				},
			},
		},
	} satisfies BetterAuthDbSchema;

	const { user, session, account, ...pluginTables } = pluginSchema || {};
	const accountFields = options.account?.fields;
	const userFields = options.user?.fields;
	return {
		user: {
			tableName: options.user?.modelName || "user",
			fields: {
				[userFields?.name || "name"]: {
					type: "string",
					required: true,
				},
				email: {
					type: "string",
					unique: true,
					required: true,
				},
				emailVerified: {
					type: "boolean",
					defaultValue: () => false,
					required: true,
				},
				image: {
					type: "string",
					required: false,
				},
				createdAt: {
					type: "date",
					defaultValue: () => new Date(),
					required: true,
				},
				updatedAt: {
					type: "date",
					defaultValue: () => new Date(),
					required: true,
				},
				deletedAt: {
					type: "date",
					defaultValue: undefined,
					required: false,
				},
				...user?.fields,
			},
			order: 0,
		},
		session: {
			tableName: options.session?.modelName || "session",
			fields: {
				expiresAt: {
					type: "date",
					required: true,
				},
				ipAddress: {
					type: "string",
					required: false,
				},
				userAgent: {
					type: "string",
					required: false,
				},
				userId: {
					type: "string",
					references: {
						model: options.user?.modelName || "user",
						field: "id",
						onDelete: "cascade",
					},
					required: true,
				},
				...session?.fields,
			},
			order: 1,
		},
		account: {
			tableName: options.account?.modelName || "account",
			fields: {
				[accountFields?.accountId || "accountId"]: {
					type: "string",
					required: true,
				},
				providerId: {
					type: "string",
					required: true,
				},
				userId: {
					type: "string",
					references: {
						model: options.user?.modelName || "user",
						field: "id",
						onDelete: "cascade",
					},
					required: true,
				},
				accessToken: {
					type: "string",
					required: false,
				},
				refreshToken: {
					type: "string",
					required: false,
				},
				idToken: {
					type: "string",
					required: false,
				},
				expiresAt: {
					type: "date",
					required: false,
				},
				password: {
					type: "string",
					required: false,
				},
				...account?.fields,
			},
			order: 2,
		},
		verification: {
			tableName: options.verification?.modelName || "verification",
			fields: {
				identifier: {
					type: "string",
					required: true,
				},
				value: {
					type: "string",
					required: true,
				},
				expiresAt: {
					type: "date",
					required: true,
				},
			},
		},
		...pluginTables,
		...(shouldAddRateLimitTable ? rateLimitTable : {}),
	} satisfies BetterAuthDbSchema;
};
