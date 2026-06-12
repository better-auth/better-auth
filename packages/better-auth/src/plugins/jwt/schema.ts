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
			// Algorithm/curve metadata for each persisted key. Nullable so
			// rows created before these columns existed continue to work —
			// readers fall back to `options.jwks.keyPairConfig.alg` when
			// `alg` is null (preserves pre-migration behavior).
			//
			// Required by per-resource signing in oauth-provider: different
			// protected resources can pin different algorithms, which is only meaningful
			// if the AS can store and select keys by alg.
			alg: {
				type: "string",
				required: false,
			},
			crv: {
				type: "string",
				required: false,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
