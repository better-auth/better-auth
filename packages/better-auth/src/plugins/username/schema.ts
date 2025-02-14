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
				transform: {
					input(value) {
						return value?.toString().toLowerCase();
					},
				},
			},
			displayUsername: {
				type: "string",
				required: false,
			},
		},
	},
} satisfies AuthPluginSchema;
