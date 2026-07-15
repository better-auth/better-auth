import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const schema = {
	walletAddress: {
		fields: {
			accountId: {
				type: "string",
				references: {
					model: "account",
					field: "id",
					onDelete: "cascade",
				},
				required: true,
				unique: true,
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
		indexes: [
			{
				fields: ["address", "chainId"],
				unique: true,
			},
		],
	},
} satisfies BetterAuthPluginDBSchema;

export type WalletAddressSchema = typeof schema;
