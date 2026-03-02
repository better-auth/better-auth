import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import type { TeamsOptions } from "../types";

export const getTeamAddonSchema = <Options extends TeamsOptions>(
	options: Options,
) => {
	return {
		team: {
			modelName: options.schema?.team?.modelName,
			fields: {
				name: {
					type: "string",
					required: true,
					fieldName: options.schema?.team?.fields?.name,
				},
				organizationId: {
					type: "string",
					required: true,
					references: {
						model: "organization",
						field: "id",
					},
					fieldName: options.schema?.team?.fields?.organizationId,
					index: true,
				},
				createdAt: {
					type: "date",
					required: true,
					fieldName: options.schema?.team?.fields?.createdAt,
				},
				updatedAt: {
					type: "date",
					required: false,
					fieldName: options.schema?.team?.fields?.updatedAt,
					onUpdate: () => new Date(),
				},
				...(options.enableSlugs
					? {
							slug: {
								type: "string",
								required: false,
								fieldName: options.schema?.team?.fields?.slug,
							},
						}
					: {}),
				...(options.schema?.team?.additionalFields || {}),
			},
		},
		teamMember: {
			modelName: options.schema?.teamMember?.modelName,
			fields: {
				teamId: {
					type: "string",
					required: true,
					references: {
						model: "team",
						field: "id",
					},
					fieldName: options.schema?.teamMember?.fields?.teamId,
					index: true,
				},
				userId: {
					type: "string",
					required: true,
					references: {
						model: "user",
						field: "id",
					},
					fieldName: options.schema?.teamMember?.fields?.userId,
					index: true,
				},
				createdAt: {
					type: "date",
					required: false,
					fieldName: options.schema?.teamMember?.fields?.createdAt,
				},
				...(options.schema?.teamMember?.additionalFields || {}),
			},
		},
		invitation: {
			fields: {
				teamId: {
					type: "string",
					required: false,
					fieldName: (options.schema as any)?.invitation?.fields?.teamId,
				},
			},
		},
		session: {
			fields: {
				activeTeamId: {
					type: "string",
					required: false,
					fieldName: options.schema?.session?.fields?.activeTeamId,
				},
			},
		},
	} satisfies BetterAuthPluginDBSchema;
};
