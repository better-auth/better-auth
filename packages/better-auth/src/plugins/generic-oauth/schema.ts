import type { AuthPluginSchema } from "..";

export const oauthRegistrationSchema = {
	oauthRegistration: {
		fields: {
			providerId: {
				type: "string",
				required: true,
			},
			clientId: {
				type: "string",
				required: true,
			},
			clientSecret: {
				type: "string",
				required: true,
			},
		},
	},
} satisfies AuthPluginSchema;
