import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

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
							return typeof value !== "string"
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
							return typeof value !== "string"
								? value
								: normalizer.displayUsername(value as string);
						},
					},
				},
			},
		},
	} satisfies BetterAuthPluginDBSchema;
};

export type UsernameSchema = ReturnType<typeof getSchema>;
