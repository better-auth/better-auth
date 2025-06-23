import type { AuthPluginSchema } from "../../types";

export const schema = {
	user: {
		fields: {
			username: {
				type: "string",
				required: false,
				sortable: true,
				unique: true,
				returned: true,
			},
			displayUsername: {
				type: "string",
				required: false,
			},
		},
	},
} satisfies AuthPluginSchema;
