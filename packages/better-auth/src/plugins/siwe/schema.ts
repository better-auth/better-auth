import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const schema = {
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
	user: {
		fields: {
			lastLoginMethod: {
				type: "string",
				required: false,
			},
		},
	},

} satisfies BetterAuthPluginDBSchema;

export type WalletAddressSchema = typeof schema;
