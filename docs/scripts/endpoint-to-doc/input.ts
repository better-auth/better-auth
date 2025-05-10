//@ts-nocheck
import {
	createAuthEndpoint,
	orgMiddleware,
	orgSessionMiddleware,
	requestOnlySessionMiddleware,
	sessionMiddleware,
} from "./index";
import { z } from "zod";

const teamSchema = z.object({
	id: z.string(),
	name: z.string().min(1),
	organizationId: z.string(),
	createdAt: z.date(),
	updatedAt: z.date().optional(),
}, {description: `The team schema.`});

export const updateTeam = createAuthEndpoint(
	"/organization/update-team",
	{
		method: "POST",
		body: z.object({
			teamId: z.string({description: `The ID of the team to be updated. Eg: "team-id"`}),
			data: teamSchema.partial(),
		}),
		requireHeaders: true,
		use: [orgMiddleware, orgSessionMiddleware],
		metadata: {
			openapi: {
				description: "Update an existing team in an organization",
				responses: {
					"200": {
						description: "Team updated successfully",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										id: {
											type: "string",
											description: "Unique identifier of the updated team",
										},
										name: {
											type: "string",
											description: "Updated name of the team",
										},
										organizationId: {
											type: "string",
											description: "ID of the organization the team belongs to",
										},
										createdAt: {
											type: "string",
											format: "date-time",
											description: "Timestamp when the team was created",
										},
										updatedAt: {
											type: "string",
											format: "date-time",
											description: "Timestamp when the team was last updated",
										},
									},
									required: [
										"id",
										"name",
										"organizationId",
										"createdAt",
										"updatedAt",
									],
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const session = ctx.context.session;
		const organizationId =
			ctx.body.data.organizationId || session.session.activeOrganizationId;
		if (!organizationId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				},
			});
		}
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const member = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId,
		});

		if (!member) {
			throw new APIError("FORBIDDEN", {
				message:
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM,
			});
		}

		const canUpdate = hasPermission({
			role: member.role,
			options: ctx.context.orgOptions,
			permissions: {
				team: ["update"],
			},
		});
		if (!canUpdate) {
			throw new APIError("FORBIDDEN", {
				message:
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM,
			});
		}

		const team = await adapter.findTeamById({
			teamId: ctx.body.teamId,
			organizationId,
		});

		if (!team || team.organizationId !== organizationId) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND,
			});
		}

		const updatedTeam = await adapter.updateTeam(team.id, {
			name: ctx.body.data.name,
		});

		return ctx.json(updatedTeam);
	},
);
