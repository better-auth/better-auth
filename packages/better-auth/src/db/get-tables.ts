import type { FieldAttribute } from ".";
import type { BetterAuthOptions } from "../types";

export type BetterAuthDbSchema = Record<
	string,
	{
		/**
		 * The name of the table in the database
		 */
		tableName: string;
		/**
		 * The fields of the table
		 */
		fields: Record<string, FieldAttribute>;
		/**
		 * Whether to disable migrations for this table
		 * @default false
		 */
		disableMigrations?: boolean;
		/**
		 * The order of the table
		 */
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
					tableName: value.tableName || key,
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
					fieldName: options.rateLimit?.fields?.key || "key",
				},
				count: {
					type: "number",
					fieldName: options.rateLimit?.fields?.count || "count",
				},
				lastRequest: {
					type: "number",
					fieldName: options.rateLimit?.fields?.lastRequest || "lastRequest",
				},
			},
		},
	} satisfies BetterAuthDbSchema;

	const { user, session, account, ...pluginTables } = pluginSchema || {};
	return {
		user: {
			tableName: options.user?.modelName || "user",
			fields: {
				name: {
					type: "string",
					required: true,
					fieldName: options.user?.fields?.name || "name",
				},
				email: {
					type: "string",
					unique: true,
					required: true,
					fieldName: options.user?.fields?.email || "email",
				},
				emailVerified: {
					type: "boolean",
					defaultValue: () => false,
					required: true,
					fieldName: options.user?.fields?.emailVerified || "emailVerified",
				},
				image: {
					type: "string",
					required: false,
					fieldName: options.user?.fields?.image || "image",
				},
				createdAt: {
					type: "date",
					defaultValue: () => new Date(),
					required: true,
					fieldName: options.user?.fields?.createdAt || "createdAt",
				},
				updatedAt: {
					type: "date",
					defaultValue: () => new Date(),
					required: true,
					fieldName: options.user?.fields?.updatedAt || "updatedAt",
				},
				...user?.fields,
				...options.user?.additionalFields,
			},
			order: 1,
		},
		session: {
			tableName: options.session?.modelName || "session",
			fields: {
				expiresAt: {
					type: "date",
					required: true,
					fieldName: options.session?.fields?.expiresAt || "expiresAt",
				},
				ipAddress: {
					type: "string",
					required: false,
					fieldName: options.session?.fields?.ipAddress || "ipAddress",
				},
				userAgent: {
					type: "string",
					required: false,
					fieldName: options.session?.fields?.userAgent || "userAgent",
				},
				userId: {
					type: "string",
					fieldName: options.session?.fields?.userId || "userId",
					references: {
						model: options.user?.modelName || "user",
						field: "id",
						onDelete: "cascade",
					},
					required: true,
				},
				...session?.fields,
				...options.session?.additionalFields,
			},
			order: 2,
		},
		account: {
			tableName: options.account?.modelName || "account",
			fields: {
				accountId: {
					type: "string",
					required: true,
					fieldName: options.account?.fields?.accountId || "accountId",
				},
				providerId: {
					type: "string",
					required: true,
					fieldName: options.account?.fields?.providerId || "providerId",
				},
				userId: {
					type: "string",
					references: {
						model: options.user?.modelName || "user",
						field: "id",
						onDelete: "cascade",
					},
					required: true,
					fieldName: options.account?.fields?.userId || "userId",
				},
				accessToken: {
					type: "string",
					required: false,
					fieldName: options.account?.fields?.accessToken || "accessToken",
				},
				refreshToken: {
					type: "string",
					required: false,
					fieldName: options.account?.fields?.refreshToken || "refreshToken",
				},
				idToken: {
					type: "string",
					required: false,
					fieldName: options.account?.fields?.idToken || "idToken",
				},
				expiresAt: {
					type: "date",
					required: false,
					fieldName: options.account?.fields?.expiresAt || "expiresAt",
				},
				password: {
					type: "string",
					required: false,
					fieldName: options.account?.fields?.password || "password",
				},
				...account?.fields,
			},
			order: 3,
		},
		verification: {
			tableName: options.verification?.modelName || "verification",
			fields: {
				identifier: {
					type: "string",
					required: true,
					fieldName: options.verification?.fields?.identifier || "identifier",
				},
				value: {
					type: "string",
					required: true,
					fieldName: options.verification?.fields?.value || "value",
				},
				expiresAt: {
					type: "date",
					required: true,
					fieldName: options.verification?.fields?.expiresAt || "expiresAt",
				},
			},
			order: 4,
		},
		...pluginTables,
		...(shouldAddRateLimitTable ? rateLimitTable : {}),
	} satisfies BetterAuthDbSchema;
};
