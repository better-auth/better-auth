import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import { generateId } from "@better-auth/core/utils/id";
import * as z from "zod/v4";
import type { TeamsOptions } from "./types";

export const teamSchema = z.object({
	id: z.string().default(generateId),
	name: z.string().min(1),
	organizationId: z.string(),
	createdAt: z.date(),
	updatedAt: z.date().optional(),
});

export const teamMemberSchema = z.object({
	id: z.string().default(generateId),
	teamId: z.string(),
	userId: z.string(),
	createdAt: z.date().default(() => new Date()),
});

export type TeamMember = z.infer<typeof teamMemberSchema>;
export type Team = z.infer<typeof teamSchema>;

export type TeamMemberInput = z.input<typeof teamMemberSchema>;
export type TeamInput = z.input<typeof teamSchema>;

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
