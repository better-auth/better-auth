import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import type { InferOrganizationRolesFromOption, Member } from "../schema";
import { APIError } from "better-call";
import { parseRoles, type OrganizationOptions } from "../organization";
import { getSessionFromCtx, sessionMiddleware } from "../../../api";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { BASE_ERROR_CODES } from "../../../error/codes";
import { hasPermission } from "../has-permission";

export const addMember = <O extends OrganizationOptions>() =>
	createAuthEndpoint(
		"/organization/add-member",
		{
			method: "POST",
			body: z.object({
				userId: z.coerce.string(),
				role: z.union([z.string(), z.array(z.string())]),
				organizationId: z.string().optional(),
			}),
			use: [orgMiddleware],
			metadata: {
				SERVER_ONLY: true,
				$Infer: {
					body: {} as {
						userId: string;
						role:
							| InferOrganizationRolesFromOption<O>
							| InferOrganizationRolesFromOption<O>[];
						organizationId?: string;
					} & (O extends { teams: { enabled: true } }
						? { teamId?: string }
						: {}),
				},
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

			const teamId = "teamId" in ctx.body ? ctx.body.teamId : undefined;
			if (teamId && !ctx.context.orgOptions.teams?.enabled) {
				ctx.context.logger.error("Teams are not enabled");
				throw new APIError("BAD_REQUEST", {
					message: "Teams are not enabled",
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

			if (teamId) {
				const team = await adapter.findTeamById({
					teamId,
					organizationId: orgId,
				});
				if (!team || team.organizationId !== orgId) {
					throw new APIError("BAD_REQUEST", {
						message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND,
					});
				}
			}

			const membershipLimit = ctx.context.orgOptions?.membershipLimit || 100;
			const members = await adapter.listMembers({ organizationId: orgId });

			if (members.length >= membershipLimit) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED,
				});
			}

			const createdMember = await adapter.createMember({
				organizationId: orgId,
				userId: user.id,
				role: parseRoles(ctx.body.role as string | string[]),
				createdAt: new Date(),
				...(teamId ? { teamId: teamId } : {}),
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
		const roles = toBeRemovedMember.role.split(",");
		const creatorRole = ctx.context.orgOptions?.creatorRole || "owner";
		const isOwner = roles.includes(creatorRole);
		if (isOwner) {
			if (member.role !== creatorRole) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER,
				});
			}
			const members = await adapter.listMembers({
				organizationId: organizationId,
			});
			const owners = members.filter((member) => {
				const roles = member.role.split(",");
				return roles.includes(creatorRole);
			});
			if (owners.length <= 1) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER,
				});
			}
		}
		const canDeleteMember = hasPermission({
			role: member.role,
			options: ctx.context.orgOptions,
			permissions: {
				member: ["delete"],
			},
		});
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
				role: z.union([z.string(), z.array(z.string())]),
				memberId: z.string(),
				organizationId: z.string().optional(),
			}),
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as {
						role:
							| InferOrganizationRolesFromOption<O>
							| InferOrganizationRolesFromOption<O>[];
						memberId: string;
						/**
						 * If not provided, the active organization will be used
						 */
						organizationId?: string;
					},
				},
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

			if (!ctx.body.role) {
				throw new APIError("BAD_REQUEST");
			}

			const organizationId =
				ctx.body.organizationId || session.session.activeOrganizationId;

			if (!organizationId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}

			const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const roleToSet: string[] = Array.isArray(ctx.body.role)
				? (ctx.body.role as string[])
				: ctx.body.role
					? [ctx.body.role as string]
					: [];

			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});

			if (!member) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
				});
			}

			const toBeUpdatedMember =
				member.id !== ctx.body.memberId
					? await adapter.findMemberById(ctx.body.memberId)
					: member;

			if (!toBeUpdatedMember) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
				});
			}

			const toBeUpdatedMemberRoles = toBeUpdatedMember.role.split(",");
			const updatingMemberRoles = member.role.split(",");
			const creatorRole = ctx.context.orgOptions?.creatorRole || "owner";

			if (
				(toBeUpdatedMemberRoles.includes(creatorRole) &&
					!updatingMemberRoles.includes(creatorRole)) ||
				(roleToSet.includes(creatorRole) &&
					!updatingMemberRoles.includes(creatorRole))
			) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER,
				});
			}

			const canUpdateMember = hasPermission({
				role: member.role,
				options: ctx.context.orgOptions,
				permissions: {
					member: ["update"],
				},
			});

			if (!canUpdateMember) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER,
				});
			}
			const updatedMember = await adapter.updateMember(
				ctx.body.memberId,
				parseRoles(ctx.body.role as string | string[]),
			);
			if (!updatedMember) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
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
