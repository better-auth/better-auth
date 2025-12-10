import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { Where } from "@better-auth/core/db/adapter";
import * as z from "zod";
import { APIError } from "../../../api";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db";
import { toZodSchema } from "../../../db";
import type { User } from "../../../types";
import type { AccessControl, Statements } from "../../access";
import { orgSessionMiddleware } from "../call";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { hasPermission } from "../has-permission";
import {
	getOrganizationStatements,
	invalidateResourceCache,
	validateResourceName,
} from "../load-resources";
import type { Member, OrganizationResource, OrganizationRole } from "../schema";
import type { OrganizationOptions } from "../types";

type IsExactlyEmptyObject<T> = keyof T extends never // no keys
	? T extends {} // is assignable to {}
		? {} extends T
			? true
			: false // and {} is assignable to it
		: false
	: false;

/**
 * Describes what resource changes need to be applied to the database
 */
type ResourceChanges = {
	/**
	 * Resources that need to be created
	 */
	toCreate: Array<{
		resourceName: string;
		permissions: string[];
	}>;
	/**
	 * Resources that need to have permissions expanded
	 */
	toExpand: Array<{
		resourceName: string;
		existingPermissions: string[];
		newPermissions: string[];
		mergedPermissions: string[];
	}>;
	/**
	 * All resource names that will be created or expanded (for skipping delegation check)
	 */
	resourcesToSkipDelegation: string[];
};

const normalizeRoleName = (role: string) => role.toLowerCase();
const DEFAULT_MAXIMUM_ROLES_PER_ORGANIZATION = Number.POSITIVE_INFINITY;

const getAdditionalFields = <
	O extends OrganizationOptions,
	AllPartial extends boolean = false,
>(
	options: O,
	shouldBePartial: AllPartial = false as AllPartial,
) => {
	let additionalFields =
		options?.schema?.organizationRole?.additionalFields || {};
	if (shouldBePartial) {
		for (const key in additionalFields) {
			additionalFields[key]!.required = false;
		}
	}
	const additionalFieldsSchema = toZodSchema({
		fields: additionalFields,
		isClientSide: true,
	});
	type AdditionalFields = AllPartial extends true
		? Partial<InferAdditionalFieldsFromPluginOptions<"organizationRole", O>>
		: InferAdditionalFieldsFromPluginOptions<"organizationRole", O>;
	type ReturnAdditionalFields = InferAdditionalFieldsFromPluginOptions<
		"organizationRole",
		O,
		false
	>;

	return {
		additionalFieldsSchema,
		$AdditionalFields: {} as AdditionalFields,
		$ReturnAdditionalFields: {} as ReturnAdditionalFields,
	};
};

const baseCreateOrgRoleSchema = z.object({
	organizationId: z.string().optional().meta({
		description:
			"The id of the organization to create the role in. If not provided, the user's active organization will be used.",
	}),
	role: z.string().meta({
		description: "The name of the role to create",
	}),
	permission: z.record(z.string(), z.array(z.string())).meta({
		description: "The permission to assign to the role",
	}),
});

export const createOrgRole = <O extends OrganizationOptions>(options: O) => {
	const { additionalFieldsSchema, $AdditionalFields, $ReturnAdditionalFields } =
		getAdditionalFields<O>(options, false);
	type AdditionalFields = typeof $AdditionalFields;
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	return createAuthEndpoint(
		"/organization/create-role",
		{
			method: "POST",
			body: baseCreateOrgRoleSchema.safeExtend({
				additionalFields: z
					.object({ ...additionalFieldsSchema.shape })
					.optional(),
			}),
			metadata: {
				$Infer: {
					body: {} as {
						organizationId?: string | undefined;
						role: string;
						permission: Record<string, string[]>;
					} & (IsExactlyEmptyObject<AdditionalFields> extends true
						? { additionalFields?: {} | undefined }
						: { additionalFields: AdditionalFields }),
				},
			},
			requireHeaders: true,
			use: [orgSessionMiddleware],
		},
		async (ctx) => {
			const { session, user } = ctx.context.session;
			let roleName = ctx.body.role;
			const permission = ctx.body.permission;
			const additionalFields = ctx.body.additionalFields;

			const ac = options.ac;
			if (!ac) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The organization plugin is missing a pre-defined ac instance.`,
					`\nPlease refer to the documentation here: https://better-auth.com/docs/plugins/organization#dynamic-access-control`,
				);
				throw new APIError("NOT_IMPLEMENTED", {
					message: ORGANIZATION_ERROR_CODES.MISSING_AC_INSTANCE,
				});
			}

			// Get the organization id where the role will be created.
			// We can verify if the org id is valid and associated with the user in the next step when we try to find the member.
			const organizationId =
				ctx.body.organizationId ?? session.activeOrganizationId;
			if (!organizationId) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The session is missing an active organization id to create a role. Either set an active org id, or pass an organizationId in the request body.`,
				);
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE,
				});
			}

			roleName = normalizeRoleName(roleName);

			await checkIfRoleNameIsTakenByPreDefinedRole({
				role: roleName,
				organizationId,
				options,
				ctx,
			});

			// Get the user's role associated with the organization.
			// This also serves as a check to ensure the org id is valid.
			const member = await ctx.context.adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The user is not a member of the organization to create a role.`,
					{
						userId: user.id,
						organizationId,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}

			const canCreateRole = await hasPermission(
				{
					options,
					organizationId,
					permissions: {
						ac: ["create"],
					},
					role: member.role,
				},
				ctx,
			);

			if (!canCreateRole) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The user is not permitted to create a role. If this is unexpected, please make sure the role associated to that member has the "ac" resource with the "create" permission.`,
					{
						userId: user.id,
						organizationId,
						role: member.role,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE,
				});
			}

			const maximumRolesPerOrganization =
				typeof options.dynamicAccessControl?.maximumRolesPerOrganization ===
				"function"
					? await options.dynamicAccessControl.maximumRolesPerOrganization(
							organizationId,
						)
					: (options.dynamicAccessControl?.maximumRolesPerOrganization ??
						DEFAULT_MAXIMUM_ROLES_PER_ORGANIZATION);
			const rolesInDB = await ctx.context.adapter.count({
				model: "organizationRole",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (rolesInDB >= maximumRolesPerOrganization) {
				ctx.context.logger.error(
					`[Dynamic Access Control] Failed to create a new role, the organization has too many roles. Maximum allowed roles is ${maximumRolesPerOrganization}.`,
					{
						organizationId,
						maximumRolesPerOrganization,
						rolesInDB,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.TOO_MANY_ROLES,
				});
			}

			// Check if role name is already taken in DB
			// This must happen BEFORE resource creation to avoid orphaned resources
			await checkIfRoleNameIsTakenByRoleInDB({
				ctx,
				organizationId,
				role: roleName,
			});

			// Step 1: Calculate what resource changes are needed (read-only)
			const resourceChanges = await calculateRequiredResourceChanges({
				ac,
				ctx,
				permission,
				organizationId,
				options,
				member,
				user,
			});

			// Step 2: Check permission delegation (read-only)
			await checkPermissionDelegation({
				ctx,
				member,
				options,
				organizationId,
				permissionRequired: permission,
				user,
				action: "create",
				resourcesToSkipDelegation: resourceChanges.resourcesToSkipDelegation,
			});

			// Step 3: Apply resource changes (mutations)
			await applyResourceChanges({
				resourceChanges,
				organizationId,
				options,
				ctx,
				user,
			});

			const newRole = ac.newRole(permission);

			const newRoleInDB = await ctx.context.adapter.create<
				Omit<OrganizationRole, "permission"> & { permission: string }
			>({
				model: "organizationRole",
				data: {
					createdAt: new Date(),
					organizationId,
					permission: JSON.stringify(permission),
					role: roleName,
					...additionalFields,
				},
			});

			const data = {
				...newRoleInDB,
				permission,
			} as OrganizationRole & ReturnAdditionalFields;
			return ctx.json({
				success: true,
				roleData: data,
				statements: newRole.statements,
			});
		},
	);
};

const deleteOrgRoleBodySchema = z
	.object({
		organizationId: z.string().optional().meta({
			description:
				"The id of the organization to create the role in. If not provided, the user's active organization will be used.",
		}),
	})
	.and(
		z.union([
			z.object({
				roleName: z.string().nonempty().meta({
					description: "The name of the role to delete",
				}),
			}),
			z.object({
				roleId: z.string().nonempty().meta({
					description: "The id of the role to delete",
				}),
			}),
		]),
	);

export const deleteOrgRole = <O extends OrganizationOptions>(options: O) => {
	return createAuthEndpoint(
		"/organization/delete-role",
		{
			method: "POST",
			body: deleteOrgRoleBodySchema,
			requireHeaders: true,
			use: [orgSessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as {
						roleName?: string | undefined;
						roleId?: string | undefined;
						organizationId?: string | undefined;
					},
				},
			},
		},
		async (ctx) => {
			const { session, user } = ctx.context.session;

			const organizationId =
				ctx.body.organizationId ?? session.activeOrganizationId;
			if (!organizationId) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The session is missing an active organization id to delete a role. Either set an active org id, or pass an organizationId in the request body.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}

			const member = await ctx.context.adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The user is not a member of the organization to delete a role.`,
					{
						userId: user.id,
						organizationId,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}

			const canDeleteRole = await hasPermission(
				{
					options,
					organizationId,
					permissions: {
						ac: ["delete"],
					},
					role: member.role,
				},
				ctx,
			);
			if (!canDeleteRole) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The user is not permitted to delete a role. If this is unexpected, please make sure the role associated to that member has the "ac" resource with the "delete" permission.`,
					{
						userId: user.id,
						organizationId,
						role: member.role,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE,
				});
			}

			if (ctx.body.roleName) {
				const roleName = ctx.body.roleName;
				const defaultRoles = options.roles
					? Object.keys(options.roles)
					: ["owner", "admin", "member"];
				if (defaultRoles.includes(roleName)) {
					ctx.context.logger.error(
						`[Dynamic Access Control] Cannot delete a pre-defined role.`,
						{
							roleName,
							organizationId,
							defaultRoles,
						},
					);
					throw new APIError("BAD_REQUEST", {
						message: ORGANIZATION_ERROR_CODES.CANNOT_DELETE_A_PRE_DEFINED_ROLE,
					});
				}
			}

			let condition: Where;
			if (ctx.body.roleName) {
				condition = {
					field: "role",
					value: ctx.body.roleName,
					operator: "eq",
					connector: "AND",
				};
			} else if (ctx.body.roleId) {
				condition = {
					field: "id",
					value: ctx.body.roleId,
					operator: "eq",
					connector: "AND",
				};
			} else {
				// shouldn't be able to reach here given the schema validation.
				// But just in case, throw an error.
				ctx.context.logger.error(
					`[Dynamic Access Control] The role name/id is not provided in the request body.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
				});
			}
			const existingRoleInDB =
				await ctx.context.adapter.findOne<OrganizationRole>({
					model: "organizationRole",
					where: [
						{
							field: "organizationId",
							value: organizationId,
							operator: "eq",
							connector: "AND",
						},
						condition,
					],
				});
			if (!existingRoleInDB) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The role name/id does not exist in the database.`,
					{
						...("roleName" in ctx.body
							? { roleName: ctx.body.roleName }
							: { roleId: ctx.body.roleId }),
						organizationId,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
				});
			}

			existingRoleInDB.permission = JSON.parse(
				existingRoleInDB.permission as never as string,
			);

			await ctx.context.adapter.delete({
				model: "organizationRole",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					condition,
				],
			});

			return ctx.json({
				success: true,
			});
		},
	);
};

const listOrgRolesQuerySchema = z
	.object({
		organizationId: z.string().optional().meta({
			description:
				"The id of the organization to list roles for. If not provided, the user's active organization will be used.",
		}),
	})
	.optional();

export const listOrgRoles = <O extends OrganizationOptions>(options: O) => {
	const { $ReturnAdditionalFields } = getAdditionalFields<O>(options, false);
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	return createAuthEndpoint(
		"/organization/list-roles",
		{
			method: "GET",
			requireHeaders: true,
			use: [orgSessionMiddleware],
			query: listOrgRolesQuerySchema,
		},
		async (ctx) => {
			const { session, user } = ctx.context.session;

			const organizationId =
				ctx.query?.organizationId ?? session.activeOrganizationId;
			if (!organizationId) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The session is missing an active organization id to list roles. Either set an active org id, or pass an organizationId in the request query.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}

			const member = await ctx.context.adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The user is not a member of the organization to list roles.`,
					{
						userId: user.id,
						organizationId,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}

			const canListRoles = await hasPermission(
				{
					options,
					organizationId,
					permissions: {
						ac: ["read"],
					},
					role: member.role,
				},
				ctx,
			);
			if (!canListRoles) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The user is not permitted to list roles.`,
					{
						userId: user.id,
						organizationId,
						role: member.role,
					},
				);
				throw new APIError("FORBIDDEN", {
					message: ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE,
				});
			}

			let roles = await ctx.context.adapter.findMany<
				OrganizationRole & ReturnAdditionalFields
			>({
				model: "organizationRole",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
				],
			});

			roles = roles.map((x) => ({
				...x,
				permission: JSON.parse(x.permission as never as string),
			}));

			return ctx.json(roles);
		},
	);
};

const getOrgRoleQuerySchema = z
	.object({
		organizationId: z.string().optional().meta({
			description:
				"The id of the organization to read a role for. If not provided, the user's active organization will be used.",
		}),
	})
	.and(
		z.union([
			z.object({
				roleName: z.string().nonempty().meta({
					description: "The name of the role to read",
				}),
			}),
			z.object({
				roleId: z.string().nonempty().meta({
					description: "The id of the role to read",
				}),
			}),
		]),
	)
	.optional();

export const getOrgRole = <O extends OrganizationOptions>(options: O) => {
	const { $ReturnAdditionalFields } = getAdditionalFields<O>(options, false);
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;
	return createAuthEndpoint(
		"/organization/get-role",
		{
			method: "GET",
			requireHeaders: true,
			use: [orgSessionMiddleware],
			query: getOrgRoleQuerySchema,
			metadata: {
				$Infer: {
					query: {} as {
						organizationId?: string | undefined;
						roleName?: string | undefined;
						roleId?: string | undefined;
					},
				},
			},
		},
		async (ctx) => {
			const { session, user } = ctx.context.session;

			const organizationId =
				ctx.query?.organizationId ?? session.activeOrganizationId;
			if (!organizationId) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The session is missing an active organization id to read a role. Either set an active org id, or pass an organizationId in the request query.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}

			const member = await ctx.context.adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The user is not a member of the organization to read a role.`,
					{
						userId: user.id,
						organizationId,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}

			const canListRoles = await hasPermission(
				{
					options,
					organizationId,
					permissions: {
						ac: ["read"],
					},
					role: member.role,
				},
				ctx,
			);
			if (!canListRoles) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The user is not permitted to read a role.`,
					{
						userId: user.id,
						organizationId,
						role: member.role,
					},
				);
				throw new APIError("FORBIDDEN", {
					message: ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE,
				});
			}

			let condition: Where;
			if (ctx.query.roleName) {
				condition = {
					field: "role",
					value: ctx.query.roleName,
					operator: "eq",
					connector: "AND",
				};
			} else if (ctx.query.roleId) {
				condition = {
					field: "id",
					value: ctx.query.roleId,
					operator: "eq",
					connector: "AND",
				};
			} else {
				// shouldn't be able to reach here given the schema validation.
				// But just in case, throw an error.
				ctx.context.logger.error(
					`[Dynamic Access Control] The role name/id is not provided in the request query.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
				});
			}
			let role = await ctx.context.adapter.findOne<OrganizationRole>({
				model: "organizationRole",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					condition,
				],
			});
			if (!role) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The role name/id does not exist in the database.`,
					{
						...("roleName" in ctx.query
							? { roleName: ctx.query.roleName }
							: { roleId: ctx.query.roleId }),
						organizationId,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
				});
			}

			role.permission = JSON.parse(role.permission as never as string);

			return ctx.json(role as OrganizationRole & ReturnAdditionalFields);
		},
	);
};

const roleNameOrIdSchema = z.union([
	z.object({
		roleName: z.string().nonempty().meta({
			description: "The name of the role to update",
		}),
	}),
	z.object({
		roleId: z.string().nonempty().meta({
			description: "The id of the role to update",
		}),
	}),
]);

export const updateOrgRole = <O extends OrganizationOptions>(options: O) => {
	const { additionalFieldsSchema, $AdditionalFields, $ReturnAdditionalFields } =
		getAdditionalFields<O, true>(options, true);
	type AdditionalFields = typeof $AdditionalFields;
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	return createAuthEndpoint(
		"/organization/update-role",
		{
			method: "POST",
			body: z
				.object({
					organizationId: z.string().optional().meta({
						description:
							"The id of the organization to update the role in. If not provided, the user's active organization will be used.",
					}),
					data: z.object({
						permission: z
							.record(z.string(), z.array(z.string()))
							.optional()
							.meta({
								description: "The permission to update the role with",
							}),
						roleName: z.string().optional().meta({
							description: "The name of the role to update",
						}),
						...additionalFieldsSchema.shape,
					}),
				})
				.and(roleNameOrIdSchema),
			metadata: {
				$Infer: {
					body: {} as {
						organizationId?: string | undefined;
						data: {
							permission?: Record<string, string[]> | undefined;
							roleName?: string | undefined;
						} & AdditionalFields;
						roleName?: string | undefined;
						roleId?: string | undefined;
					},
				},
			},
			requireHeaders: true,
			use: [orgSessionMiddleware],
		},
		async (ctx) => {
			const { session, user } = ctx.context.session;

			const ac = options.ac;
			if (!ac) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The organization plugin is missing a pre-defined ac instance.`,
					`\nPlease refer to the documentation here: https://better-auth.com/docs/plugins/organization#dynamic-access-control`,
				);
				throw new APIError("NOT_IMPLEMENTED", {
					message: ORGANIZATION_ERROR_CODES.MISSING_AC_INSTANCE,
				});
			}

			const organizationId =
				ctx.body.organizationId ?? session.activeOrganizationId;
			if (!organizationId) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The session is missing an active organization id to update a role. Either set an active org id, or pass an organizationId in the request body.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}

			const member = await ctx.context.adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The user is not a member of the organization to update a role.`,
					{
						userId: user.id,
						organizationId,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}

			const canUpdateRole = await hasPermission(
				{
					options,
					organizationId,
					role: member.role,
					permissions: {
						ac: ["update"],
					},
				},
				ctx,
			);
			if (!canUpdateRole) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The user is not permitted to update a role.`,
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE,
				});
			}

			let condition: Where;
			if (ctx.body.roleName) {
				condition = {
					field: "role",
					value: ctx.body.roleName,
					operator: "eq",
					connector: "AND",
				};
			} else if (ctx.body.roleId) {
				condition = {
					field: "id",
					value: ctx.body.roleId,
					operator: "eq",
					connector: "AND",
				};
			} else {
				// shouldn't be able to reach here given the schema validation.
				// But just in case, throw an error.
				ctx.context.logger.error(
					`[Dynamic Access Control] The role name/id is not provided in the request body.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
				});
			}
			let role = await ctx.context.adapter.findOne<OrganizationRole>({
				model: "organizationRole",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					condition,
				],
			});
			if (!role) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The role name/id does not exist in the database.`,
					{
						...("roleName" in ctx.body
							? { roleName: ctx.body.roleName }
							: { roleId: ctx.body.roleId }),
						organizationId,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
				});
			}
			role.permission = role.permission
				? JSON.parse(role.permission as never as string)
				: undefined;

			const {
				permission: _,
				roleName: __,
				...additionalFields
			} = ctx.body.data;

			let updateData: Partial<OrganizationRole> = {
				...additionalFields,
			};

			// -----
			// Step 1: Perform all validations first (no DB mutations)
			// -----

			// Validate role name change if requested
			let newRoleName: string | undefined;
			if (ctx.body.data.roleName) {
				newRoleName = normalizeRoleName(ctx.body.data.roleName);

				await checkIfRoleNameIsTakenByPreDefinedRole({
					role: newRoleName,
					organizationId,
					options,
					ctx,
				});
				await checkIfRoleNameIsTakenByRoleInDB({
					role: newRoleName,
					organizationId,
					ctx,
				});

				updateData.role = newRoleName;
			}

			// -----
			// Step 2: Plan and validate resource changes (read-only)
			// Only after all cheap validations pass
			// -----

			if (ctx.body.data.permission) {
				let newPermission = ctx.body.data.permission;

				// Step 2a: Calculate what resource changes are needed (read-only)
				const resourceChanges = await calculateRequiredResourceChanges({
					ac,
					ctx,
					permission: newPermission,
					organizationId,
					options,
					member,
					user,
				});

				// Step 2b: Check permission delegation (read-only)
				await checkPermissionDelegation({
					ctx,
					member,
					options,
					organizationId,
					permissionRequired: newPermission,
					user,
					action: "update",
					resourcesToSkipDelegation: resourceChanges.resourcesToSkipDelegation,
				});

				// Step 2c: Apply resource changes (mutations)
				await applyResourceChanges({
					resourceChanges,
					organizationId,
					options,
					ctx,
					user,
				});

				updateData.permission = newPermission;
			}

			// -----
			// Apply the updates
			const update = {
				...updateData,
				...(updateData.permission
					? { permission: JSON.stringify(updateData.permission) }
					: {}),
			};
			await ctx.context.adapter.update<OrganizationRole>({
				model: "organizationRole",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					condition,
				],
				update,
			});

			// -----
			// Return the updated role
			return ctx.json({
				success: true,
				roleData: {
					...role,
					...update,
					permission: updateData.permission || role.permission || null,
				} as OrganizationRole & ReturnAdditionalFields,
			});
		},
	);
};

/**
 * Calculate what resource changes are needed (create new or expand existing).
 * This is a read-only operation that validates and returns what needs to change.
 * Does NOT mutate the database.
 */
async function calculateRequiredResourceChanges({
	ac,
	ctx,
	permission,
	organizationId,
	options,
	member,
	user,
}: {
	ac: AccessControl;
	ctx: GenericEndpointContext;
	permission: Record<string, string[]>;
	organizationId: string;
	options: OrganizationOptions;
	member: Member;
	user: User;
}): Promise<ResourceChanges> {
	// Get organization-specific statements (merged default + custom)
	const orgStatements = await getOrganizationStatements(
		organizationId,
		options,
		ctx,
	);
	const validResources = Object.keys(orgStatements);
	const providedResources = Object.keys(permission);

	// Find resources that don't exist yet
	const missingResources = providedResources.filter(
		(r) => !validResources.includes(r),
	);

	// Guard: Handle missing resources when custom resources not enabled
	if (
		missingResources.length > 0 &&
		!options.dynamicAccessControl?.enableCustomResources
	) {
		ctx.context.logger.error(
			`[Dynamic Access Control] The provided permission includes invalid resources.`,
			{
				providedResources,
				validResources,
				missingResources,
			},
		);
		throw new APIError("BAD_REQUEST", {
			message: ORGANIZATION_ERROR_CODES.INVALID_RESOURCE,
		});
	}

	// Calculate both creation and expansion needs in parallel
	const [creationPlan, expansionPlan] = await Promise.all([
		missingResources.length > 0
			? planResourceCreation({
					missingResources,
					permission,
					organizationId,
					options,
					ctx,
					member,
					user,
				})
			: Promise.resolve({
					toCreate: [],
					toExpand: [],
					resourcesToSkipDelegation: [],
				}),
		planResourceExpansion({
			permission,
			orgStatements,
			ac,
			organizationId,
			options,
			ctx,
			member,
			user,
		}),
	]);

	// Merge both plans
	return {
		toCreate: creationPlan.toCreate,
		toExpand: expansionPlan.toExpand,
		resourcesToSkipDelegation: [
			...creationPlan.resourcesToSkipDelegation,
			...expansionPlan.resourcesToSkipDelegation,
		],
	};
}

/**
 * Plan resource creation - validates and returns what needs to be created.
 * Does NOT mutate the database.
 */
async function planResourceCreation({
	missingResources,
	permission,
	organizationId,
	options,
	ctx,
	member,
	user,
}: {
	missingResources: string[];
	permission: Record<string, string[]>;
	organizationId: string;
	options: OrganizationOptions;
	ctx: GenericEndpointContext;
	member: Member;
	user: User;
}): Promise<ResourceChanges> {
	// Validate and check permissions for all resources first
	for (const resourceName of missingResources) {
		// Validate resource name using existing validateResourceName function
		const validation = validateResourceName(resourceName, options);
		if (!validation.valid) {
			ctx.context.logger.error(
				`[Dynamic Access Control] Cannot auto-create resource "${resourceName}": ${validation.error}`,
				{
					resourceName,
					error: validation.error,
				},
			);
			throw new APIError("BAD_REQUEST", {
				message: validation.error || `Invalid resource name: ${resourceName}`,
			});
		}

		// Check if user can create this resource
		let canCreate: { allow: boolean; message?: string };
		if (options.dynamicAccessControl?.canCreateResource) {
			// Use custom function if provided
			canCreate = await options.dynamicAccessControl.canCreateResource({
				organizationId,
				userId: user.id,
				member,
				resourceName,
				permissions: permission[resourceName] || [],
			});
		} else {
			// Use default role-based check
			const allowedRoles = options.dynamicAccessControl
				?.allowedRolesToCreateResources ?? ["owner"];
			if (!allowedRoles.includes(member.role)) {
				canCreate = {
					allow: false,
					message: `Only ${allowedRoles.join(", ")} can create resources`,
				};
			} else {
				canCreate = { allow: true };
			}
		}

		if (!canCreate.allow) {
			ctx.context.logger.error(
				`[Dynamic Access Control] User not allowed to create resource "${resourceName}"`,
				{
					userId: user.id,
					organizationId,
					memberRole: member.role,
					reason: canCreate.message,
				},
			);
			throw new APIError("FORBIDDEN", {
				message:
					canCreate.message ||
					`Not allowed to create resource: ${resourceName}`,
			});
		}
	}

	// Check for existing resources in parallel
	const existingResourceChecks = await Promise.all(
		missingResources.map((resourceName) =>
			ctx.context.adapter
				.findOne<OrganizationResource>({
					model: "organizationResource",
					where: [
						{
							field: "organizationId",
							value: organizationId,
							operator: "eq",
							connector: "AND",
						},
						{
							field: "resource",
							value: resourceName,
							operator: "eq",
							connector: "AND",
						},
					],
				})
				.then((existing: OrganizationResource | null) => ({
					resourceName,
					existing,
				})),
		),
	);

	// Collect resources that need to be created (don't exist in DB yet)
	const toCreate = existingResourceChecks
		.filter(
			(r: { resourceName: string; existing: OrganizationResource | null }) =>
				!r.existing,
		)
		.map(
			({
				resourceName,
			}: {
				resourceName: string;
				existing: OrganizationResource | null;
			}) => ({
				resourceName,
				permissions: permission[resourceName] || [],
			}),
		);

	return {
		toCreate,
		toExpand: [],
		resourcesToSkipDelegation: toCreate.map(
			(r: { resourceName: string; permissions: string[] }) => r.resourceName,
		),
	};
}

/**
 * Plan resource expansion - validates and returns what permissions need to be expanded.
 * Also identifies ALL custom resources to skip delegation checks for them.
 * Does NOT mutate the database.
 */
async function planResourceExpansion({
	permission,
	orgStatements,
	ac,
	organizationId,
	options,
	ctx,
	member,
	user,
}: {
	permission: Record<string, string[]>;
	orgStatements: Statements;
	ac: AccessControl;
	organizationId: string;
	options: OrganizationOptions;
	ctx: GenericEndpointContext;
	member: Member;
	user: User;
}): Promise<ResourceChanges> {
	const defaultStatements = ac.statements;
	const resourcesToExpand: Array<{
		resource: string;
		existingPermissions: string[];
		invalidPermissions: string[];
	}> = [];

	// Identify all custom resources in the permission set (for delegation skip)
	const customResourcesInPermissions: string[] = [];

	// Find resources that need permission expansion
	for (const [resource, permissions] of Object.entries(permission)) {
		const validPermissions = orgStatements[resource as keyof Statements];
		if (!validPermissions) continue;

		// Check if this is a custom resource (not a default one)
		const isCustomResource = !defaultStatements[resource as keyof Statements];

		// Track all custom resources (even if not expanding)
		if (isCustomResource) {
			customResourcesInPermissions.push(resource);
		}

		const invalidPermissions = permissions.filter(
			(p) => !validPermissions.includes(p),
		);

		if (invalidPermissions.length === 0) continue;

		if (
			!isCustomResource ||
			!options.dynamicAccessControl?.enableCustomResources
		) {
			ctx.context.logger.error(
				`[Dynamic Access Control] The provided permissions include invalid actions for resource "${resource}".`,
				{
					resource,
					invalidPermissions,
					validPermissions,
					isCustomResource,
				},
			);
			throw new APIError("BAD_REQUEST", {
				message: `Invalid permissions for resource "${resource}": ${invalidPermissions.join(", ")}`,
			});
		}

		resourcesToExpand.push({
			resource,
			existingPermissions: [...validPermissions],
			invalidPermissions,
		});
	}

	// If no resources need expansion but there are custom resources,
	// still return them for delegation skip
	if (resourcesToExpand.length === 0) {
		return {
			toCreate: [],
			toExpand: [],
			resourcesToSkipDelegation: customResourcesInPermissions,
		};
	}

	// Check if user can expand permissions for these resources
	for (const {
		resource,
		existingPermissions,
		invalidPermissions,
	} of resourcesToExpand) {
		// Check if user can expand this resource (same logic as creation)
		let canExpand: { allow: boolean; message?: string };
		if (options.dynamicAccessControl?.canCreateResource) {
			// Use custom function if provided
			canExpand = await options.dynamicAccessControl.canCreateResource({
				organizationId,
				userId: user.id,
				member,
				resourceName: resource,
				permissions: invalidPermissions,
			});
		} else {
			// Use default role-based check
			const allowedRoles = options.dynamicAccessControl
				?.allowedRolesToCreateResources ?? ["owner"];
			if (!allowedRoles.includes(member.role)) {
				canExpand = {
					allow: false,
					message: `Only ${allowedRoles.join(", ")} can expand resource permissions`,
				};
			} else {
				canExpand = { allow: true };
			}
		}

		if (!canExpand.allow) {
			ctx.context.logger.error(
				`[Dynamic Access Control] User not allowed to expand permissions for resource "${resource}"`,
				{
					userId: user.id,
					organizationId,
					memberRole: member.role,
					reason: canExpand.message,
				},
			);
			throw new APIError("FORBIDDEN", {
				message:
					canExpand.message ||
					`Not allowed to expand permissions for resource: ${resource}`,
			});
		}
	}

	// Fetch existing resources to get their current permissions
	const existingResources = await Promise.all(
		resourcesToExpand.map(({ resource }) =>
			ctx.context.adapter
				.findOne<OrganizationResource>({
					model: "organizationResource",
					where: [
						{
							field: "organizationId",
							value: organizationId,
							operator: "eq",
							connector: "AND",
						},
						{
							field: "resource",
							value: resource,
							operator: "eq",
							connector: "AND",
						},
					],
				})
				.then((existing: OrganizationResource | null) => ({
					resource,
					existing,
				})),
		),
	);

	// Calculate what needs to be expanded
	const toExpand = existingResources
		.filter(
			({
				existing,
			}: {
				resource: string;
				existing: OrganizationResource | null;
			}) => existing !== null,
		)
		.map(
			({
				resource,
				existing,
			}: {
				resource: string;
				existing: OrganizationResource | null;
			}) => {
				const resourceToExpand = resourcesToExpand.find(
					(r) => r.resource === resource,
				)!;

				const existingPermissions: string[] = JSON.parse(
					existing!.permissions as never as string,
				);

				const mergedPermissions = Array.from(
					new Set([
						...existingPermissions,
						...resourceToExpand.invalidPermissions,
					]),
				);

				return {
					resourceName: resource,
					existingPermissions,
					newPermissions: resourceToExpand.invalidPermissions,
					mergedPermissions,
				};
			},
		);

	return {
		toCreate: [],
		toExpand,
		// Skip delegation for ALL custom resources, not just those being expanded
		// This allows users to remove permissions from custom resources without delegation errors
		resourcesToSkipDelegation: customResourcesInPermissions,
	};
}

/**
 * Apply resource changes to the database - creates new resources and expands existing ones.
 * This is the only function that mutates the database for resource management.
 */
async function applyResourceChanges({
	resourceChanges,
	organizationId,
	options,
	ctx,
	user,
}: {
	resourceChanges: ResourceChanges;
	organizationId: string;
	options: OrganizationOptions;
	ctx: GenericEndpointContext;
	user: User;
}) {
	// Create new resources
	if (resourceChanges.toCreate.length > 0) {
		await Promise.all(
			resourceChanges.toCreate.map(async ({ resourceName, permissions }) => {
				await ctx.context.adapter.create<
					Omit<OrganizationResource, "permissions"> & { permissions: string }
				>({
					model: "organizationResource",
					data: {
						createdAt: new Date(),
						organizationId,
						permissions: JSON.stringify(permissions),
						resource: resourceName,
					},
				});

				ctx.context.logger.info(
					`[Dynamic Access Control] Auto-created resource "${resourceName}" for organization ${organizationId}`,
					{
						resourceName,
						organizationId,
						permissions,
					},
				);

				// Call hook after resource creation (if provided)
				await options.dynamicAccessControl?.onResourceCreated?.({
					organizationId,
					resourceName,
					permissions,
					createdBy: user.id,
				});
			}),
		);
	}

	// Expand existing resources
	if (resourceChanges.toExpand.length > 0) {
		await Promise.all(
			resourceChanges.toExpand.map(
				async ({
					resourceName,
					existingPermissions,
					newPermissions,
					mergedPermissions,
				}) => {
					await ctx.context.adapter.update<
						Omit<OrganizationResource, "permissions"> & {
							permissions: string;
						}
					>({
						model: "organizationResource",
						where: [
							{
								field: "organizationId",
								value: organizationId,
								operator: "eq",
								connector: "AND",
							},
							{
								field: "resource",
								value: resourceName,
								operator: "eq",
								connector: "AND",
							},
						],
						update: {
							permissions: JSON.stringify(mergedPermissions),
							updatedAt: new Date(),
						},
					});

					ctx.context.logger.info(
						`[Dynamic Access Control] Auto-expanded permissions for custom resource "${resourceName}"`,
						{
							resource: resourceName,
							organizationId,
							oldPermissions: existingPermissions,
							newPermissions,
							mergedPermissions,
						},
					);

					// Call hook after resource expansion (if provided)
					await options.dynamicAccessControl?.onResourceExpanded?.({
						organizationId,
						resourceName,
						oldPermissions: existingPermissions,
						newPermissions,
						expandedBy: user.id,
					});
				},
			),
		);
	}

	// Invalidate cache if we made any changes
	if (
		resourceChanges.toCreate.length > 0 ||
		resourceChanges.toExpand.length > 0
	) {
		invalidateResourceCache(organizationId);
	}
}

/**
 * Check permission delegation - validates that the member has the permissions they're trying to grant.
 * This is a read-only validation, does NOT mutate the database.
 */
async function checkPermissionDelegation({
	ctx,
	permissionRequired: permission,
	options,
	organizationId,
	member,
	user,
	action,
	resourcesToSkipDelegation,
}: {
	ctx: GenericEndpointContext;
	permissionRequired: Record<string, string[]>;
	options: OrganizationOptions;
	organizationId: string;
	member: Member;
	user: User;
	action: "create" | "update" | "delete" | "read" | "list" | "get";
	resourcesToSkipDelegation: string[];
}) {
	const hasNecessaryPermissions: {
		resource: { [x: string]: string[] };
		hasPermission: boolean;
	}[] = [];
	const permissionEntries = Object.entries(permission);
	for await (const [resource, permissions] of permissionEntries) {
		// Skip delegation check for auto-created/expanded resources
		// Users don't need to have permissions for resources that are being created or expanded
		if (resourcesToSkipDelegation.includes(resource)) {
			ctx.context.logger.info(
				`[Dynamic Access Control] Skipping permission delegation check for auto-created resource "${resource}"`,
				{
					resource,
					organizationId,
				},
			);
			continue;
		}

		for await (const perm of permissions) {
			hasNecessaryPermissions.push({
				resource: { [resource]: [perm] },
				hasPermission: await hasPermission(
					{
						options,
						organizationId,
						permissions: { [resource]: [perm] },
						useMemoryCache: true,
						role: member.role,
					},
					ctx,
				),
			});
		}
	}
	const missingPermissions = hasNecessaryPermissions
		.filter((x) => x.hasPermission === false)
		.map((x) => {
			const key = Object.keys(x.resource)[0]!;
			return `${key}:${x.resource[key]![0]}` as const;
		});
	if (missingPermissions.length > 0) {
		ctx.context.logger.error(
			`[Dynamic Access Control] The user is missing permissions necessary to ${action} a role with those set of permissions.\n`,
			{
				userId: user.id,
				organizationId,
				role: member.role,
				missingPermissions,
			},
		);
		let errorMessage: string;
		if (action === "create")
			errorMessage =
				ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE;
		else if (action === "update")
			errorMessage =
				ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE;
		else if (action === "delete")
			errorMessage =
				ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE;
		else if (action === "read")
			errorMessage =
				ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE;
		else if (action === "list")
			errorMessage =
				ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE;
		else
			errorMessage = ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE;

		throw new APIError("FORBIDDEN", {
			message: errorMessage,
			missingPermissions,
		});
	}
}

async function checkIfRoleNameIsTakenByPreDefinedRole({
	options,
	organizationId,
	role,
	ctx,
}: {
	options: OrganizationOptions;
	organizationId: string;
	role: string;
	ctx: GenericEndpointContext;
}) {
	const defaultRoles = options.roles
		? Object.keys(options.roles)
		: ["owner", "admin", "member"];
	if (defaultRoles.includes(role)) {
		ctx.context.logger.error(
			`[Dynamic Access Control] The role name "${role}" is already taken by a pre-defined role.`,
			{
				role,
				organizationId,
				defaultRoles,
			},
		);
		throw new APIError("BAD_REQUEST", {
			message: ORGANIZATION_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
		});
	}
}

async function checkIfRoleNameIsTakenByRoleInDB({
	organizationId,
	role,
	ctx,
}: {
	ctx: GenericEndpointContext;
	organizationId: string;
	role: string;
}) {
	const existingRoleInDB = await ctx.context.adapter.findOne<OrganizationRole>({
		model: "organizationRole",
		where: [
			{
				field: "organizationId",
				value: organizationId,
				operator: "eq",
				connector: "AND",
			},
			{
				field: "role",
				value: role,
				operator: "eq",
				connector: "AND",
			},
		],
	});
	if (existingRoleInDB) {
		ctx.context.logger.error(
			`[Dynamic Access Control] The role name "${role}" is already taken by a role in the database.`,
			{
				role,
				organizationId,
			},
		);
		throw new APIError("BAD_REQUEST", {
			message: ORGANIZATION_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
		});
	}
}
