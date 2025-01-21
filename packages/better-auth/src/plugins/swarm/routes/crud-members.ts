import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { getSwmAdapter } from "../adapter";
import { swmMiddleware, swmSessionMiddleware } from "../call";
import type { InferRolesFromOption, Member } from "../schema";
import { APIError } from "better-call";
import { generateId } from "../../../utils";
import type { SwarmOptions } from "../swarm";
import { getSessionFromCtx } from "../../../api";
import { SWARM_ERROR_CODES } from "../error-codes";
import { BASE_ERROR_CODES } from "../../../error/codes";

export const addMember = <O extends SwarmOptions>() =>
	createAuthEndpoint(
		"/swarm/add-member",
		{
			method: "POST",
			body: z.object({
				userId: z.string(),
				role: z.string() as unknown as InferRolesFromOption<O>,
				swarmId: z.string().optional(),
			}),
			use: [swmMiddleware],
			metadata: {
				SERVER_ONLY: true,
			},
		},
		async (ctx) => {
			const session = ctx.body.userId
				? await getSessionFromCtx<{
						session: {
							activeSwarmId?: string;
						};
					}>(ctx).catch((e) => null)
				: null;
			const swmId =
				ctx.body.swarmId || session?.session.activeSwarmId;
			if (!swmId) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: SWARM_ERROR_CODES.NO_ACTIVE_SWARM,
					},
				});
			}

			const adapter = getSwmAdapter(ctx.context, ctx.context.swmOptions);

			const user = await ctx.context.internalAdapter.findUserById(
				ctx.body.userId,
			);

			if (!user) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.USER_NOT_FOUND,
				});
			}

			const alreadyMember = await adapter.findMemberByEmail({
				email: user.email,
				swarmId: swmId,
			});
			if (alreadyMember) {
				throw new APIError("BAD_REQUEST", {
					message:
						SWARM_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_SWARM,
				});
			}

			const createdMember = await adapter.createMember({
				id: generateId(),
				swarmId: swmId,
				userId: user.id,
				role: ctx.body.role as string,
				createdAt: new Date(),
			});

			return ctx.json(createdMember);
		},
	);

export const removeMember = createAuthEndpoint(
	"/swarm/remove-member",
	{
		method: "POST",
		body: z.object({
			memberIdOrEmail: z.string({
				description: "The ID or email of the member to remove",
			}),
			/**
			 * If not provided, the active swarm will be used
			 */
			swarmId: z
				.string({
					description:
						"The ID of the swarm to remove the member from. If not provided, the active swarm will be used",
				})
				.optional(),
		}),
		use: [swmMiddleware, swmSessionMiddleware],
		metadata: {
			openapi: {
				description: "Remove a member from an swarm",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										member: {
											type: "object",
											properties: {
												id: {
													type: "string",
												},
												userId: {
													type: "string",
												},
												swarmId: {
													type: "string",
												},
												role: {
													type: "string",
												},
											},
											required: ["id", "userId", "swarmId", "role"],
										},
									},
									required: ["member"],
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
		const swarmId =
			ctx.body.swarmId || session.session.activeSwarmId;
		if (!swarmId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: SWARM_ERROR_CODES.NO_ACTIVE_SWARM,
				},
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
		const isLeaving =
			session.user.email === ctx.body.memberIdOrEmail ||
			member.id === ctx.body.memberIdOrEmail;
		const isOwnerLeaving =
			isLeaving &&
			member.role === (ctx.context.swmOptions?.creatorRole || "owner");
		if (isOwnerLeaving) {
			throw new APIError("BAD_REQUEST", {
				message:
					SWARM_ERROR_CODES.YOU_CANNOT_LEAVE_THE_SWARM_AS_THE_ONLY_OWNER,
			});
		}

		const canDeleteMember =
			isLeaving ||
			role.authorize({
				member: ["delete"],
			}).success;
		if (!canDeleteMember) {
			throw new APIError("UNAUTHORIZED", {
				message:
					SWARM_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER,
			});
		}
		let existing: Member | null = null;
		if (ctx.body.memberIdOrEmail.includes("@")) {
			existing = await adapter.findMemberByEmail({
				email: ctx.body.memberIdOrEmail,
				swarmId: swarmId,
			});
		} else {
			existing = await adapter.findMemberById(ctx.body.memberIdOrEmail);
		}
		if (existing?.swarmId !== swarmId) {
			throw new APIError("BAD_REQUEST", {
				message: SWARM_ERROR_CODES.MEMBER_NOT_FOUND,
			});
		}
		await adapter.deleteMember(existing.id);
		if (
			session.user.id === existing.userId &&
			session.session.activeSwarmId === existing.swarmId
		) {
			await adapter.setActiveSwarm(session.session.token, null);
		}
		return ctx.json({
			member: existing,
		});
	},
);

export const updateMemberRole = <O extends SwarmOptions>(option: O) =>
	createAuthEndpoint(
		"/swarm/update-member-role",
		{
			method: "POST",
			body: z.object({
				role: z.string() as unknown as InferRolesFromOption<O>,
				memberId: z.string(),
				/**
				 * If not provided, the active swarm will be used
				 */
				swarmId: z.string().optional(),
			}),
			use: [swmMiddleware, swmSessionMiddleware],
			metadata: {
				openapi: {
					description: "Update the role of a member in an swarm",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											member: {
												type: "object",
												properties: {
													id: {
														type: "string",
													},
													userId: {
														type: "string",
													},
													swarmId: {
														type: "string",
													},
													role: {
														type: "string",
													},
												},
												required: ["id", "userId", "swarmId", "role"],
											},
										},
										required: ["member"],
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
			const swarmId =
				ctx.body.swarmId || session.session.activeSwarmId;
			if (!swarmId) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: SWARM_ERROR_CODES.NO_ACTIVE_SWARM,
					},
				});
			}
			const adapter = getSwmAdapter(ctx.context, ctx.context.swmOptions);
			const member = await adapter.findMemberBySwmId({
				userId: session.user.id,
				swarmId: swarmId,
			});
			if (!member) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: SWARM_ERROR_CODES.MEMBER_NOT_FOUND,
					},
				});
			}
			const role = ctx.context.roles[member.role];
			if (!role) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: SWARM_ERROR_CODES.ROLE_NOT_FOUND,
					},
				});
			}
			/**
			 * If the member is not an owner, they cannot update the role of another member
			 * as an owner.
			 */
			const canUpdateMember =
				role.authorize({
					member: ["update"],
				}).error ||
				(ctx.body.role === "owner" && member.role !== "owner");
			if (canUpdateMember) {
				return ctx.json(null, {
					body: {
						message: "You are not allowed to update this member",
					},
					status: 403,
				});
			}

			const updatedMember = await adapter.updateMember(
				ctx.body.memberId,
				ctx.body.role as string,
			);
			if (!updatedMember) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: SWARM_ERROR_CODES.MEMBER_NOT_FOUND,
					},
				});
			}
			return ctx.json(updatedMember);
		},
	);

export const getActiveMember = createAuthEndpoint(
	"/swarm/get-active-member",
	{
		method: "GET",
		use: [swmMiddleware, swmSessionMiddleware],
		metadata: {
			openapi: {
				description: "Get the active member in the swarm",
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
										userId: {
											type: "string",
										},
										swarmId: {
											type: "string",
										},
										role: {
											type: "string",
										},
									},
									required: ["id", "userId", "swarmId", "role"],
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
		const swarmId = session.session.activeSwarmId;
		if (!swarmId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: SWARM_ERROR_CODES.NO_ACTIVE_SWARM,
				},
			});
		}
		const adapter = getSwmAdapter(ctx.context, ctx.context.swmOptions);
		const member = await adapter.findMemberBySwmId({
			userId: session.user.id,
			swarmId: swarmId,
		});
		if (!member) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: SWARM_ERROR_CODES.MEMBER_NOT_FOUND,
				},
			});
		}
		return ctx.json(member);
	},
);
