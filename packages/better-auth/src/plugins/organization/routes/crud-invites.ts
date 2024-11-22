import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { getSessionFromCtx } from "../../../api/routes";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { type InferRolesFromOption } from "../schema";
import { APIError } from "better-call";
import type { OrganizationOptions } from "../organization";

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
				role: z.string({
					description: "The role to assign to the user",
				}) as unknown as InferRolesFromOption<O>,
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
			}),
			metadata: {
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
			if (!ctx.context.orgOptions.sendInvitationEmail) {
				ctx.context.logger.warn(
					"Invitation email is not enabled. Pass `sendInvitationEmail` to the plugin options to enable it.",
				);
				throw new APIError("BAD_REQUEST", {
					message: "Invitation email is not enabled",
				});
			}

			const session = ctx.context.session;
			const organizationId =
				ctx.body.organizationId || session.session.activeOrganizationId;
			if (!organizationId) {
				throw new APIError("BAD_REQUEST", {
					message: "Organization not found",
				});
			}
			const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});
			if (!member) {
				throw new APIError("BAD_REQUEST", {
					message: "Member not found!",
				});
			}
			const role = ctx.context.roles[member.role];
			if (!role) {
				throw new APIError("BAD_REQUEST", {
					message: "Role not found!",
				});
			}
			const canInvite = role.authorize({
				invitation: ["create"],
			});
			if (canInvite.error) {
				throw new APIError("FORBIDDEN", {
					message: "You are not allowed to invite members",
				});
			}
			const alreadyMember = await adapter.findMemberByEmail({
				email: ctx.body.email,
				organizationId: organizationId,
			});
			if (alreadyMember) {
				throw new APIError("BAD_REQUEST", {
					message: "User is already a member of this organization",
				});
			}
			const alreadyInvited = await adapter.findPendingInvitation({
				email: ctx.body.email,
				organizationId: organizationId,
			});
			if (alreadyInvited.length && !ctx.body.resend) {
				throw new APIError("BAD_REQUEST", {
					message: "User is already invited to this organization",
				});
			}
			const invitation = await adapter.createInvitation({
				invitation: {
					role: ctx.body.role as string,
					email: ctx.body.email,
					organizationId: organizationId,
				},
				user: session.user,
			});

			const organization = await adapter.findOrganizationById(organizationId);

			if (!organization) {
				throw new APIError("BAD_REQUEST", {
					message: "Organization not found",
				});
			}

			await ctx.context.orgOptions.sendInvitationEmail?.(
				{
					id: invitation.id,
					role: invitation.role as string,
					email: invitation.email,
					organization: organization,
					inviter: {
						...member,
						user: session.user,
					},
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
				message: "Invitation not found!",
			});
		}
		if (invitation.email !== session.user.email) {
			throw new APIError("FORBIDDEN", {
				message: "You are not the recipient of the invitation",
			});
		}
		const acceptedI = await adapter.updateInvitation({
			invitationId: ctx.body.invitationId,
			status: "accepted",
		});
		const member = await adapter.createMember({
			organizationId: invitation.organizationId,
			userId: session.user.id,
			role: invitation.role,
			createdAt: new Date(),
		});
		await adapter.setActiveOrganization(
			session.session.token,
			invitation.organizationId,
		);
		if (!acceptedI) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Invitation not found!",
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
		if (invitation.email !== session.user.email) {
			throw new APIError("FORBIDDEN", {
				message: "You are not the recipient of the invitation",
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
				message: "Invitation not found!",
			});
		}
		const member = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId: invitation.organizationId,
		});
		if (!member) {
			throw new APIError("BAD_REQUEST", {
				message: "Member not found!",
			});
		}
		const canCancel = ctx.context.roles[member.role].authorize({
			invitation: ["cancel"],
		});
		if (canCancel.error) {
			throw new APIError("FORBIDDEN", {
				message: "You are not allowed to cancel this invitation",
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
		if (invitation.email !== session.user.email) {
			throw new APIError("FORBIDDEN", {
				message: "You are not the recipient of the invitation",
			});
		}
		const organization = await adapter.findOrganizationById(
			invitation.organizationId,
		);
		if (!organization) {
			throw new APIError("BAD_REQUEST", {
				message: "Organization not found",
			});
		}
		const member = await adapter.findMemberByOrgId({
			userId: invitation.inviterId,
			organizationId: invitation.organizationId,
		});
		if (!member) {
			throw new APIError("BAD_REQUEST", {
				message: "Inviter is no longer a member of the organization",
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
