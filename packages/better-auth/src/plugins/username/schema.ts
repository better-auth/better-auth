import type { AuthPluginSchema } from "../../types";

export const getSchema = () => {
	return {
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
};

export type UsernameSchema = ReturnType<typeof getSchema>;
