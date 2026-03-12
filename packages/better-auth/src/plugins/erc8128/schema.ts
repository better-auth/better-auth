import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const walletAddressSchema = {
	walletAddress: {
		fields: {
			userId: {
				type: "string",
				references: {
					model: "user",
					field: "id",
				},
				required: true,
				index: true,
			},
			address: {
				type: "string",
				required: true,
			},
			chainId: {
				type: "number",
				required: true,
			},
			isPrimary: {
				type: "boolean",
				defaultValue: false,
			},
			createdAt: {
				type: "date",
				required: true,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;

export const nonceSchema = {
	erc8128Nonce: {
		fields: {
			nonceKey: {
				type: "string",
				required: true,
				unique: true,
			},
			expiresAt: {
				type: "date",
				required: true,
				index: true,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;

export const verificationCacheSchema = {
	erc8128VerificationCache: {
		fields: {
			cacheKey: {
				type: "string",
				required: true,
				unique: true,
			},
			address: {
				type: "string",
				required: true,
				index: true,
			},
			chainId: {
				type: "number",
				required: true,
				index: true,
			},
			signatureHash: {
				type: "string",
				required: true,
				index: true,
			},
			expiresAt: {
				type: "date",
				required: true,
				index: true,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;

export const invalidationSchema = {
	erc8128Invalidation: {
		fields: {
			kind: {
				type: "string",
				required: true,
				index: true,
			},
			matchKey: {
				type: "string",
				required: true,
				unique: true,
			},
			address: {
				type: "string",
				required: true,
				index: true,
			},
			chainId: {
				type: "number",
				required: true,
				index: true,
			},
			signatureHash: {
				type: "string",
				required: false,
				index: true,
			},
			notBefore: {
				type: "number",
				required: false,
			},
			expiresAt: {
				type: "date",
				required: false,
				index: true,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;

export const schema = {
	...walletAddressSchema,
	...nonceSchema,
	...verificationCacheSchema,
	...invalidationSchema,
} satisfies BetterAuthPluginDBSchema;

export type ERC8128Schema = typeof schema;
