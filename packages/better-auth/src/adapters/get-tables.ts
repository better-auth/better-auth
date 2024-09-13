import type { FieldAttribute } from "../db";
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

export const getAuthTables = (options: BetterAuthOptions) => {
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

	return {
		user: {
			tableName: options.user?.modelName || "user",
			fields: {
				name: {
					type: "string",
				},
				email: {
					type: "string",
				},
				emailVerified: {
					type: "boolean",
					defaultValue: () => false,
				},
				image: {
					type: "string",
					required: false,
				},
				createdAt: {
					type: "date",
					defaultValue: () => new Date(),
				},
				updatedAt: {
					type: "date",
					defaultValue: () => new Date(),
				},
				...pluginSchema?.user?.fields,
			},
			order: 0,
		},
		session: {
			tableName: options.session?.modelName || "session",
			fields: {
				expiresAt: {
					type: "date",
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
						model: "user",
						field: "id",
						onDelete: "cascade",
					},
				},
				...pluginSchema?.session?.fields,
			},
			order: 1,
		},
		account: {
			tableName: options.account?.modelName || "account",
			fields: {
				accountId: {
					type: "string",
				},
				providerId: {
					type: "string",
				},
				userId: {
					type: "string",
					references: {
						model: "user",
						field: "id",
						onDelete: "cascade",
					},
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
				accessTokenExpiresAt: {
					type: "date",
					required: false,
				},
				refreshTokenExpiresAt: {
					type: "date",
					required: false,
				},
				password: {
					type: "string",
					required: false,
				},
				...pluginSchema?.account?.fields,
			},
			order: 2,
		},
		...pluginSchema,
	} satisfies BetterAuthDbSchema;
};
