import type { PluginSchema } from "../../types";
import { z } from "zod";

export const schema: PluginSchema = {
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
};

export const jwk = z.object({
	id: z.string(),
	publicKey: z.string(),
	privateKey: z.string(),
	createdAt: z.date(),
});

export type Jwk = z.infer<typeof jwk>;
