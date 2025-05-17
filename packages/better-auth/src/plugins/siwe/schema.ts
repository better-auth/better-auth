import type { AuthPluginSchema } from "../../types";

export const schema = {
	user: {
		fields: {
			walletAddress: {
				type: "string",
				unique: true,
				required: false,
			},
		},
	},
} satisfies AuthPluginSchema;
