import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const schema = {
	jwks: {
		fields: {
			publicKey: {
				type: "string",
				required: true,
			},
			privateKey: {
				type: "string",
				required: true,
			},
			createdAt: {
				type: "date",
				required: true,
			},
			expiresAt: {
				type: "date",
				required: false,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
