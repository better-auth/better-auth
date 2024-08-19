import { FieldAttribute } from "../db";
import { BetterAuthOptions } from "../types";

export const getAuthTables = (options: BetterAuthOptions) => {
	const pluginSchema = options.plugins?.reduce((acc, plugin) => {
		const schema = plugin.schema;
		return {
			...acc,
			...schema,
		};
	}, {});
	const providerSchema = options.providers?.reduce((acc, provider) => {
		const schema = provider.schema;
		return {
			...acc,
			...schema,
		};
	}, {});
	return {
		...providerSchema,
		...pluginSchema,
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
			},
		},
		session: {
			tableName: options.session?.modelName || "session",
			fields: {
				userId: {
					type: "string",
					references: {
						model: "user",
						field: "id",
						onDelete: "cascade",
					},
				},
				expiresAt: {
					type: "date",
				},
			},
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
			},
		},
	} satisfies Record<
		string,
		{
			tableName: string;
			fields: Record<string, FieldAttribute>;
			disableMigrations?: boolean;
		}
	>;
};
