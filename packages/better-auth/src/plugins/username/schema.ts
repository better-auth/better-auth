import type { AuthPluginSchema } from "../../types";

export const getSchema = (normalizer: {
	username: (username: string) => string;
	displayUsername: (displayUsername: string) => string;
}) => {
	return {
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
							return value == null
								? value
								: normalizer.username(value as string);
						},
					},
				},
				displayUsername: {
					type: "string",
					required: false,
					transform: {
						input(value) {
							return value == null
								? value
								: normalizer.displayUsername(value as string);
						},
					},
				},
			},
		},
	} satisfies AuthPluginSchema;
};

export type UsernameSchema = ReturnType<typeof getSchema>;
