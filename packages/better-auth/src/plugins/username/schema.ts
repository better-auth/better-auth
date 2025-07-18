import type { AuthPluginSchema } from "../../types";

export const getSchema = (normalizer: (username: string) => string) => {
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
					transform: {
						input(value) {
							return value == null ? value : normalizer(value as string);
						},
					},
				},
			},
		},
	} satisfies AuthPluginSchema;
};

export type UsernameSchema = ReturnType<typeof getSchema>;
