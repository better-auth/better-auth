import type { BetterAuthOptions } from "../types";
import type { BetterAuthDBSchema, DBFieldAttribute } from "./type";

export const getAuthTables = (
	options: BetterAuthOptions,
): BetterAuthDBSchema => {
	const pluginSchema = (options.plugins ?? []).reduce(
		(acc, plugin) => {
			const schema = plugin.schema;
			if (!schema) return acc;
			for (const [key, value] of Object.entries(schema)) {
				acc[key] = {
					fields: {
						...acc[key]?.fields,
						...value.fields,
					},
					modelName: value.modelName || key,
				};
			}
			return acc;
		},
		{} as Record<
			string,
			{ fields: Record<string, DBFieldAttribute>; modelName: string }
		>,
	);

	const shouldAddRateLimitTable = options.rateLimit?.storage === "database";
	const rateLimitTable = {
		rateLimit: {
			modelName: options.rateLimit?.modelName || "rateLimit",
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
					bigint: true,
					fieldName: options.rateLimit?.fields?.lastRequest || "lastRequest",
				},
			},
		},
	} satisfies BetterAuthDBSchema;

	const { user, session, account, ...pluginTables } = pluginSchema;

	const sessionTable = {
		session: {
			modelName: options.session?.modelName || "session",
			fields: {
				expiresAt: {
					type: "date",
					required: true,
					fieldName: options.session?.fields?.expiresAt || "expiresAt",
				},
				token: {
					type: "string",
					required: true,
					fieldName: options.session?.fields?.token || "token",
					unique: true,
				},
				createdAt: {
					type: "date",
					required: true,
					fieldName: options.session?.fields?.createdAt || "createdAt",
					defaultValue: () => new Date(),
				},
				updatedAt: {
					type: "date",
					required: true,
					fieldName: options.session?.fields?.updatedAt || "updatedAt",
					onUpdate: () => new Date(),
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
					index: true,
				},
				...session?.fields,
				...options.session?.additionalFields,
			},
			order: 2,
		},
	} satisfies BetterAuthDBSchema;

	return {
		user: {
			modelName: options.user?.modelName || "user",
			fields: {
				name: {
					type: "string",
					required: true,
					fieldName: options.user?.fields?.name || "name",
					sortable: true,
				},
				email: {
					type: "string",
					unique: true,
					required: true,
					fieldName: options.user?.fields?.email || "email",
					sortable: true,
				},
				emailVerified: {
					type: "boolean",
					defaultValue: false,
					required: true,
					fieldName: options.user?.fields?.emailVerified || "emailVerified",
					input: false,
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
					onUpdate: () => new Date(),
					required: true,
					fieldName: options.user?.fields?.updatedAt || "updatedAt",
				},
				...user?.fields,
				...options.user?.additionalFields,
			},
			order: 1,
		},
		//only add session table if it's not stored in secondary storage
		...(!options.secondaryStorage || options.session?.storeSessionInDatabase
			? sessionTable
			: {}),
		account: {
			modelName: options.account?.modelName || "account",
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
					index: true,
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
				accessTokenExpiresAt: {
					type: "date",
					required: false,
					fieldName:
						options.account?.fields?.accessTokenExpiresAt ||
						"accessTokenExpiresAt",
				},
				refreshTokenExpiresAt: {
					type: "date",
					required: false,
					fieldName:
						options.account?.fields?.refreshTokenExpiresAt ||
						"refreshTokenExpiresAt",
				},
				scope: {
					type: "string",
					required: false,
					fieldName: options.account?.fields?.scope || "scope",
				},
				password: {
					type: "string",
					required: false,
					fieldName: options.account?.fields?.password || "password",
				},
				createdAt: {
					type: "date",
					required: true,
					fieldName: options.account?.fields?.createdAt || "createdAt",
					defaultValue: () => new Date(),
				},
				updatedAt: {
					type: "date",
					required: true,
					fieldName: options.account?.fields?.updatedAt || "updatedAt",
					onUpdate: () => new Date(),
				},
				...account?.fields,
				...options.account?.additionalFields,
			},
			order: 3,
		},
		verification: {
			modelName: options.verification?.modelName || "verification",
			fields: {
				identifier: {
					type: "string",
					required: true,
					fieldName: options.verification?.fields?.identifier || "identifier",
					index: true,
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
				createdAt: {
					type: "date",
					required: true,
					defaultValue: () => new Date(),
					fieldName: options.verification?.fields?.createdAt || "createdAt",
				},
				updatedAt: {
					type: "date",
					required: true,
					defaultValue: () => new Date(),
					onUpdate: () => new Date(),
					fieldName: options.verification?.fields?.updatedAt || "updatedAt",
				},
			},
			order: 4,
		},
		...pluginTables,
		...(shouldAddRateLimitTable ? rateLimitTable : {}),
	} satisfies BetterAuthDBSchema;
};
