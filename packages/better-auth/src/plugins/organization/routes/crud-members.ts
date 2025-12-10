import { createAuthEndpoint } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { APIError } from "better-call";
import * as z from "zod";
import { getSessionFromCtx, sessionMiddleware } from "../../../api";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db";
import { toZodSchema } from "../../../db/to-zod";
import type { LiteralString } from "../../../types/helper";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { hasPermission } from "../has-permission";
import { parseRoles } from "../organization";
import type {
	InferMember,
	InferOrganizationRolesFromOption,
	Member,
} from "../schema";
import type { OrganizationOptions } from "../types";

const baseMemberSchema = z.object({
	userId: z.coerce.string().meta({
		description:
			'The user Id which represents the user to be added as a member. If `null` is provided, then it\'s expected to provide session headers. Eg: "user-id"',
	}),
	role: z.union([z.string(), z.array(z.string())]).meta({
		description:
			'The role(s) to assign to the new member. Eg: ["admin", "sale"]',
	}),
	organizationId: z
		.string()
		.meta({
			description:
				'An optional organization ID to pass. If not provided, will default to the user\'s active organization. Eg: "org-id"',
		})
		.optional(),
	teamId: z
		.string()
		.meta({
			description: 'An optional team ID to add the member to. Eg: "team-id"',
		})
		.optional(),
});

export const addMember = <O extends OrganizationOptions>(option: O) => {
	const additionalFieldsSchema = toZodSchema({
		fields: option?.schema?.member?.additionalFields || {},
		isClientSide: true,
	});
	return createAuthEndpoint(
		"/organization/add-member",
		{
			method: "POST",
			body: z.object({
				...baseMemberSchema.shape,
				...additionalFieldsSchema.shape,
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
						organizationId?: string | undefined;
					} & (O extends { teams: { enabled: true } }
						? { teamId?: string | undefined }
						: {}) &
						InferAdditionalFieldsFromPluginOptions<"member", O>,
				},
				openapi: {
					operationId: "addOrganizationMember",
					description: "Add a member to an organization",
				},
			},
		},
		async (ctx) => {
			const session = ctx.body.userId
				? await getSessionFromCtx<{
						session: {
							activeOrganizationId?: string | undefined;
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

			const teamId =
				"teamId" in ctx.body ? (ctx.body.teamId as string) : undefined;
			if (teamId && !ctx.context.orgOptions.teams?.enabled) {
				ctx.context.logger.error("Teams are not enabled");
				throw new APIError("BAD_REQUEST", {
					message: "Teams are not enabled",
				});
			}

			const adapter = getOrgAdapter<O>(ctx.context, option);

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
			const count = await adapter.countMembers({ organizationId: orgId });

			if (count >= membershipLimit) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED,
				});
			}

			const {
				role: _,
				userId: __,
				organizationId: ___,
				...additionalFields
			} = ctx.body;

			const organization = await adapter.findOrganizationById(orgId);
			if (!organization) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}

			let memberData = {
				organizationId: orgId,
				userId: user.id,
				role: parseRoles(ctx.body.role),
				createdAt: new Date(),
				...(additionalFields ? additionalFields : {}),
			};

			// Run beforeAddMember hook
			if (option?.organizationHooks?.beforeAddMember) {
				const response = await option?.organizationHooks.beforeAddMember({
					member: {
						userId: user.id,
						organizationId: orgId,
						role: parseRoles(ctx.body.role as string | string[]),
						...additionalFields,
					},
					user,
					organization,
				});
				if (response && typeof response === "object" && "data" in response) {
					memberData = {
						...memberData,
						...response.data,
					};
				}
			}

			const createdMember = await adapter.createMember(memberData);

			if (teamId) {
				await adapter.findOrCreateTeamMember({
					userId: user.id,
					teamId,
				});
			}

			// Run afterAddMember hook
			if (option?.organizationHooks?.afterAddMember) {
				await option?.organizationHooks.afterAddMember({
					member: createdMember,
					user,
					organization,
				});
			}

			return ctx.json(createdMember);
		},
	);
};

const removeMemberBodySchema = z.object({
	memberIdOrEmail: z.string().meta({
		description: "The ID or email of the member to remove",
	}),
	/**
	 * If not provided, the active organization will be used
	 */
	organizationId: z
		.string()
		.meta({
			description:
				'The ID of the organization to remove the member from. If not provided, the active organization will be used. Eg: "org-id"',
		})
		.optional(),
});

export const removeMember = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/remove-member",
		{
			method: "POST",
			body: removeMemberBodySchema,
			requireHeaders: true,
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
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});
			if (!member) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
				});
			}
			let toBeRemovedMember: InferMember<O, false> | null = null;
			if (ctx.body.memberIdOrEmail.includes("@")) {
				toBeRemovedMember = await adapter.findMemberByEmail({
					email: ctx.body.memberIdOrEmail,
					organizationId: organizationId,
				});
			} else {
				const result = await adapter.findMemberById(ctx.body.memberIdOrEmail);
				if (!result) toBeRemovedMember = null;
				else {
					const { user: _user, ...member } = result;
					toBeRemovedMember = member as unknown as InferMember<O, false>;
				}
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
				const { members } = await adapter.listMembers({
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
			const canDeleteMember = await hasPermission(
				{
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: {
						member: ["delete"],
					},
					organizationId,
				},
				ctx,
			);

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

			const organization = await adapter.findOrganizationById(organizationId);
			if (!organization) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}

			const userBeingRemoved = await ctx.context.internalAdapter.findUserById(
				toBeRemovedMember.userId,
			);
			if (!userBeingRemoved) {
				throw new APIError("BAD_REQUEST", {
					message: "User not found",
				});
			}

			// Run beforeRemoveMember hook
			if (options?.organizationHooks?.beforeRemoveMember) {
				await options?.organizationHooks.beforeRemoveMember({
					member: toBeRemovedMember,
					user: userBeingRemoved,
					organization,
				});
			}
			await adapter.deleteMember({
				memberId: toBeRemovedMember.id,
				organizationId: organizationId,
				userId: toBeRemovedMember.userId,
			});
			if (
				session.user.id === toBeRemovedMember.userId &&
				session.session.activeOrganizationId ===
					toBeRemovedMember.organizationId
			) {
				await adapter.setActiveOrganization(session.session.token, null, ctx);
			}

			// Run afterRemoveMember hook
			if (options?.organizationHooks?.afterRemoveMember) {
				await options?.organizationHooks.afterRemoveMember({
					member: toBeRemovedMember,
					user: userBeingRemoved,
					organization,
				});
			}

			return ctx.json({
				member: toBeRemovedMember,
			});
		},
	);

const updateMemberRoleBodySchema = z.object({
	role: z.union([z.string(), z.array(z.string())]).meta({
		description:
			'The new role to be applied. This can be a string or array of strings representing the roles. Eg: ["admin", "sale"]',
	}),
	memberId: z.string().meta({
		description: 'The member id to apply the role update to. Eg: "member-id"',
	}),
	organizationId: z
		.string()
		.meta({
			description:
				'An optional organization ID which the member is a part of to apply the role update. If not provided, you must provide session headers to get the active organization. Eg: "organization-id"',
		})
		.optional(),
});

export const updateMemberRole = <O extends OrganizationOptions>(option: O) =>
	createAuthEndpoint(
		"/organization/update-member-role",
		{
			method: "POST",
			body: updateMemberRoleBodySchema,
			use: [orgMiddleware, orgSessionMiddleware],
			requireHeaders: true,
			metadata: {
				$Infer: {
					body: {} as {
						role:
							| InferOrganizationRolesFromOption<O>
							| InferOrganizationRolesFromOption<O>[]
							| LiteralString
							| LiteralString[];
						memberId: string;
						/**
						 * If not provided, the active organization will be used
						 */
						organizationId?: string | undefined;
					},
				},
				openapi: {
					operationId: "updateOrganizationMemberRole",
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
				? ctx.body.role
				: ctx.body.role
					? [ctx.body.role]
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

			const memberBelongsToOrganization =
				toBeUpdatedMember.organizationId === organizationId;

			if (!memberBelongsToOrganization) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER,
				});
			}

			const creatorRole = ctx.context.orgOptions?.creatorRole || "owner";

			const updatingMemberRoles = member.role.split(",");
			const toBeUpdatedMemberRoles = toBeUpdatedMember.role.split(",");

			const isUpdatingCreator = toBeUpdatedMemberRoles.includes(creatorRole);
			const updaterIsCreator = updatingMemberRoles.includes(creatorRole);

			const isSettingCreatorRole = roleToSet.includes(creatorRole);

			const memberIsUpdatingThemselves = member.id === toBeUpdatedMember.id;

			if (
				(isUpdatingCreator && !updaterIsCreator) ||
				(isSettingCreatorRole && !updaterIsCreator)
			) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER,
				});
			}

			if (updaterIsCreator && memberIsUpdatingThemselves) {
				const members = await ctx.context.adapter.findMany<Member>({
					model: "member",
					where: [
						{
							field: "organizationId",
							value: organizationId,
						},
					],
				});
				const owners = members.filter((member: Member) => {
					const roles = member.role.split(",");
					return roles.includes(creatorRole);
				});
				if (owners.length <= 1 && !isSettingCreatorRole) {
					throw new APIError("BAD_REQUEST", {
						message:
							ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER,
					});
				}
			}

			const canUpdateMember = await hasPermission(
				{
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: {
						member: ["update"],
					},
					allowCreatorAllPermissions: true,
					organizationId,
				},
				ctx,
			);

			if (!canUpdateMember) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER,
				});
			}

			const organization = await adapter.findOrganizationById(organizationId);
			if (!organization) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}

			const userBeingUpdated = await ctx.context.internalAdapter.findUserById(
				toBeUpdatedMember.userId,
			);
			if (!userBeingUpdated) {
				throw new APIError("BAD_REQUEST", {
					message: "User not found",
				});
			}

			const previousRole = toBeUpdatedMember.role;
			const newRole = parseRoles(ctx.body.role as string | string[]);

			// Run beforeUpdateMemberRole hook
			if (option?.organizationHooks?.beforeUpdateMemberRole) {
				const response = await option?.organizationHooks.beforeUpdateMemberRole(
					{
						member: toBeUpdatedMember,
						newRole,
						user: userBeingUpdated,
						organization,
					},
				);
				if (response && typeof response === "object" && "data" in response) {
					// Allow the hook to modify the role
					const updatedMember = await adapter.updateMember(
						ctx.body.memberId,
						response.data.role || newRole,
					);
					if (!updatedMember) {
						throw new APIError("BAD_REQUEST", {
							message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
						});
					}

					// Run afterUpdateMemberRole hook
					if (option?.organizationHooks?.afterUpdateMemberRole) {
						await option?.organizationHooks.afterUpdateMemberRole({
							member: updatedMember,
							previousRole,
							user: userBeingUpdated,
							organization,
						});
					}

					return ctx.json(updatedMember);
				}
			}

			const updatedMember = await adapter.updateMember(
				ctx.body.memberId,
				newRole,
			);
			if (!updatedMember) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
				});
			}

			// Run afterUpdateMemberRole hook
			if (option?.organizationHooks?.afterUpdateMemberRole) {
				await option?.organizationHooks.afterUpdateMemberRole({
					member: updatedMember,
					previousRole,
					user: userBeingUpdated,
					organization,
				});
			}

			return ctx.json(updatedMember);
		},
	);

export const getActiveMember = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/get-active-member",
		{
			method: "GET",
			use: [orgMiddleware, orgSessionMiddleware],
			requireHeaders: true,
			metadata: {
				openapi: {
					description: "Get the member details of the active organization",
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
			const adapter = getOrgAdapter<O>(ctx.context, options);
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

const leaveOrganizationBodySchema = z.object({
	organizationId: z.string().meta({
		description:
			'The organization Id for the member to leave. Eg: "organization-id"',
	}),
});

export const leaveOrganization = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/leave",
		{
			method: "POST",
			body: leaveOrganizationBodySchema,
			requireHeaders: true,
			use: [sessionMiddleware, orgMiddleware],
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: ctx.body.organizationId,
			});

			if (!member) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
				});
			}
			const creatorRole = ctx.context.orgOptions?.creatorRole || "owner";
			const isOwnerLeaving = member.role.split(",").includes(creatorRole);
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
				const owners = members.filter((member) =>
					member.role.split(",").includes(creatorRole),
				);
				if (owners.length <= 1) {
					throw new APIError("BAD_REQUEST", {
						message:
							ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER,
					});
				}
			}
			await adapter.deleteMember({
				memberId: member.id,
				organizationId: ctx.body.organizationId,
				userId: session.user.id,
			});
			if (session.session.activeOrganizationId === ctx.body.organizationId) {
				await adapter.setActiveOrganization(session.session.token, null, ctx);
			}
			return ctx.json(member);
		},
	);

export const listMembers = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/list-members",
		{
			method: "GET",
			query: z
				.object({
					limit: z
						.string()
						.meta({
							description: "The number of users to return",
						})
						.or(z.number())
						.optional(),
					offset: z
						.string()
						.meta({
							description: "The offset to start from",
						})
						.or(z.number())
						.optional(),
					sortBy: z
						.string()
						.meta({
							description: "The field to sort by",
						})
						.optional(),
					sortDirection: z
						.enum(["asc", "desc"])
						.meta({
							description: "The direction to sort by",
						})
						.optional(),
					filterField: z
						.string()
						.meta({
							description: "The field to filter by",
						})
						.optional(),
					filterValue: z
						.string()
						.meta({
							description: "The value to filter by",
						})
						.or(z.number())
						.or(z.boolean())
						.optional(),
					filterOperator: z
						.enum(["eq", "ne", "lt", "lte", "gt", "gte", "contains"])
						.meta({
							description: "The operator to use for the filter",
						})
						.optional(),
					organizationId: z
						.string()
						.meta({
							description:
								'The organization ID to list members for. If not provided, will default to the user\'s active organization. Eg: "organization-id"',
						})
						.optional(),
					organizationSlug: z
						.string()
						.meta({
							description:
								'The organization slug to list members for. If not provided, will default to the user\'s active organization. Eg: "organization-slug"',
						})
						.optional(),
				})
				.optional(),
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
		},
		async (ctx) => {
			const session = ctx.context.session;
			let organizationId =
				ctx.query?.organizationId || session.session.activeOrganizationId;
			const adapter = getOrgAdapter<O>(ctx.context, options);
			if (ctx.query?.organizationSlug) {
				const organization = await adapter.findOrganizationBySlug(
					ctx.query?.organizationSlug,
				);
				if (!organization) {
					throw new APIError("BAD_REQUEST", {
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					});
				}
				organizationId = organization.id;
			}
			if (!organizationId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}

			const isMember = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId,
			});
			if (!isMember) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}
			const { members, total } = await adapter.listMembers({
				organizationId,
				limit: ctx.query?.limit ? Number(ctx.query.limit) : undefined,
				offset: ctx.query?.offset ? Number(ctx.query.offset) : undefined,
				sortBy: ctx.query?.sortBy,
				sortOrder: ctx.query?.sortDirection,
				filter: ctx.query?.filterField
					? {
							field: ctx.query?.filterField,
							operator: ctx.query.filterOperator,
							value: ctx.query.filterValue,
						}
					: undefined,
			});
			return ctx.json({
				members,
				total,
			});
		},
	);

const getActiveMemberRoleQuerySchema = z
	.object({
		userId: z
			.string()
			.meta({
				description:
					"The user ID to get the role for. If not provided, will default to the current user's",
			})
			.optional(),
		organizationId: z
			.string()
			.meta({
				description:
					'The organization ID to list members for. If not provided, will default to the user\'s active organization. Eg: "organization-id"',
			})
			.optional(),
		organizationSlug: z
			.string()
			.meta({
				description:
					'The organization slug to list members for. If not provided, will default to the user\'s active organization. Eg: "organization-slug"',
			})
			.optional(),
	})
	.optional();

export const getActiveMemberRole = <O extends OrganizationOptions>(
	options: O,
) =>
	createAuthEndpoint(
		"/organization/get-active-member-role",
		{
			method: "GET",
			query: getActiveMemberRoleQuerySchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
		},
		async (ctx) => {
			const session = ctx.context.session;
			let organizationId =
				ctx.query?.organizationId || session.session.activeOrganizationId;
			const adapter = getOrgAdapter<O>(ctx.context, options);
			if (ctx.query?.organizationSlug) {
				const organization = await adapter.findOrganizationBySlug(
					ctx.query?.organizationSlug,
				);
				if (!organization) {
					throw new APIError("BAD_REQUEST", {
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					});
				}
				organizationId = organization.id;
			}
			if (!organizationId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}
			const isMember = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId,
			});
			if (!isMember) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}
			if (!ctx.query?.userId) {
				return ctx.json({
					role: isMember.role,
				});
			}
			const userIdToGetRole = ctx.query?.userId;
			const member = await adapter.findMemberByOrgId({
				userId: userIdToGetRole,
				organizationId,
			});
			if (!member) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}

			return ctx.json({
				role: member?.role,
			});
		},
	);
