import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { getSessionFromCtx } from "../../../api/routes";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { type InferOrganizationRolesFromOption } from "../schema";
import { APIError } from "better-call";
import { parseRoles } from "../organization";
import { type OrganizationOptions } from "../types";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { hasPermission } from "../has-permission";

export const createInvitation = <O extends OrganizationOptions | undefined>(
	option: O,
) =>
	createAuthEndpoint(
		"/organization/invite-member",
		{
			method: "POST",
			use: [orgMiddleware, orgSessionMiddleware],
			body: z.object({
				email: z.string({
					description: "The email address of the user to invite",
				}),
				role: z.union([
					z.string({
						description: "The role to assign to the user",
					}),
					z.array(
						z.string({
							description: "The roles to assign to the user",
						}),
					),
				]),
				organizationId: z
					.string({
						description: "The organization ID to invite the user to",
					})
					.optional(),
				resend: z
					.boolean({
						description:
							"Resend the invitation email, if the user is already invited",
					})
					.optional(),
				teamId: z
					.string({
						description: "The team ID to invite the user to",
					})
					.optional(),
			}),
			metadata: {
				$Infer: {
					body: {} as {
						/**
						 * The email address of the user
						 * to invite
						 */
						email: string;
						/**
						 * The role to assign to the user
						 */
						role:
							| InferOrganizationRolesFromOption<O>
							| InferOrganizationRolesFromOption<O>[];
						/**
						 * The organization ID to invite
						 * the user to
						 */
						organizationId?: string;
						/**
						 * Resend the invitation email, if
						 * the user is already invited
						 */
						resend?: boolean;
					} & (O extends { teams: { enabled: true } }
						? {
								/**
								 * The team the user is
								 * being invited to.
								 */
								teamId?: string;
							}
						: {}),
				},
				openapi: {
					description: "Invite a user to an organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: {
												type: "string",
											},
											email: {
												type: "string",
											},
											role: {
												type: "string",
											},
											organizationId: {
												type: "string",
											},
											inviterId: {
												type: "string",
											},
											status: {
												type: "string",
											},
											expiresAt: {
												type: "string",
											},
										},
										required: [
											"id",
											"email",
											"role",
											"organizationId",
											"inviterId",
											"status",
											"expiresAt",
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
				ctx.body.organizationId || session.session.activeOrganizationId;
			if (!organizationId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}
			const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});
			if (!member) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
				});
			}
			const canInvite = hasPermission({
				role: member.role,
				options: ctx.context.orgOptions,
				permissions: {
					invitation: ["create"],
				},
			});
			if (!canInvite) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION,
				});
			}

			const creatorRole = ctx.context.orgOptions.creatorRole || "owner";

			const roles = parseRoles(ctx.body.role as string | string[]);

			if (
				member.role !== creatorRole &&
				roles.split(",").includes(creatorRole)
			) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE,
				});
			}

			const alreadyMember = await adapter.findMemberByEmail({
				email: ctx.body.email,
				organizationId: organizationId,
			});
			if (alreadyMember) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}
			const alreadyInvited = await adapter.findPendingInvitation({
				email: ctx.body.email,
				organizationId: organizationId,
			});
			if (alreadyInvited.length && !ctx.body.resend) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION,
				});
			}
			if (
				alreadyInvited.length &&
				ctx.context.orgOptions.cancelPendingInvitationsOnReInvite
			) {
				await adapter.updateInvitation({
					invitationId: alreadyInvited[0].id,
					status: "canceled",
				});
			}
			const organization = await adapter.findOrganizationById(organizationId);
			if (!organization) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}

			const invitationLimit =
				typeof ctx.context.orgOptions.invitationLimit === "function"
					? await ctx.context.orgOptions.invitationLimit(
							{
								user: session.user,
								organization,
								member: member,
							},
							ctx.context,
						)
					: ctx.context.orgOptions.invitationLimit ?? 100;

			const pendingInvitations = await adapter.findPendingInvitations({
				organizationId: organizationId,
			});

			if (pendingInvitations.length >= invitationLimit) {
				throw new APIError("FORBIDDEN", {
					message: ORGANIZATION_ERROR_CODES.INVITATION_LIMIT_REACHED,
				});
			}

			if (
				ctx.context.orgOptions.teams &&
				ctx.context.orgOptions.teams.enabled &&
				typeof ctx.context.orgOptions.teams.maximumMembersPerTeam !==
					"undefined" &&
				"teamId" in ctx.body &&
				ctx.body.teamId
			) {
				const team = await adapter.findTeamById({
					teamId: ctx.body.teamId,
					organizationId: organizationId,
					includeTeamMembers: true,
				});
				if (!team) {
					throw new APIError("BAD_REQUEST", {
						message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND,
					});
				}
				const maximumMembersPerTeam =
					typeof ctx.context.orgOptions.teams.maximumMembersPerTeam ===
					"function"
						? await ctx.context.orgOptions.teams.maximumMembersPerTeam({
								teamId: ctx.body.teamId,
								session: session,
								organizationId: organizationId,
							})
						: ctx.context.orgOptions.teams.maximumMembersPerTeam;
				if (team.members.length >= maximumMembersPerTeam) {
					throw new APIError("FORBIDDEN", {
						message: ORGANIZATION_ERROR_CODES.TEAM_MEMBER_LIMIT_REACHED,
					});
				}
			}

			const invitation = await adapter.createInvitation({
				invitation: {
					role: roles,
					email: ctx.body.email.toLowerCase(),
					organizationId: organizationId,
					...("teamId" in ctx.body
						? {
								teamId: ctx.body.teamId,
							}
						: {}),
				},
				user: session.user,
			});

			await ctx.context.orgOptions.sendInvitationEmail?.(
				{
					id: invitation.id,
					role: invitation.role as string,
					email: invitation.email.toLowerCase(),
					organization: organization,
					inviter: {
						...member,
						user: session.user,
					},
					invitation,
				},
				ctx.request,
			);
			return ctx.json(invitation);
		},
	);

export const acceptInvitation = createAuthEndpoint(
	"/organization/accept-invitation",
	{
		method: "POST",
		body: z.object({
			invitationId: z.string({
				description: "The ID of the invitation to accept",
			}),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
		metadata: {
			openapi: {
				description: "Accept an invitation to an organization",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										invitation: {
											type: "object",
										},
										member: {
											type: "object",
										},
									},
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
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const invitation = await adapter.findInvitationById(ctx.body.invitationId);
		if (
			!invitation ||
			invitation.expiresAt < new Date() ||
			invitation.status !== "pending"
		) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
			});
		}
		if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
			throw new APIError("FORBIDDEN", {
				message:
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION,
			});
		}
		const membershipLimit = ctx.context.orgOptions?.membershipLimit || 100;
		const members = await adapter.listMembers({
			organizationId: invitation.organizationId,
		});

		if (members.length >= membershipLimit) {
			throw new APIError("FORBIDDEN", {
				message: ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED,
			});
		}
		const acceptedI = await adapter.updateInvitation({
			invitationId: ctx.body.invitationId,
			status: "accepted",
		});
		if (!acceptedI) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.FAILED_TO_RETRIEVE_INVITATION,
			});
		}

		if (
			ctx.context.orgOptions.teams &&
			ctx.context.orgOptions.teams.enabled &&
			typeof ctx.context.orgOptions.teams.maximumMembersPerTeam !==
				"undefined" &&
			"teamId" in acceptedI &&
			acceptedI.teamId
		) {
			const team = await adapter.findTeamById({
				teamId: acceptedI.teamId,
				organizationId: invitation.organizationId,
				includeTeamMembers: true,
			});
			if (!team) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND,
				});
			}
			const maximumMembersPerTeam =
				typeof ctx.context.orgOptions.teams.maximumMembersPerTeam === "function"
					? await ctx.context.orgOptions.teams.maximumMembersPerTeam({
							teamId: acceptedI.teamId,
							session: session,
							organizationId: invitation.organizationId,
						})
					: ctx.context.orgOptions.teams.maximumMembersPerTeam;
			if (team.members.length >= maximumMembersPerTeam) {
				throw new APIError("FORBIDDEN", {
					message: ORGANIZATION_ERROR_CODES.TEAM_MEMBER_LIMIT_REACHED,
				});
			}
		}

		const member = await adapter.createMember({
			organizationId: invitation.organizationId,
			userId: session.user.id,
			role: invitation.role,
			createdAt: new Date(),
			...("teamId" in acceptedI
				? {
						teamId: acceptedI.teamId,
					}
				: {}),
		});
		await adapter.setActiveOrganization(
			session.session.token,
			invitation.organizationId,
		);
		if (!acceptedI) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
				},
			});
		}
		return ctx.json({
			invitation: acceptedI,
			member,
		});
	},
);
export const rejectInvitation = createAuthEndpoint(
	"/organization/reject-invitation",
	{
		method: "POST",
		body: z.object({
			invitationId: z.string({
				description: "The ID of the invitation to reject",
			}),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
		metadata: {
			openapi: {
				description: "Reject an invitation to an organization",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										invitation: {
											type: "object",
										},
										member: {
											type: "null",
										},
									},
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
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const invitation = await adapter.findInvitationById(ctx.body.invitationId);
		if (
			!invitation ||
			invitation.expiresAt < new Date() ||
			invitation.status !== "pending"
		) {
			throw new APIError("BAD_REQUEST", {
				message: "Invitation not found!",
			});
		}
		if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
			throw new APIError("FORBIDDEN", {
				message:
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION,
			});
		}
		const rejectedI = await adapter.updateInvitation({
			invitationId: ctx.body.invitationId,
			status: "rejected",
		});
		return ctx.json({
			invitation: rejectedI,
			member: null,
		});
	},
);

export const cancelInvitation = createAuthEndpoint(
	"/organization/cancel-invitation",
	{
		method: "POST",
		body: z.object({
			invitationId: z.string({
				description: "The ID of the invitation to cancel",
			}),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
		openapi: {
			description: "Cancel an invitation to an organization",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									invitation: {
										type: "object",
									},
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
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const invitation = await adapter.findInvitationById(ctx.body.invitationId);
		if (!invitation) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
			});
		}
		const member = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId: invitation.organizationId,
		});
		if (!member) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
			});
		}
		const canCancel = hasPermission({
			role: member.role,
			options: ctx.context.orgOptions,
			permissions: {
				invitation: ["cancel"],
			},
		});
		if (!canCancel) {
			throw new APIError("FORBIDDEN", {
				message:
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION,
			});
		}
		const canceledI = await adapter.updateInvitation({
			invitationId: ctx.body.invitationId,
			status: "canceled",
		});
		return ctx.json(canceledI);
	},
);

export const getInvitation = createAuthEndpoint(
	"/organization/get-invitation",
	{
		method: "GET",
		use: [orgMiddleware],
		requireHeaders: true,
		query: z.object({
			id: z.string({
				description: "The ID of the invitation to get",
			}),
		}),
		metadata: {
			openapi: {
				description: "Get an invitation by ID",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										id: {
											type: "string",
										},
										email: {
											type: "string",
										},
										role: {
											type: "string",
										},
										organizationId: {
											type: "string",
										},
										inviterId: {
											type: "string",
										},
										status: {
											type: "string",
										},
										expiresAt: {
											type: "string",
										},
										organizationName: {
											type: "string",
										},
										organizationSlug: {
											type: "string",
										},
										inviterEmail: {
											type: "string",
										},
									},
									required: [
										"id",
										"email",
										"role",
										"organizationId",
										"inviterId",
										"status",
										"expiresAt",
										"organizationName",
										"organizationSlug",
										"inviterEmail",
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
		if (!session) {
			throw new APIError("UNAUTHORIZED", {
				message: "Not authenticated",
			});
		}
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const invitation = await adapter.findInvitationById(ctx.query.id);
		if (
			!invitation ||
			invitation.status !== "pending" ||
			invitation.expiresAt < new Date()
		) {
			throw new APIError("BAD_REQUEST", {
				message: "Invitation not found!",
			});
		}
		if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
			throw new APIError("FORBIDDEN", {
				message:
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION,
			});
		}
		const organization = await adapter.findOrganizationById(
			invitation.organizationId,
		);
		if (!organization) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
			});
		}
		const member = await adapter.findMemberByOrgId({
			userId: invitation.inviterId,
			organizationId: invitation.organizationId,
		});
		if (!member) {
			throw new APIError("BAD_REQUEST", {
				message:
					ORGANIZATION_ERROR_CODES.INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION,
			});
		}

		return ctx.json({
			...invitation,
			organizationName: organization.name,
			organizationSlug: organization.slug,
			inviterEmail: member.user.email,
		});
	},
);

export const listInvitations = createAuthEndpoint(
	"/organization/list-invitations",
	{
		method: "GET",
		use: [orgMiddleware, orgSessionMiddleware],
		query: z
			.object({
				organizationId: z
					.string({
						description: "The ID of the organization to list invitations for",
					})
					.optional(),
			})
			.optional(),
	},
	async (ctx) => {
		const session = await getSessionFromCtx(ctx);
		if (!session) {
			throw new APIError("UNAUTHORIZED", {
				message: "Not authenticated",
			});
		}
		const orgId =
			ctx.query?.organizationId || session.session.activeOrganizationId;
		if (!orgId) {
			throw new APIError("BAD_REQUEST", {
				message: "Organization ID is required",
			});
		}
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const isMember = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId: orgId,
		});
		if (!isMember) {
			throw new APIError("FORBIDDEN", {
				message: "You are not a member of this organization",
			});
		}
		const invitations = await adapter.listInvitations({
			organizationId: orgId,
		});
		return ctx.json(invitations);
	},
);
