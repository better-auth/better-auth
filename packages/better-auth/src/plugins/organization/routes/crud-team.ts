import * as z from "zod/v4";
import { createAuthEndpoint } from "../../../api/call";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { APIError } from "better-call";
import { getSessionFromCtx } from "../../../api";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import type { OrganizationOptions } from "../types";
import { teamSchema } from "../schema";
import { hasPermission } from "../has-permission";
import { setSessionCookie } from "../../../cookies";
import {
	toZodSchema,
	type InferAdditionalFieldsFromPluginOptions,
} from "../../../db";
import type { PrettifyDeep } from "../../../types/helper";

export const createTeam = <O extends OrganizationOptions>(options: O) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.team?.additionalFields ?? {},
		isClientSide: true,
	});
	const baseSchema = z.object({
		name: z.string().meta({
			description: 'The name of the team. Eg: "my-team"',
		}),
		organizationId: z
			.string()
			.meta({
				description:
					'The organization ID which the team will be created in. Defaults to the active organization. Eg: "organization-id"',
			})
			.optional(),
	});
	return createAuthEndpoint(
		"/organization/create-team",
		{
			method: "POST",
			body: z.object({
				...baseSchema.shape,
				...additionalFieldsSchema.shape,
			}),
			use: [orgMiddleware],
			metadata: {
				$Infer: {
					body: {} as z.infer<typeof baseSchema> &
						InferAdditionalFieldsFromPluginOptions<"team", O>,
				},
				openapi: {
					description: "Create a new team within an organization",
					responses: {
						"200": {
							description: "Team created successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: {
												type: "string",
												description: "Unique identifier of the created team",
											},
											name: {
												type: "string",
												description: "Name of the team",
											},
											organizationId: {
												type: "string",
												description:
													"ID of the organization the team belongs to",
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
			const session = await getSessionFromCtx(ctx);
			const organizationId =
				ctx.body.organizationId || session?.session.activeOrganizationId;
			if (!session && (ctx.request || ctx.headers)) {
				throw new APIError("UNAUTHORIZED");
			}

			if (!organizationId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options as O);
			if (session) {
				const member = await adapter.findMemberByOrgId({
					userId: session.user.id,
					organizationId,
				});
				if (!member) {
					throw new APIError("FORBIDDEN", {
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION,
					});
				}
				const canCreate = hasPermission({
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: {
						team: ["create"],
					},
				});
				if (!canCreate) {
					throw new APIError("FORBIDDEN", {
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION,
					});
				}
			}

			const existingTeams = await adapter.listTeams(organizationId);
			const maximum =
				typeof ctx.context.orgOptions.teams?.maximumTeams === "function"
					? await ctx.context.orgOptions.teams?.maximumTeams(
							{
								organizationId,
								session,
							},
							ctx.request,
						)
					: ctx.context.orgOptions.teams?.maximumTeams;

			const maxTeamsReached = maximum ? existingTeams.length >= maximum : false;
			if (maxTeamsReached) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS,
				});
			}
			const { name, organizationId: _, ...additionalFields } = ctx.body;
			const createdTeam = await adapter.createTeam({
				name,
				organizationId,
				createdAt: new Date(),
				updatedAt: new Date(),
				...additionalFields,
			});
			return ctx.json(createdTeam);
		},
	);
};

export const removeTeam = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/remove-team",
		{
			method: "POST",
			body: z.object({
				teamId: z.string().meta({
					description: `The team ID of the team to remove. Eg: "team-id"`,
				}),
				organizationId: z
					.string()
					.meta({
						description: `The organization ID which the team falls under. If not provided, it will default to the user's active organization. Eg: "organization-id"`,
					})
					.optional(),
			}),
			use: [orgMiddleware],
			metadata: {
				openapi: {
					description: "Remove a team from an organization",
					responses: {
						"200": {
							description: "Team removed successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											message: {
												type: "string",
												description:
													"Confirmation message indicating successful removal",
												enum: ["Team removed successfully."],
											},
										},
										required: ["message"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			const organizationId =
				ctx.body.organizationId || session?.session.activeOrganizationId;
			if (!organizationId) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
				});
			}
			if (!session && (ctx.request || ctx.headers)) {
				throw new APIError("UNAUTHORIZED");
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			if (session) {
				const member = await adapter.findMemberByOrgId({
					userId: session.user.id,
					organizationId,
				});

				if (!member || session.session?.activeTeamId === ctx.body.teamId) {
					throw new APIError("FORBIDDEN", {
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM,
					});
				}

				const canRemove = hasPermission({
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: {
						team: ["delete"],
					},
				});
				if (!canRemove) {
					throw new APIError("FORBIDDEN", {
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION,
					});
				}
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

			if (!ctx.context.orgOptions.teams?.allowRemovingAllTeams) {
				const teams = await adapter.listTeams(organizationId);
				if (teams.length <= 1) {
					throw new APIError("BAD_REQUEST", {
						message: ORGANIZATION_ERROR_CODES.UNABLE_TO_REMOVE_LAST_TEAM,
					});
				}
			}

			await adapter.deleteTeam(team.id);
			return ctx.json({ message: "Team removed successfully." });
		},
	);

export const updateTeam = <O extends OrganizationOptions>(options: O) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.team?.additionalFields ?? {},
		isClientSide: true,
	});

	type Body = {
		teamId: string;
		data: Partial<
			PrettifyDeep<
				Omit<z.infer<typeof teamSchema>, "id" | "createdAt" | "updatedAt">
			> &
				InferAdditionalFieldsFromPluginOptions<"team", O>
		>;
	};

	return createAuthEndpoint(
		"/organization/update-team",
		{
			method: "POST",
			body: z.object({
				teamId: z.string().meta({
					description: `The ID of the team to be updated. Eg: "team-id"`,
				}),
				data: z
					.object({
						...teamSchema.shape,
						...additionalFieldsSchema.shape,
					})
					.partial(),
			}),
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				$Infer: { body: {} as Body },
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
												description:
													"ID of the organization the team belongs to",
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
			const adapter = getOrgAdapter<O>(ctx.context, options);
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

			const { name, organizationId: __, ...additionalFields } = ctx.body.data;

			const updatedTeam = await adapter.updateTeam(team.id, {
				name,
				...additionalFields,
			});

			return ctx.json(updatedTeam);
		},
	);
};

export const listOrganizationTeams = <O extends OrganizationOptions>(
	options: O,
) =>
	createAuthEndpoint(
		"/organization/list-teams",
		{
			method: "GET",
			query: z.optional(
				z.object({
					organizationId: z
						.string()
						.meta({
							description: `The organization ID which the teams are under to list. Defaults to the users active organization. Eg: "organziation-id"`,
						})
						.optional(),
				}),
			),
			requireHeaders: true,
			metadata: {
				openapi: {
					description: "List all teams in an organization",
					responses: {
						"200": {
							description: "Teams retrieved successfully",
							content: {
								"application/json": {
									schema: {
										type: "array",
										items: {
											type: "object",
											properties: {
												id: {
													type: "string",
													description: "Unique identifier of the team",
												},
												name: {
													type: "string",
													description: "Name of the team",
												},
												organizationId: {
													type: "string",
													description:
														"ID of the organization the team belongs to",
												},
												createdAt: {
													type: "string",
													format: "date-time",
													description: "Timestamp when the team was created",
												},
												updatedAt: {
													type: "string",
													format: "date-time",
													description:
														"Timestamp when the team was last updated",
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
										description:
											"Array of team objects within the organization",
									},
								},
							},
						},
					},
				},
			},
			use: [orgMiddleware, orgSessionMiddleware],
		},
		async (ctx) => {
			const session = ctx.context.session;
			const organizationId =
				ctx.query?.organizationId || session?.session.activeOrganizationId;
			if (!organizationId) {
				throw ctx.error("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId || "",
			});
			if (!member) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION,
				});
			}
			const teams = await adapter.listTeams(organizationId);
			return ctx.json(teams);
		},
	);

export const setActiveTeam = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/set-active-team",
		{
			method: "POST",
			body: z.object({
				teamId: z
					.string()
					.meta({
						description:
							"The team id to set as active. It can be null to unset the active team",
					})
					.nullable()
					.optional(),
			}),
			use: [orgSessionMiddleware, orgMiddleware],
			metadata: {
				openapi: {
					description: "Set the active team",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										description: "The team",
										$ref: "#/components/schemas/Team",
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const session = ctx.context.session;

			if (ctx.body.teamId === null) {
				const sessionTeamId = session.session.activeTeamId;
				if (!sessionTeamId) {
					return ctx.json(null);
				}

				const updatedSession = await adapter.setActiveTeam(
					session.session.token,
					null,
				);

				await setSessionCookie(ctx, {
					session: updatedSession,
					user: session.user,
				});

				return ctx.json(null);
			}

			let teamId: string;

			if (!ctx.body.teamId) {
				const sessionTeamId = session.session.activeTeamId;
				if (!sessionTeamId) {
					return ctx.json(null);
				} else {
					teamId = sessionTeamId;
				}
			} else {
				teamId = ctx.body.teamId;
			}

			const team = await adapter.findTeamById({ teamId });

			if (!team) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND,
				});
			}

			const member = await adapter.findTeamMember({
				teamId,
				userId: session.user.id,
			});

			if (!member) {
				throw new APIError("FORBIDDEN", {
					message: ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_TEAM,
				});
			}

			const updatedSession = await adapter.setActiveTeam(
				session.session.token,
				team.id,
			);

			await setSessionCookie(ctx, {
				session: updatedSession,
				user: session.user,
			});

			return ctx.json(team);
		},
	);

export const listUserTeams = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/list-user-teams",
		{
			method: "GET",
			metadata: {
				openapi: {
					description: "List all teams that the current user is a part of.",
					responses: {
						"200": {
							description: "Teams retrieved successfully",
							content: {
								"application/json": {
									schema: {
										type: "array",
										items: {
											type: "object",
											description: "The team",
											$ref: "#/components/schemas/Team",
										},
										description:
											"Array of team objects within the organization",
									},
								},
							},
						},
					},
				},
			},
			use: [orgMiddleware, orgSessionMiddleware],
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const teams = await adapter.listTeamsByUser({
				userId: session.user.id,
			});

			return ctx.json(teams);
		},
	);

export const listTeamMembers = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/list-team-members",
		{
			method: "GET",
			query: z.optional(
				z.object({
					teamId: z.string().optional().meta({
						description:
							"The team whose members we should return. If this is not provided the members of the current active team get returned.",
					}),
				}),
			),
			metadata: {
				openapi: {
					description: "List the members of the given team.",
					responses: {
						"200": {
							description: "Teams retrieved successfully",
							content: {
								"application/json": {
									schema: {
										type: "array",
										items: {
											type: "object",
											description: "The team member",
											properties: {
												id: {
													type: "string",
													description: "Unique identifier of the team member",
												},
												userId: {
													type: "string",
													description: "The user ID of the team member",
												},
												teamId: {
													type: "string",
													description:
														"The team ID of the team the team member is in",
												},
												createdAt: {
													type: "string",
													format: "date-time",
													description:
														"Timestamp when the team member was created",
												},
											},
											required: ["id", "userId", "teamId", "createdAt"],
										},
										description: "Array of team member objects within the team",
									},
								},
							},
						},
					},
				},
			},
			use: [orgMiddleware, orgSessionMiddleware],
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			let teamId = ctx.query?.teamId || session?.session.activeTeamId;
			if (!teamId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM,
				});
			}
			const member = await adapter.findTeamMember({
				userId: session.user.id,
				teamId,
			});

			if (!member) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_TEAM,
				});
			}
			const members = await adapter.listTeamMembers({
				teamId,
			});
			return ctx.json(members);
		},
	);

export const addTeamMember = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/add-team-member",
		{
			method: "POST",
			body: z.object({
				teamId: z.string().meta({
					description: "The team the user should be a member of.",
				}),

				userId: z.coerce.string().meta({
					description:
						"The user Id which represents the user to be added as a member.",
				}),
			}),
			metadata: {
				openapi: {
					description: "The newly created member",
					responses: {
						"200": {
							description: "Team member created successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										description: "The team member",
										properties: {
											id: {
												type: "string",
												description: "Unique identifier of the team member",
											},
											userId: {
												type: "string",
												description: "The user ID of the team member",
											},
											teamId: {
												type: "string",
												description:
													"The team ID of the team the team member is in",
											},
											createdAt: {
												type: "string",
												format: "date-time",
												description:
													"Timestamp when the team member was created",
											},
										},
										required: ["id", "userId", "teamId", "createdAt"],
									},
								},
							},
						},
					},
				},
			},
			use: [orgMiddleware, orgSessionMiddleware],
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);

			if (!session.session.activeOrganizationId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}

			const currentMember = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: session.session.activeOrganizationId,
			});

			if (!currentMember) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
				});
			}

			const canUpdateMember = hasPermission({
				role: currentMember.role,
				options: ctx.context.orgOptions,
				permissions: {
					member: ["update"],
				},
			});

			if (!canUpdateMember) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER,
				});
			}

			const toBeAddedMember = await adapter.findMemberByOrgId({
				userId: ctx.body.userId,
				organizationId: session.session.activeOrganizationId,
			});

			if (!toBeAddedMember) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
				});
			}

			const teamMember = await adapter.findOrCreateTeamMember({
				teamId: ctx.body.teamId,
				userId: ctx.body.userId,
			});

			return ctx.json(teamMember);
		},
	);

export const removeTeamMember = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/remove-team-member",
		{
			method: "POST",
			body: z.object({
				teamId: z.string().meta({
					description: "The team the user should be removed from.",
				}),

				userId: z.coerce.string().meta({
					description: "The user which should be removed from the team.",
				}),
			}),
			metadata: {
				openapi: {
					description: "Remove a member from a team",
					responses: {
						"200": {
							description: "Team member removed successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											message: {
												type: "string",
												description:
													"Confirmation message indicating successful removal",
												enum: ["Team member removed successfully."],
											},
										},
										required: ["message"],
									},
								},
							},
						},
					},
				},
			},
			use: [orgMiddleware, orgSessionMiddleware],
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);

			if (!session.session.activeOrganizationId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}

			const currentMember = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: session.session.activeOrganizationId,
			});

			if (!currentMember) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
				});
			}

			const canDeleteMember = hasPermission({
				role: currentMember.role,
				options: ctx.context.orgOptions,
				permissions: {
					member: ["delete"],
				},
			});

			if (!canDeleteMember) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER,
				});
			}

			const toBeAddedMember = await adapter.findMemberByOrgId({
				userId: ctx.body.userId,
				organizationId: session.session.activeOrganizationId,
			});

			if (!toBeAddedMember) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
				});
			}

			await adapter.removeTeamMember({
				teamId: ctx.body.teamId,
				userId: ctx.body.userId,
			});

			return ctx.json({ message: "Team member removed successfully." });
		},
	);
