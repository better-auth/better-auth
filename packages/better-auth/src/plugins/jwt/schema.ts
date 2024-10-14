import type { PluginSchema } from "../../types/plugins";
import { z } from "zod";

export const schema: PluginSchema = {
	jwks: {
		fields: {
			publicKey: {
				type: 'string',
				required: true,
			},
			privateKey: {
				type: 'string',
				required: true,
			},
			privateKeyIv: {
				type: 'string',
				required: false,
			},
			privateKeyAuthTag: {
				type: 'string',
				required: false,
			},
			createdAt: {
				type: 'date',
				required: true,
			},
		},
	}
};

export const jwk = z.object({
	id: z.string(),
	publicKey: z.string(),
	privateKey: z.string(),
	privateKeyIv: z.string().optional(),
	privateKeyAuthTag: z.string().optional(),
	createdAt: z.date(),
});

export type Jwk = z.infer<typeof jwk>;
