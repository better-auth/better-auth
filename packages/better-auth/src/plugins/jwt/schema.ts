import type { AuthPluginSchema } from "../../types";

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
