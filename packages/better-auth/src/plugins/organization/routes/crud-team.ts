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

				if (!member || member.teamId === ctx.body.teamId) {
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
				session.session.activeOrganizationId || ctx.query?.organizationId;

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
				userId: session?.user.id,
				organizationId: organizationId || "",
			});

			if (!member) {
				throw new APIError("FORBIDDEN");
			}

			const teams = await adapter.listTeams(organizationId);

			return ctx.json(teams);
		},
	);
