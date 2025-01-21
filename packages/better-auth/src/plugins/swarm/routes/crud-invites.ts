import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { getSessionFromCtx } from "../../../api/routes";
import { getSwmAdapter } from "../adapter";
import { swmMiddleware, swmSessionMiddleware } from "../call";
import { type InferRolesFromOption } from "../schema";
import { APIError } from "better-call";
import type { SwarmOptions } from "../swarm";
import { SWARM_ERROR_CODES } from "../error-codes";

export const createInvitation = <O extends SwarmOptions | undefined>(
	option: O,
) =>
	createAuthEndpoint(
		"/swarm/invite-member",
		{
			method: "POST",
			use: [swmMiddleware, swmSessionMiddleware],
			body: z.object({
				email: z.string({
					description: "The email address of the user to invite",
				}),
				role: z.string({
					description: "The role to assign to the user",
				}) as unknown as InferRolesFromOption<O>,
				swarmId: z
					.string({
						description: "The swarm ID to invite the user to",
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
					description: "Invite a user to an swarm",
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
											swarmId: {
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
											"swarmId",
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
			if (!ctx.context.swmOptions.sendInvitationEmail) {
				ctx.context.logger.warn(
					"Invitation email is not enabled. Pass `sendInvitationEmail` to the plugin options to enable it.",
				);
				throw new APIError("BAD_REQUEST", {
					message: "Invitation email is not enabled",
				});
			}

			const session = ctx.context.session;
			const swarmId =
				ctx.body.swarmId || session.session.activeSwarmId;
			if (!swarmId) {
				throw new APIError("BAD_REQUEST", {
					message: SWARM_ERROR_CODES.SWARM_NOT_FOUND,
				});
			}
			const adapter = getSwmAdapter(ctx.context, ctx.context.swmOptions);
			const member = await adapter.findMemberBySwmId({
				userId: session.user.id,
				swarmId: swarmId,
			});
			if (!member) {
				throw new APIError("BAD_REQUEST", {
					message: SWARM_ERROR_CODES.MEMBER_NOT_FOUND,
				});
			}
			const role = ctx.context.roles[member.role];
			if (!role) {
				throw new APIError("BAD_REQUEST", {
					message: SWARM_ERROR_CODES.ROLE_NOT_FOUND,
				});
			}
			const canInvite = role.authorize({
				invitation: ["create"],
			});
			if (canInvite.error) {
				throw new APIError("FORBIDDEN", {
					message:
						SWARM_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_SWARM,
				});
			}

			const creatorRole = ctx.context.swmOptions.creatorRole || "owner";

			if (member.role !== creatorRole && ctx.body.role === creatorRole) {
				throw new APIError("FORBIDDEN", {
					message:
						SWARM_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE,
				});
			}

			const alreadyMember = await adapter.findMemberByEmail({
				email: ctx.body.email,
				swarmId: swarmId,
			});
			if (alreadyMember) {
				throw new APIError("BAD_REQUEST", {
					message:
						SWARM_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_SWARM,
				});
			}
			const alreadyInvited = await adapter.findPendingInvitation({
				email: ctx.body.email,
				swarmId: swarmId,
			});
			if (alreadyInvited.length && !ctx.body.resend) {
				throw new APIError("BAD_REQUEST", {
					message:
						SWARM_ERROR_CODES.USER_IS_ALREADY_INVITED_TO_THIS_SWARM,
				});
			}

			const invitation = await adapter.createInvitation({
				invitation: {
					role: ctx.body.role as string,
					email: ctx.body.email,
					swarmId: swarmId,
				},
				user: session.user,
			});

			const swarm = await adapter.findSwarmById(swarmId);

			if (!swarm) {
				throw new APIError("BAD_REQUEST", {
					message: SWARM_ERROR_CODES.SWARM_NOT_FOUND,
				});
			}

			await ctx.context.swmOptions.sendInvitationEmail?.(
				{
					id: invitation.id,
					role: invitation.role as string,
					email: invitation.email,
					swarm: swarm,
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
	"/swarm/accept-invitation",
	{
		method: "POST",
		body: z.object({
			invitationId: z.string({
				description: "The ID of the invitation to accept",
			}),
		}),
		use: [swmMiddleware, swmSessionMiddleware],
		metadata: {
			openapi: {
				description: "Accept an invitation to an swarm",
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
		const adapter = getSwmAdapter(ctx.context, ctx.context.swmOptions);
		const invitation = await adapter.findInvitationById(ctx.body.invitationId);
		if (
			!invitation ||
			invitation.expiresAt < new Date() ||
			invitation.status !== "pending"
		) {
			throw new APIError("BAD_REQUEST", {
				message: SWARM_ERROR_CODES.INVITATION_NOT_FOUND,
			});
		}
		if (invitation.email !== session.user.email) {
			throw new APIError("FORBIDDEN", {
				message:
					SWARM_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION,
			});
		}
		const acceptedI = await adapter.updateInvitation({
			invitationId: ctx.body.invitationId,
			status: "accepted",
		});
		const member = await adapter.createMember({
			swarmId: invitation.swarmId,
			userId: session.user.id,
			role: invitation.role,
			createdAt: new Date(),
		});
		await adapter.setActiveSwarm(
			session.session.token,
			invitation.swarmId,
		);
		if (!acceptedI) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: SWARM_ERROR_CODES.INVITATION_NOT_FOUND,
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
	"/swarm/reject-invitation",
	{
		method: "POST",
		body: z.object({
			invitationId: z.string({
				description: "The ID of the invitation to reject",
			}),
		}),
		use: [swmMiddleware, swmSessionMiddleware],
		metadata: {
			openapi: {
				description: "Reject an invitation to an swarm",
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
		const adapter = getSwmAdapter(ctx.context, ctx.context.swmOptions);
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
				message:
					SWARM_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION,
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
	"/swarm/cancel-invitation",
	{
		method: "POST",
		body: z.object({
			invitationId: z.string({
				description: "The ID of the invitation to cancel",
			}),
		}),
		use: [swmMiddleware, swmSessionMiddleware],
		openapi: {
			description: "Cancel an invitation to an swarm",
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
		const adapter = getSwmAdapter(ctx.context, ctx.context.swmOptions);
		const invitation = await adapter.findInvitationById(ctx.body.invitationId);
		if (!invitation) {
			throw new APIError("BAD_REQUEST", {
				message: SWARM_ERROR_CODES.INVITATION_NOT_FOUND,
			});
		}
		const member = await adapter.findMemberBySwmId({
			userId: session.user.id,
			swarmId: invitation.swarmId,
		});
		if (!member) {
			throw new APIError("BAD_REQUEST", {
				message: SWARM_ERROR_CODES.MEMBER_NOT_FOUND,
			});
		}
		const canCancel = ctx.context.roles[member.role].authorize({
			invitation: ["cancel"],
		});
		if (canCancel.error) {
			throw new APIError("FORBIDDEN", {
				message:
					SWARM_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION,
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
	"/swarm/get-invitation",
	{
		method: "GET",
		use: [swmMiddleware],
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
										swarmId: {
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
										swarmName: {
											type: "string",
										},
										swarmSlug: {
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
										"swarmId",
										"inviterId",
										"status",
										"expiresAt",
										"swarmName",
										"swarmSlug",
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
		const adapter = getSwmAdapter(ctx.context, ctx.context.swmOptions);
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
				message:
					SWARM_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION,
			});
		}
		const swarm = await adapter.findSwarmById(
			invitation.swarmId,
		);
		if (!swarm) {
			throw new APIError("BAD_REQUEST", {
				message: SWARM_ERROR_CODES.SWARM_NOT_FOUND,
			});
		}
		const member = await adapter.findMemberBySwmId({
			userId: invitation.inviterId,
			swarmId: invitation.swarmId,
		});
		if (!member) {
			throw new APIError("BAD_REQUEST", {
				message:
					SWARM_ERROR_CODES.INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_SWARM,
			});
		}

		return ctx.json({
			...invitation,
			swarmName: swarm.name,
			swarmSlug: swarm.slug,
			inviterEmail: member.user.email,
		});
	},
);
