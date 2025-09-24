import type { AuthPluginSchema } from "../../types";

export const schema = {
	loginHistory: {
		fields: {
			userAgent: {
				type: "string",
				required: true,
			},
			ipAddress: {
				type: "string",
				required: true,
			},
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
				},
			},
			createdAt: {
				type: "date",
				required: false,
				input: false,
			},
		},
	},
} satisfies AuthPluginSchema;
