import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import type { InferRolesFromOption, Member } from "../schema";
import { APIError } from "better-call";
import { generateId } from "../../../utils";
import type { OrganizationOptions } from "../organization";
import { getSessionFromCtx, sessionMiddleware } from "../../../api";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { BASE_ERROR_CODES } from "../../../error/codes";

export const addMember = <O extends OrganizationOptions>() =>
	createAuthEndpoint(
		"/organization/add-member",
		{
			method: "POST",
			body: z.object({
				userId: z.string(),
				role: z.string() as unknown as InferRolesFromOption<O>,
				organizationId: z.string().optional(),
			}),
			use: [orgMiddleware],
			metadata: {
				SERVER_ONLY: true,
			},
		},
		async (ctx) => {
			const session = ctx.body.userId
				? await getSessionFromCtx<{
						session: {
							activeOrganizationId?: string;
						};
					}>(ctx).catch((e) => null)
				: null;
			const orgId =
				ctx.body.organizationId || session?.session.activeOrganizationId;
			if (!orgId) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
				});
			}

			const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);

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
				organizationId: orgId,
			});
			if (alreadyMember) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}

			const createdMember = await adapter.createMember({
				id: generateId(),
				organizationId: orgId,
				userId: user.id,
				role: ctx.body.role as string,
				createdAt: new Date(),
			});

			return ctx.json(createdMember);
		},
	);

export const removeMember = createAuthEndpoint(
	"/organization/remove-member",
	{
		method: "POST",
		body: z.object({
			memberIdOrEmail: z.string({
				description: "The ID or email of the member to remove",
			}),
			/**
			 * If not provided, the active organization will be used
			 */
			organizationId: z
				.string({
					description:
						"The ID of the organization to remove the member from. If not provided, the active organization will be used",
				})
				.optional(),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
		metadata: {
			openapi: {
				description: "Remove a member from an organization",
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
												organizationId: {
													type: "string",
												},
												role: {
													type: "string",
												},
											},
											required: ["id", "userId", "organizationId", "role"],
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
		const organizationId =
			ctx.body.organizationId || session.session.activeOrganizationId;
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
			organizationId: organizationId,
		});
		if (!member) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
			});
		}
		let toBeRemovedMember: Member | null = null;
		if (ctx.body.memberIdOrEmail.includes("@")) {
			toBeRemovedMember = await adapter.findMemberByEmail({
				email: ctx.body.memberIdOrEmail,
				organizationId: organizationId,
			});
		} else {
			toBeRemovedMember = await adapter.findMemberById(
				ctx.body.memberIdOrEmail,
			);
		}
		if (!toBeRemovedMember) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
			});
		}
		const role = ctx.context.authorize
			? { authorize: ctx.context.authorize }
			: ctx.context.roles[member.role];
		if (!role) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
			});
		}

		const isLeaving =
			session.user.email === ctx.body.memberIdOrEmail ||
			member.id === ctx.body.memberIdOrEmail;
		const isOwner =
			toBeRemovedMember.role ===
			(ctx.context.orgOptions?.creatorRole || "owner");
		if (isOwner) {
			throw new APIError("BAD_REQUEST", {
				message:
					ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER,
			});
		}
		const canDeleteMember =
			isLeaving ||
			(
				await role.authorize(
					{
						member: ["delete"],
					},
					member.role,
				)
			).success;
		if (!canDeleteMember) {
			throw new APIError("UNAUTHORIZED", {
				message:
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER,
			});
		}

		if (toBeRemovedMember?.organizationId !== organizationId) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
			});
		}
		await adapter.deleteMember(toBeRemovedMember.id);
		if (
			session.user.id === toBeRemovedMember.userId &&
			session.session.activeOrganizationId === toBeRemovedMember.organizationId
		) {
			await adapter.setActiveOrganization(session.session.token, null);
		}
		return ctx.json({
			member: toBeRemovedMember,
		});
	},
);

export const updateMemberRole = <O extends OrganizationOptions>(option: O) =>
	createAuthEndpoint(
		"/organization/update-member-role",
		{
			method: "POST",
			body: z.object({
				role: z.string() as unknown as InferRolesFromOption<O>,
				memberId: z.string(),
				/**
				 * If not provided, the active organization will be used
				 */
				organizationId: z.string().optional(),
			}),
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				openapi: {
					description: "Update the role of a member in an organization",
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
													organizationId: {
														type: "string",
													},
													role: {
														type: "string",
													},
												},
												required: ["id", "userId", "organizationId", "role"],
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
			const organizationId =
				ctx.body.organizationId || session.session.activeOrganizationId;
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
				organizationId: organizationId,
			});
			if (!member) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
					},
				});
			}
			const toBeUpdatedMember =
				member.role !== ctx.body.memberId
					? await adapter.findMemberById(ctx.body.memberId)
					: member;
			if (!toBeUpdatedMember) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
					},
				});
			}
			const role = ctx.context.authorize
				? { authorize: ctx.context.authorize }
				: ctx.context.roles[member.role];
			if (!role) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
					},
				});
			}
			const creatorRole = ctx.context.orgOptions?.creatorRole || "owner";
			if (
				toBeUpdatedMember.role === creatorRole ||
				(ctx.body.role === creatorRole && member.role !== creatorRole)
			) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: "You are not allowed to update this member",
					},
				});
			}
			/**
			 * If the member is not an owner, they cannot update the role of another member
			 * as an owner.
			 */
			const hasPermission = await role.authorize(
				{
					member: ["update"],
				},
				member.role,
			);
			if (hasPermission.error) {
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
						message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
					},
				});
			}
			return ctx.json(updatedMember);
		},
	);

export const getActiveMember = createAuthEndpoint(
	"/organization/get-active-member",
	{
		method: "GET",
		use: [orgMiddleware, orgSessionMiddleware],
		metadata: {
			openapi: {
				description: "Get the active member in the organization",
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
										organizationId: {
											type: "string",
										},
										role: {
											type: "string",
										},
									},
									required: ["id", "userId", "organizationId", "role"],
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
		const organizationId = session.session.activeOrganizationId;
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
			organizationId: organizationId,
		});
		if (!member) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
				},
			});
		}
		return ctx.json(member);
	},
);

export const leaveOrganization = createAuthEndpoint(
	"/organization/leave",
	{
		method: "POST",
		body: z.object({
			organizationId: z.string(),
		}),
		use: [sessionMiddleware, orgMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session;
		const adapter = getOrgAdapter(ctx.context);
		const member = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId: ctx.body.organizationId,
		});
		if (!member) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
			});
		}
		const isOwnerLeaving =
			member.role === (ctx.context.orgOptions?.creatorRole || "owner");
		if (isOwnerLeaving) {
			const members = await ctx.context.adapter.findMany<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: ctx.body.organizationId,
					},
				],
			});
			const owners = members.filter(
				(member) =>
					member.role === (ctx.context.orgOptions?.creatorRole || "owner"),
			);
			if (owners.length <= 1) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER,
				});
			}
		}
		await adapter.deleteMember(member.id);
		if (session.session.activeOrganizationId === ctx.body.organizationId) {
			await adapter.setActiveOrganization(session.session.token, null);
		}
		return ctx.json(member);
	},
);
