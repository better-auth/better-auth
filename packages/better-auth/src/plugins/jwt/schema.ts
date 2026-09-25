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
			// Kept for keys minted before the public JWK carried `alg`. Nullable for
			// rows created before this column existed.
			alg: {
				type: "string",
				required: false,
			},
			// Duplicates `crv` of the public JWK, which readers use instead.
			crv: {
				type: "string",
				required: false,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
