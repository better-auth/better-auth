import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { Where } from "@better-auth/core/db/adapter";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db";
import { toZodSchema } from "../../../db";
import type { User } from "../../../types";
import type { AccessControl } from "../../access";
import { orgSessionMiddleware } from "../call";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { hasPermission } from "../has-permission";
import type { Member, Organization, OrganizationRole } from "../schema";
import type { OrganizationOptions } from "../types";

type IsExactlyEmptyObject<T> = keyof T extends never // no keys
	? T extends {} // is assignable to {}
		? {} extends T
			? true
			: false // and {} is assignable to it
		: false
	: false;

const normalizeRoleName = (role: string) => role.toLowerCase();
const DEFAULT_MAXIMUM_ROLES_PER_ORGANIZATION = Number.POSITIVE_INFINITY;

const getAdditionalFields = <
	O extends OrganizationOptions,
	AllPartial extends boolean = false,
>(
	options: O,
	shouldBePartial: AllPartial = false as AllPartial,
) => {
	const additionalFields =
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
			let permission = ctx.body.permission;
			let additionalFields = ctx.body.additionalFields;

			const ac = options.ac;
			if (!ac) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The organization plugin is missing a pre-defined ac instance.`,
					`\nPlease refer to the documentation here: https://better-auth.com/docs/plugins/organization#dynamic-access-control`,
				);
				throw APIError.from(
					"NOT_IMPLEMENTED",
					ORGANIZATION_ERROR_CODES.MISSING_AC_INSTANCE,
				);
			}

			// Get the organization id where the role will be created.
			// We can verify if the org id is valid and associated with the user in the next step when we try to find the member.
			const organizationId =
				ctx.body.organizationId ?? session.activeOrganizationId;
			if (!organizationId) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The session is missing an active organization id to create a role. Either set an active org id, or pass an organizationId in the request body.`,
				);
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE,
				);
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
				throw APIError.from(
					"FORBIDDEN",
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				);
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
				throw APIError.from(
					"FORBIDDEN",
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE,
				);
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
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.TOO_MANY_ROLES,
				);
			}

			await checkForInvalidResources({ ac, ctx, permission });

			await checkIfMemberHasPermission({
				ctx,
				member,
				options,
				organizationId,
				permissionRequired: permission,
				user,
				action: "create",
			});

			await checkIfRoleNameIsTakenByRoleInDB({
				ctx,
				organizationId,
				role: roleName,
			});

			let organization: Organization | null = null;
			if (
				options.organizationHooks?.beforeCreateRole ||
				options.organizationHooks?.afterCreateRole
			) {
				organization = await ctx.context.adapter.findOne<Organization>({
					model: "organization",
					where: [
						{
							field: "id",
							value: organizationId,
						},
					],
				});
				if (!organization) {
					ctx.context.logger.error(
						`[Dynamic Access Control] The organization associated with the role to be created does not exist in the database.`,
						{
							organizationId,
						},
					);
					throw APIError.from(
						"BAD_REQUEST",
						ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					);
				}
			}

			const originalPermissionForCreate = JSON.stringify(permission);
			const originalRoleName = roleName;
			if (options.organizationHooks?.beforeCreateRole) {
				const hookRes = await options.organizationHooks.beforeCreateRole({
					role: {
						role: roleName,
						permission,
						...additionalFields,
					},
					organization: organization!,
					user,
				});
				if (hookRes?.data) {
					if (hookRes.data.role) roleName = hookRes.data.role as string;
					if (hookRes.data.permission)
						permission = hookRes.data.permission as Record<string, string[]>;
					const { role, permission: _permission, ...rest } = hookRes.data;
					// Filter to only declared additional fields
					const validAdditionalFieldKeys = Object.keys(
						additionalFieldsSchema.shape,
					);
					const filteredRest = Object.fromEntries(
						Object.entries(rest).filter(([key]) =>
							validAdditionalFieldKeys.includes(key),
						),
					);
					additionalFields = { ...additionalFields, ...filteredRest };
				}
			}

			// Re-validate permissions only if the beforeCreateRole hook actually modified them
			if (JSON.stringify(permission) !== originalPermissionForCreate) {
				await checkForInvalidResources({ ac, ctx, permission });
				await checkIfMemberHasPermission({
					ctx,
					member,
					options,
					organizationId,
					permissionRequired: permission,
					user,
					action: "create",
				});
			}

			// Re-validate role name only if the beforeCreateRole hook actually modified it
			if (roleName !== originalRoleName) {
				await checkIfRoleNameIsTakenByPreDefinedRole({
					role: roleName,
					organizationId,
					options,
					ctx,
				});
				await checkIfRoleNameIsTakenByRoleInDB({
					ctx,
					organizationId,
					role: roleName,
				});
			}

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

			if (options.organizationHooks?.afterCreateRole) {
				await options.organizationHooks.afterCreateRole({
					role: data,
					organization: organization!,
					user,
				});
			}

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
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				);
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
				throw APIError.from(
					"FORBIDDEN",
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				);
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
				throw APIError.from(
					"FORBIDDEN",
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE,
				);
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
					throw APIError.from(
						"BAD_REQUEST",
						ORGANIZATION_ERROR_CODES.CANNOT_DELETE_A_PRE_DEFINED_ROLE,
					);
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
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
				);
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
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
				);
			}

			existingRoleInDB.permission = JSON.parse(
				existingRoleInDB.permission as never as string,
			);

			let organization: Organization | null = null;
			if (
				options.organizationHooks?.beforeDeleteRole ||
				options.organizationHooks?.afterDeleteRole
			) {
				organization = await ctx.context.adapter.findOne<Organization>({
					model: "organization",
					where: [
						{
							field: "id",
							value: organizationId,
						},
					],
				});
				if (!organization) {
					ctx.context.logger.error(
						`[Dynamic Access Control] The organization associated with the role to be deleted does not exist in the database.`,
						{
							organizationId,
						},
					);
					throw APIError.from(
						"BAD_REQUEST",
						ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					);
				}
			}

			if (options.organizationHooks?.beforeDeleteRole) {
				await options.organizationHooks.beforeDeleteRole({
					role: existingRoleInDB,
					organization: organization!,
					user,
				});
			}

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

			if (options.organizationHooks?.afterDeleteRole) {
				await options.organizationHooks.afterDeleteRole({
					role: existingRoleInDB,
					organization: organization!,
					user,
				});
			}

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
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				);
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
				throw APIError.from(
					"FORBIDDEN",
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				);
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
				throw APIError.from(
					"FORBIDDEN",
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE,
				);
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
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				);
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
				throw APIError.from(
					"FORBIDDEN",
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				);
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
				throw APIError.from(
					"FORBIDDEN",
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE,
				);
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
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
				);
			}
			const role = await ctx.context.adapter.findOne<OrganizationRole>({
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
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
				);
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
				throw APIError.from(
					"NOT_IMPLEMENTED",
					ORGANIZATION_ERROR_CODES.MISSING_AC_INSTANCE,
				);
			}

			const organizationId =
				ctx.body.organizationId ?? session.activeOrganizationId;
			if (!organizationId) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The session is missing an active organization id to update a role. Either set an active org id, or pass an organizationId in the request body.`,
				);
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				);
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
				throw APIError.from(
					"FORBIDDEN",
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				);
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
				throw APIError.from(
					"FORBIDDEN",
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE,
				);
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
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
				);
			}
			const role = await ctx.context.adapter.findOne<OrganizationRole>({
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
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
				);
			}
			role.permission = role.permission
				? JSON.parse(role.permission as never as string)
				: undefined;

			const {
				permission: _,
				roleName: __,
				...additionalFields
			} = ctx.body.data;

			const updateData: Partial<OrganizationRole> = {
				...additionalFields,
			};

			if (ctx.body.data.permission) {
				const newPermission = ctx.body.data.permission;

				await checkForInvalidResources({ ac, ctx, permission: newPermission });

				await checkIfMemberHasPermission({
					ctx,
					member,
					options,
					organizationId,
					permissionRequired: newPermission,
					user,
					action: "update",
				});

				updateData.permission = newPermission;
			}
			if (ctx.body.data.roleName) {
				let newRoleName = ctx.body.data.roleName;

				newRoleName = normalizeRoleName(newRoleName);

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

			let organization: Organization | null = null;
			if (
				options.organizationHooks?.beforeUpdateRole ||
				options.organizationHooks?.afterUpdateRole
			) {
				organization = await ctx.context.adapter.findOne<Organization>({
					model: "organization",
					where: [
						{
							field: "id",
							value: organizationId,
						},
					],
				});
				if (!organization) {
					ctx.context.logger.error(
						`[Dynamic Access Control] The organization associated with the role to be updated does not exist in the database.`,
						{
							organizationId,
						},
					);
					throw APIError.from(
						"BAD_REQUEST",
						ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					);
				}
			}

			const originalPermissionForUpdate = updateData.permission
				? JSON.stringify(updateData.permission)
				: undefined;
			const originalRoleName = updateData.role;
			if (options.organizationHooks?.beforeUpdateRole) {
				const hookRes = await options.organizationHooks.beforeUpdateRole({
					role: role as OrganizationRole,
					updates: {
						...additionalFields,
						...(updateData.role ? { role: updateData.role } : {}),
						...(updateData.permission
							? {
									permission: updateData.permission,
								}
							: {}),
					},
					organization: organization!,
					user,
				});

				if (hookRes?.data) {
					if (hookRes.data.role) updateData.role = hookRes.data.role as string;
					if (hookRes.data.permission) {
						updateData.permission = hookRes.data.permission as Record<
							string,
							string[]
						>;
					}
					const { role: r, permission: p, ...rest } = hookRes.data;
					// Filter to only declared additional fields
					const validAdditionalFieldKeys = Object.keys(
						additionalFieldsSchema.shape,
					);
					const filteredRest = Object.fromEntries(
						Object.entries(rest).filter(([key]) =>
							validAdditionalFieldKeys.includes(key),
						),
					);
					Object.assign(updateData, filteredRest);
				}
			}

			// Re-validate permissions only if the beforeUpdateRole hook actually modified them
			if (
				updateData.permission &&
				JSON.stringify(updateData.permission) !== originalPermissionForUpdate
			) {
				await checkForInvalidResources({
					ac,
					ctx,
					permission: updateData.permission,
				});
				await checkIfMemberHasPermission({
					ctx,
					member,
					options,
					organizationId,
					permissionRequired: updateData.permission,
					user,
					action: "update",
				});
			}

			// Re-validate role name only if the beforeUpdateRole hook actually modified it
			if (updateData.role && updateData.role !== originalRoleName) {
				await checkIfRoleNameIsTakenByPreDefinedRole({
					role: updateData.role,
					organizationId,
					options,
					ctx,
				});
				await checkIfRoleNameIsTakenByRoleInDB({
					role: updateData.role,
					organizationId,
					ctx,
				});
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

			const updatedRole = {
				...role,
				...update,
				permission: updateData.permission || role.permission || null,
			} as OrganizationRole & ReturnAdditionalFields;

			if (options.organizationHooks?.afterUpdateRole) {
				await options.organizationHooks.afterUpdateRole({
					role: updatedRole,
					organization: organization!,
					user,
				});
			}

			// -----
			// Return the updated role
			return ctx.json({
				success: true,
				roleData: updatedRole,
			});
		},
	);
};

async function checkForInvalidResources({
	ac,
	ctx,
	permission,
}: {
	ac: AccessControl;
	ctx: GenericEndpointContext;
	permission: Record<string, string[]>;
}) {
	const validResources = Object.keys(ac.statements);
	const providedResources = Object.keys(permission);
	const hasInvalidResource = providedResources.some(
		(r) => !validResources.includes(r),
	);
	if (hasInvalidResource) {
		ctx.context.logger.error(
			`[Dynamic Access Control] The provided permission includes an invalid resource.`,
			{
				providedResources,
				validResources,
			},
		);
		throw APIError.from(
			"BAD_REQUEST",
			ORGANIZATION_ERROR_CODES.INVALID_RESOURCE,
		);
	}
}

async function checkIfMemberHasPermission({
	ctx,
	permissionRequired: permission,
	options,
	organizationId,
	member,
	user,
	action,
}: {
	ctx: GenericEndpointContext;
	permissionRequired: Record<string, string[]>;
	options: OrganizationOptions;
	organizationId: string;
	member: Member;
	user: User;
	action: "create" | "update" | "delete" | "read" | "list" | "get";
}) {
	const hasNecessaryPermissions: {
		resource: { [x: string]: string[] };
		hasPermission: boolean;
	}[] = [];
	const permissionEntries = Object.entries(permission);
	for await (const [resource, permissions] of permissionEntries) {
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
		let error: { code: string; message: string };
		if (action === "create")
			error = ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE;
		else if (action === "update")
			error = ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE;
		else if (action === "delete")
			error = ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE;
		else if (action === "read")
			error = ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE;
		else if (action === "list")
			error = ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE;
		else error = ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE;

		throw APIError.fromStatus("FORBIDDEN", {
			message: error.message,
			code: error.code,
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
		throw APIError.from(
			"BAD_REQUEST",
			ORGANIZATION_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
		);
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
		throw APIError.from(
			"BAD_REQUEST",
			ORGANIZATION_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
		);
	}
}
