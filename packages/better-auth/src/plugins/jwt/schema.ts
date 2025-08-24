import type { AuthPluginSchema } from "../../types";
import * as z from "zod/v4";
import type { JWSAlgorithms } from "./types";

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
		},
	},
} satisfies AuthPluginSchema;

export const jwk = z.object({
	id: z.string(),
	publicKey: z.string(),
	privateKey: z.string(),
	createdAt: z.date(),
	alg: z
		.enum([
			"EdDSA",
			"ES256",
			"ES512",
			"PS256",
			"RS256",
		] satisfies JWSAlgorithms[])
		.optional(),
	crv: z.enum(["Ed25519", "P-256", "P-521"]).optional(),
});

export type Jwk = z.infer<typeof jwk>;
