import type { AuthPluginSchema } from "../../types";

export const getSchema = (normalizer: {
	name?: (name: string) => string;
	role?: (role: string) => string;
	slug?: (slug: string) => string;
}) => {
	return {
		workspace: {
			fields: {
				id: {
					type: "string",
					required: true,
					unique: true,
					returned: true,
				},
				name: {
					type: "string",
					required: true,
					sortable: true,
					returned: true,
					transform:
						normalizer && normalizer.name
							? {
									input(value) {
										return value == null
											? value
											: normalizer.name!(value as string);
									},
								}
							: undefined,
				},
				slug: {
					type: "string",
					required: false,
					unique: true,
					returned: true,
					transform:
						normalizer && normalizer.slug
							? {
									input(value) {
										return value == null
											? value
											: normalizer.slug!(value as string);
									},
								}
							: undefined,
				},
				description: {
					type: "string",
					required: false,
				},
				organizationId: {
					type: "string",
					required: true,
					references: { model: "organization", field: "id" },
				},
				metadata: {
					type: "string",
					required: false,
				},
				createdAt: {
					type: "date",
					required: true,
					returned: true,
				},
				updatedAt: {
					type: "date",
					required: true,
					returned: true,
				},
			},
		},
		workspaceMember: {
			fields: {
				id: {
					type: "string",
					required: true,
					unique: true,
					returned: true,
				},
				workspaceId: {
					type: "string",
					required: true,
					references: { model: "workspace", field: "id" },
				},
				userId: {
					type: "string",
					required: true,
					references: { model: "user", field: "id" },
				},
				role: {
					type: "string",
					required: true,
					returned: true,
					transform:
						normalizer && normalizer.role
							? {
									input(value) {
										return value == null
											? value
											: normalizer.role!(value as string);
									},
								}
							: undefined,
				},
				createdAt: {
					type: "date",
					required: true,
					returned: true,
				},
			},
		},
		workspaceTeamMember: {
			fields: {
				id: {
					type: "string",
					required: true,
					unique: true,
					returned: true,
				},
				workspaceId: {
					type: "string",
					required: true,
					references: { model: "workspace", field: "id" },
				},
				teamId: {
					type: "string",
					required: true,
					references: { model: "team", field: "id" },
				},
				role: {
					type: "string",
					required: true,
					returned: true,
					defaultValue: "member",
					transform:
						normalizer && normalizer.role
							? {
									input(value) {
										return value == null
											? value
											: normalizer.role!(value as string);
									},
								}
							: undefined,
				},
				createdAt: {
					type: "date",
					required: true,
					returned: true,
				},
			},
		},
	} satisfies AuthPluginSchema;
};

export type WorkspaceSchema = ReturnType<typeof getSchema>;
