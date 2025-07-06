import type { AuthPluginSchema } from "../../types";

export type UsernameSchemaOptions = {
	requiredUsername?: boolean;
};

export function createUsernameSchema(options: UsernameSchemaOptions) {
	return {
		user: {
			fields: {
				username: {
					type: "string",
					required: options.requiredUsername ?? false,
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
}

export type UsernameSchema = ReturnType<typeof createUsernameSchema>;
