import * as z from "zod/v4";
import { APIError, createAuthEndpoint } from "../../../api";
import type { OrganizationOptions } from "../types";
import { orgSessionMiddleware } from "../call";
import { hasPermission } from "../has-permission";
import type { Member, OrganizationRole } from "../schema";
import type { GenericEndpointContext, User, Where } from "../../../types";
import type { AccessControl } from "../../access";
import {
	toZodSchema,
	type InferAdditionalFieldsFromPluginOptions,
} from "../../../db";

type IsExactlyEmptyObject<T> = keyof T extends never // no keys
	? T extends {} // is assignable to {}
		? {} extends T
			? true
			: false // and {} is assignable to it
		: false
	: false;

const normalizeRoleName = (x: { role: string }) => x.role.toLowerCase();
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
			additionalFields[key].required = false;
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
		$AdditionalFields: {} as AllPartial extends true
			? Partial<AdditionalFields>
			: AdditionalFields,
		$ReturnAdditionalFields: {} as ReturnAdditionalFields,
	};
};

export const createOrgRole = <O extends OrganizationOptions>(options: O) => {
	const { additionalFieldsSchema, $AdditionalFields, $ReturnAdditionalFields } =
		getAdditionalFields<O>(options, false);
	type AdditionalFields = typeof $AdditionalFields;
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	return createAuthEndpoint(
		"/organization/create-role",
		{
			method: "POST",
			body: z.object({
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
				additionalFields: z
					.object({ ...additionalFieldsSchema.shape })
					.optional(),
			}),
			metadata: {
				$Infer: {
					body: {} as {
						organizationId?: string;
						role: string;
						permission: Record<string, string[]>;
					} & (IsExactlyEmptyObject<AdditionalFields> extends true
						? { additionalFields?: {} }
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
					message:
						"Dynamic Access Control requires a pre-defined ac instance on the server auth plugin. Read server logs for more information.",
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
					message: "You must be in an organization to create a role.",
				});
			}

			roleName = normalizeRoleName({
				role: roleName,
			});

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
					message: "You are not a member of this organization.",
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
					message: "You are not permitted to create a role.",
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
					message:
						"The organization has too many roles. Please delete some roles to create a new one.",
				});
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

export const deleteOrgRole = <O extends OrganizationOptions>(options: O) => {
	return createAuthEndpoint(
		"/organization/delete-role",
		{
			method: "POST",
			body: z
				.object({
					organizationId: z.string().optional().meta({
						description:
							"The id of the organization to create the role in. If not provided, the user's active organization will be used.",
					}),
				})
				.and(
					z.union([
						z.object({
							roleName: z.string().meta({
								description: "The name of the role to delete",
							}),
						}),
						z.object({
							roleId: z.string().meta({
								description: "The id of the role to delete",
							}),
						}),
					]),
				),
			requireHeaders: true,
			use: [orgSessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as (
						| {
								roleName: string;
						  }
						| {
								roleId: string;
						  }
					) & { organizationId?: string },
				},
			},
		},
		async (ctx) => {
			const { session, user } = ctx.context.session;

			// We can verify if the org id is valid and associated with the user in the next step when we try to find the member.
			const organizationId =
				ctx.body.organizationId ?? session.activeOrganizationId;
			if (!organizationId) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The session is missing an active organization id to delete a role. Either set an active org id, or pass an organizationId in the request body.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: "You must be in an organization to delete a role.",
				});
			}

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
					`[Dynamic Access Control] The user is not a member of the organization to delete a role.`,
					{
						userId: user.id,
						organizationId,
					},
				);
				throw new APIError("FORBIDDEN", {
					message: "You are not a member of this organization.",
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
					message: "You are not permitted to delete a role.",
				});
			}

			if ("roleName" in ctx.body) {
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
						message: "Cannot delete a pre-defined role.",
					});
				}
			}

			let condition: Where;
			if ("roleName" in ctx.body) {
				condition = {
					field: "role",
					value: ctx.body.roleName,
					operator: "eq",
					connector: "AND",
				};
			} else {
				condition = {
					field: "id",
					value: ctx.body.roleId,
					operator: "eq",
					connector: "AND",
				};
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
					message: "The provided role name or id does not exist.",
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

export const listOrgRoles = <O extends OrganizationOptions>(options: O) => {
	const { $ReturnAdditionalFields } = getAdditionalFields<O>(options, false);
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	return createAuthEndpoint(
		"/organization/list-roles",
		{
			method: "GET",
			use: [orgSessionMiddleware],
			query: z
				.object({
					organizationId: z.string().optional().meta({
						description:
							"The id of the organization to list roles for. If not provided, the user's active organization will be used.",
					}),
				})
				.optional(),
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
					message: "You must be in an organization to list roles.",
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
					message: "You are not a member of this organization.",
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
					message: "You are not permitted to list roles.",
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

export const getOrgRole = <O extends OrganizationOptions>(options: O) => {
	const { $ReturnAdditionalFields } = getAdditionalFields<O>(options, false);
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;
	return createAuthEndpoint(
		"/organization/get-role",
		{
			method: "GET",
			use: [orgSessionMiddleware],
			query: z
				.object({
					organizationId: z.string().optional().meta({
						description:
							"The id of the organization to read a role for. If not provided, the user's active organization will be used.",
					}),
				})
				.and(
					z.union([
						z.object({
							roleName: z.string().meta({
								description: "The name of the role to read",
							}),
						}),
						z.object({
							roleId: z.string().meta({
								description: "The id of the role to read",
							}),
						}),
					]),
				)
				.optional(),
			metadata: {
				$Infer: {
					query: {} as {
						organizationId?: string;
					} & ({ roleName: string } | { roleId: string }),
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
					message: "You must be in an organization to read a role.",
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
					message: "You are not a member of this organization.",
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
					message: "You are not permitted to read a role.",
				});
			}

			let condition: Where;
			if ("roleName" in ctx.query) {
				condition = {
					field: "role",
					value: ctx.query.roleName,
					operator: "eq",
					connector: "AND",
				};
			} else {
				condition = {
					field: "id",
					value: ctx.query.roleId,
					operator: "eq",
					connector: "AND",
				};
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
					message: "That role does not exist.",
				});
			}

			role.permission = JSON.parse(role.permission as never as string);

			return ctx.json(role as OrganizationRole & ReturnAdditionalFields);
		},
	);
};

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
				.and(
					z.union([
						z.object({
							roleName: z.string().meta({
								description: "The name of the role to update",
							}),
						}),
						z.object({
							roleId: z.string().meta({
								description: "The id of the role to update",
							}),
						}),
					]),
				),
			metadata: {
				$Infer: {
					body: {} as {
						organizationId?: string;
						data: {
							permission?: Record<string, string[]>;
							roleName?: string;
						} & AdditionalFields;
					} & ({ roleName: string } | { roleId: string }),
				},
			},
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
					message:
						"Dynamic Access Control requires a pre-defined ac instance on the server auth plugin. Read server logs for more information.",
				});
			}

			const organizationId =
				ctx.body.organizationId ?? session.activeOrganizationId;
			if (!organizationId) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The session is missing an active organization id to update a role. Either set an active org id, or pass an organizationId in the request body.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: "You must be in an organization to update a role.",
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
					message: "You are not a member of this organization.",
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
					message: "You are not permitted to update a role.",
				});
			}

			let condition: Where;
			if ("roleName" in ctx.body) {
				condition = {
					field: "role",
					value: ctx.body.roleName,
					operator: "eq",
					connector: "AND",
				};
			} else {
				condition = {
					field: "id",
					value: ctx.body.roleId,
					operator: "eq",
					connector: "AND",
				};
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
					message: "That role does not exist.",
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

			if (ctx.body.data.permission) {
				let newPermission = ctx.body.data.permission;

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

				newRoleName = normalizeRoleName({
					role: newRoleName,
				});

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
		throw new APIError("BAD_REQUEST", {
			message: `The provided permission includes an invalid resource.`,
		});
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
			const key = Object.keys(x.resource)[0];
			return `${key}:${x.resource[key][0]}` as const;
		});
	if (missingPermissions.length > 0) {
		ctx.context.logger.error(
			`[Dynamic Access Control] The user is missing permissions nessesary to ${action} a role with those set of permissions.\n`,
			{
				userId: user.id,
				organizationId,
				role: member.role,
				missingPermissions,
			},
		);
		throw new APIError("FORBIDDEN", {
			message: `You are not permitted to ${action} a role with those set of permissions. Please get someone with high enough permissions to ${action} this role.`,
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
			message: "That role name is already taken.",
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
			message: "That role name is already taken.",
		});
	}
}
