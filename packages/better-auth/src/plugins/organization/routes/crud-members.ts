import * as z from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import type { InferOrganizationRolesFromOption, Member } from "../schema";
import { APIError } from "better-call";
import { parseRoles } from "../organization";
import { getSessionFromCtx, sessionMiddleware } from "../../../api";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { BASE_ERROR_CODES } from "../../../error/codes";
import { hasPermission } from "../has-permission";
import type { OrganizationOptions } from "../types";
import { toZodSchema } from "../../../db/to-zod";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db";
import type { LiteralString } from "../../../types/helper";

export const addMember = <O extends OrganizationOptions>(option: O) => {
	const additionalFieldsSchema = toZodSchema({
		fields: option?.schema?.member?.additionalFields || {},
		isClientSide: true,
	});
	const baseSchema = z.object({
		userId: z.coerce
			.string()
			.describe(
				"The user Id which represents the user to be added as a member",
			),
		role: z
			.union([z.string(), z.array(z.string())])
			.describe("The role(s) to assign to the new member"),
		organizationId: z
			.string()
			.describe(
				"An optional organization ID to pass. If not provided, will default to the user",
			)
			.optional(),
		teamId: z
			.string()
			.describe("An optional team ID to add the member to")
			.optional(),
	});
	return createAuthEndpoint(
		"/organization/add-member",
		{
			method: "POST",
			body: z.object({
				...baseSchema.shape,
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
						organizationId?: string;
					} & (O extends { teams: { enabled: true } }
						? { teamId?: string }
						: {}) &
						InferAdditionalFieldsFromPluginOptions<"member", O>,
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
				role: parseRoles(ctx.body.role as string | string[]),
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

export const removeMember = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/remove-member",
		{
			method: "POST",
			body: z.object({
				memberIdOrEmail: z
					.string()
					.describe("The ID or email of the member to remove"),
				/**
				 * If not provided, the active organization will be used
				 */
				organizationId: z
					.string()
					.describe(
						"The ID of the organization to remove the member from. If not provided, the active organization will be used",
					)
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
				const { members } = await adapter.listMembers({
					organizationId: organizationId,
				});
				const owners = members.filter((member: Member) => {
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

			await adapter.deleteMember(toBeRemovedMember.id);
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

export const updateMemberRole = <O extends OrganizationOptions>(option: O) =>
	createAuthEndpoint(
		"/organization/update-member-role",
		{
			method: "POST",
			body: z.object({
				role: z
					.union([z.string(), z.array(z.string())])
					.describe(
						"The new role to be applied. This can be a string or array of strings representing the roles. Eg: [",
					),
				memberId: z
					.string()
					.describe("The member id to apply the role update to"),
				organizationId: z
					.string()
					.describe(
						"An optional organization ID which the member is a part of to apply the role update. If not provided, you must provide session headers to get the active organization",
					)
					.optional(),
			}),
			use: [orgMiddleware, orgSessionMiddleware],
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

export const leaveOrganization = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/leave",
		{
			method: "POST",
			body: z.object({
				organizationId: z
					.string()
					.describe("The organization Id for the member to leave"),
			}),
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
			await adapter.deleteMember(member.id);
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
						.describe("The number of users to return")
						.or(z.number())
						.optional(),
					offset: z
						.string()
						.describe("The offset to start from")
						.or(z.number())
						.optional(),
					sortBy: z.string().describe("The field to sort by").optional(),
					sortDirection: z
						.enum(["asc", "desc"])
						.describe("The direction to sort by")
						.optional(),
					filterField: z.string().describe("The field to filter by").optional(),
					filterValue: z
						.string()
						.describe("The value to filter by")
						.or(z.number())
						.or(z.boolean())
						.optional(),
					filterOperator: z
						.enum(["eq", "ne", "lt", "lte", "gt", "gte", "contains"])
						.describe("The operator to use for the filter")
						.optional(),
					organizationId: z
						.string()
						.describe(
							"The organization ID to list members for. If not provided, will default to the user",
						)
						.optional(),
				})
				.optional(),
			use: [orgMiddleware, orgSessionMiddleware],
		},
		async (ctx) => {
			const session = ctx.context.session;
			const organizationId =
				ctx.query?.organizationId || session.session.activeOrganizationId;
			if (!organizationId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
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

export const getActiveMemberRole = <O extends OrganizationOptions>(
	options: O,
) =>
	createAuthEndpoint(
		"/organization/get-active-member-role",
		{
			method: "GET",
			query: z
				.object({
					userId: z
						.string()
						.describe(
							"The user ID to get the role for. If not provided, will default to the current user",
						)
						.optional(),
					organizationId: z
						.string()
						.describe(
							"The organization ID to list members for. If not provided, will default to the user",
						)
						.optional(),
				})
				.optional(),
			use: [orgMiddleware, orgSessionMiddleware],
		},
		async (ctx) => {
			const session = ctx.context.session;
			const organizationId =
				ctx.query?.organizationId || session.session.activeOrganizationId;
			if (!organizationId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}
			const userId = ctx.query?.userId || session.user.id;

			const adapter = getOrgAdapter<O>(ctx.context, options);

			const member = await adapter.findMemberByOrgId({
				userId,
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
