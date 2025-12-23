import type { GenericEndpointContext } from "@better-auth/core";
import type { Where } from "@better-auth/core/db/adapter";
import * as z from "zod";
import { APIError, createAuthEndpoint } from "../../../api";
import type { AccessControl, IsExactlyEmptyObject } from "../../access";
import { normalizeRoleName } from "../../access";
import { adminMiddleware } from "../call";
import { ADMIN_ERROR_CODES } from "../error-codes";
import { hasPermission } from "../has-permission";
import type { UserRole } from "../schema";
import { getAdditionalFields } from "../schema";
import type { AdminOptions, UserWithRole } from "../types";

const baseCreateRoleSchema = z.object({
	role: z.string().meta({
		description: "The name of the role to create",
	}),
	permission: z.record(z.string(), z.array(z.string())).meta({
		description: "The permissions to assign to the role",
	}),
});

const deleteRoleSchema = z.union([
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
]);

const getRoleSchema = z.union([
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
]);

const baseUpdateRoleDataSchema = z.object({
	permission: z.record(z.string(), z.array(z.string())).optional().meta({
		description: "The permission to update the role with",
	}),
	roleName: z.string().optional().meta({
		description: "The name of the role to update",
	}),
});

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

export const createRole = <O extends AdminOptions>(options: O) => {
	const { additionalFieldsSchema, $AdditionalFields, $ReturnAdditionalFields } =
		getAdditionalFields<O>(options, false);
	type AdditionalFields = typeof $AdditionalFields;
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	return createAuthEndpoint(
		"/admin/create-role",
		{
			method: "POST",
			body: baseCreateRoleSchema.extend({
				additionalFields: z
					.object({
						...additionalFieldsSchema.shape,
					})
					.optional(),
			}),
			metadata: {
				$Infer: {
					body: {} as {
						role: string;
						permission: Record<string, string[]>;
					} & (IsExactlyEmptyObject<AdditionalFields> extends true
						? { additionalFields?: {} | undefined }
						: { additionalFields: AdditionalFields }),
				},
			},
			requireHeaders: true,
			use: [adminMiddleware],
		},
		async (ctx) => {
			const { user } = ctx.context.session;
			let { role: roleName, permission, additionalFields } = ctx.body;

			const ac = options.ac;
			if (!ac) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The admin plugin is missing a pre-defined ac instance.`,
					`\nPlease refer to the documentation here: https://better-auth.com/docs/plugins/admin#dynamic-access-control`,
				);
				throw new APIError("NOT_IMPLEMENTED", {
					message: ADMIN_ERROR_CODES.MISSING_AC_INSTANCE,
				});
			}

			roleName = normalizeRoleName(roleName);

			checkIfRoleNameIsTakenByPreDefinedRole({
				role: roleName,
				options,
				ctx,
			});

			const canCreateRole = await hasPermission(
				{
					userId: user.id,
					role: user.role,
					options,
					permissions: {
						ac: ["create"],
					},
				},
				ctx,
			);
			if (!canCreateRole) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The user is not permitted to create a role. If this is unexpected, please make sure the role associated to that member has the "ac" resource with the "create" permission.`,
					{
						userId: user.id,
						role: user.role,
					},
				);
				throw new APIError("FORBIDDEN", {
					message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE,
				});
			}

			await checkForInvalidResources({ ac, ctx, permission });

			await checkIfUserHasPermission({
				ctx,
				options,
				permissionRequired: permission,
				user,
				action: "create",
			});

			await checkIfRoleNameIsTakenByRoleInDB({
				ctx,
				role: roleName,
			});

			const newRole = ac.newRole(permission);

			const newRoleInDB = await ctx.context.adapter.create<
				Omit<UserRole, "permission"> & { permission: string }
			>({
				model: "role",
				data: {
					createdAt: new Date(),
					permission: JSON.stringify(permission),
					role: roleName,
					...additionalFields,
				},
			});

			const data = {
				...newRoleInDB,
				permission,
			} as UserRole & ReturnAdditionalFields;

			return ctx.json({
				success: true,
				roleData: data,
				statements: newRole.statements,
			});
		},
	);
};

export const deleteRole = <O extends AdminOptions>(options: O) => {
	return createAuthEndpoint(
		"/admin/delete-role",
		{
			method: "POST",
			body: deleteRoleSchema,
			requireHeaders: true,
			use: [adminMiddleware],
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
			const { user } = ctx.context.session;

			const canDeleteRole = await hasPermission(
				{
					options,
					userId: user.id,
					role: user.role,
					permissions: {
						ac: ["delete"],
					},
				},
				ctx,
			);
			if (!canDeleteRole) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The user is not permitted to delete a role. If this is unexpected, please make sure the role associated to that user has the "ac" resource with the "delete" permission.`,
					{
						userId: user.id,
						role: user.role,
					},
				);
				throw new APIError("FORBIDDEN", {
					message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE,
				});
			}

			if (ctx.body.roleName) {
				const roleName = normalizeRoleName(ctx.body.roleName);
				const defaultRoles = options.roles
					? Object.keys(options.roles)
					: ["admin", "user"];

				if (defaultRoles.includes(roleName)) {
					ctx.context.logger.error(
						"[Dynamic Access Control] Cannot delete a pre-defined role.",
						{
							roleName,
							defaultRoles,
						},
					);
					throw new APIError("BAD_REQUEST", {
						message: ADMIN_ERROR_CODES.CANNOT_DELETE_A_PRE_DEFINED_ROLE,
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
					message: ADMIN_ERROR_CODES.ROLE_NOT_FOUND,
				});
			}
			const existingRoleInDB = await ctx.context.adapter.findOne<UserRole>({
				model: "role",
				where: [condition],
			});
			if (!existingRoleInDB) {
				ctx.context.logger.error(
					"[Dynamic Access Control] The role name/id does not exist in the database.",
					"roleName" in ctx.body
						? { roleName: ctx.body.roleName }
						: { roleId: ctx.body.roleId },
				);
				throw new APIError("BAD_REQUEST", {
					message: ADMIN_ERROR_CODES.ROLE_NOT_FOUND,
				});
			}
			existingRoleInDB.permission = JSON.parse(
				existingRoleInDB.permission as never as string,
			);

			await ctx.context.adapter.delete({
				model: "role",
				where: [condition],
			});

			return ctx.json({
				success: true,
			});
		},
	);
};

export const listRoles = <O extends AdminOptions>(options: O) => {
	const { $ReturnAdditionalFields } = getAdditionalFields<O>(options, false);
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	return createAuthEndpoint(
		"/admin/list-roles",
		{
			method: "GET",
			requireHeaders: true,
			use: [adminMiddleware],
		},
		async (ctx) => {
			const { user } = ctx.context.session;

			const canListRoles = await hasPermission(
				{
					options,
					userId: user.id,
					role: user.role,
					permissions: {
						ac: ["read"],
					},
				},
				ctx,
			);
			let canOnlyListOwnRoles = false;
			if (!canListRoles) {
				canOnlyListOwnRoles = await hasPermission(
					{
						userId: user.id,
						role: user.role,
						options,
						permissions: {
							ac: ["read-own"],
						},
					},
					ctx,
				);

				if (!canOnlyListOwnRoles) {
					ctx.context.logger.error(
						"[Dynamic Access Control] The user is not permitted to list roles.",
						{
							userId: user.id,
							role: user.role,
						},
					);
					throw new APIError("FORBIDDEN", {
						message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE,
					});
				}
			}

			let conditions: Where[] = [];

			if (canOnlyListOwnRoles) {
				conditions.push({
					field: "role",
					value: (user.role || options.defaultRole || "user").split(","),
					operator: "in",
					connector: "AND",
				});
			}

			let roles = await ctx.context.adapter.findMany<
				UserRole & ReturnAdditionalFields
			>({
				model: "role",
				where: conditions,
			});

			roles = roles.map((x) => ({
				...x,
				permission: JSON.parse(x.permission as never as string),
			}));

			return ctx.json(roles);
		},
	);
};

export const getRole = <O extends AdminOptions>(options: O) => {
	const { $ReturnAdditionalFields } = getAdditionalFields<O>(options, false);
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;
	return createAuthEndpoint(
		"/admin/get-role",
		{
			method: "GET",
			requireHeaders: true,
			use: [adminMiddleware],
			query: getRoleSchema,
			metadata: {
				$Infer: {
					query: {} as {
						roleName?: string | undefined;
						roleId?: string | undefined;
					},
				},
			},
		},
		async (ctx) => {
			const { user } = ctx.context.session;

			const canListRoles = await hasPermission(
				{
					options,
					userId: user.id,
					role: user.role,
					permissions: {
						ac: ["read"],
					},
				},
				ctx,
			);
			let canOnlyReadOwnRoles = false;
			if (!canListRoles) {
				canOnlyReadOwnRoles = await hasPermission(
					{
						userId: user.id,
						role: user.role,
						options,
						permissions: {
							ac: ["read-own"],
						},
					},
					ctx,
				);

				if (!canOnlyReadOwnRoles) {
					ctx.context.logger.error(
						"[Dynamic Access Control] The user is not permitted to read a role.",
						{
							userId: user.id,
							role: user.role,
						},
					);
					throw new APIError("FORBIDDEN", {
						message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE,
					});
				}
			}

			let conditions: Where[] = [];
			if (ctx.query?.roleName) {
				conditions.push({
					field: "role",
					value: ctx.query.roleName,
					operator: "eq",
					connector: "AND",
				});
			} else if (ctx.query?.roleId) {
				conditions.push({
					field: "id",
					value: ctx.query.roleId,
					operator: "eq",
					connector: "AND",
				});
			} else {
				// shouldn't be able to reach here given the schema validation.
				// But just in case, throw an error.
				ctx.context.logger.error(
					`[Dynamic Access Control] The role name/id is not provided in the request body.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: ADMIN_ERROR_CODES.ROLE_NOT_FOUND,
				});
			}

			let role = await ctx.context.adapter.findOne<UserRole>({
				model: "role",
				where: conditions,
			});
			if (!role) {
				ctx.context.logger.error(
					"[Dynamic Access Control] The role name/id does not exist in the database.",
					"roleName" in ctx.query
						? { roleName: ctx.query.roleName }
						: { roleId: ctx.query.roleId },
				);
				throw new APIError("BAD_REQUEST", {
					message: ADMIN_ERROR_CODES.ROLE_NOT_FOUND,
				});
			}

			const userRole = (user.role || options.defaultRole || "user").split(",");
			if (canOnlyReadOwnRoles && !userRole.some((r) => r === role.role)) {
				throw new APIError("FORBIDDEN", {
					message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE,
				});
			}

			role.permission = JSON.parse(role.permission as never as string);

			return ctx.json(role as UserRole & ReturnAdditionalFields);
		},
	);
};

export const updateRole = <O extends AdminOptions>(options: O) => {
	const { additionalFieldsSchema, $AdditionalFields, $ReturnAdditionalFields } =
		getAdditionalFields<O, true>(options, true);
	type AdditionalFields = typeof $AdditionalFields;
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	return createAuthEndpoint(
		"/admin/update-role",
		{
			method: "POST",
			body: z
				.object({
					data: baseUpdateRoleDataSchema.extend({
						...additionalFieldsSchema.shape,
					}),
				})
				.and(roleNameOrIdSchema),
			metadata: {
				$Infer: {
					body: {} as {
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
			use: [adminMiddleware],
		},
		async (ctx) => {
			const { user } = ctx.context.session;

			const ac = options.ac;
			if (!ac) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The admin plugin is missing a pre-defined ac instance.`,
					`\nPlease refer to the documentation here: https://better-auth.com/docs/plugins/admin#dynamic-access-control`,
				);
				throw new APIError("NOT_IMPLEMENTED", {
					message: ADMIN_ERROR_CODES.MISSING_AC_INSTANCE,
				});
			}

			const canUpdateRole = await hasPermission(
				{
					options,
					userId: user.id,
					role: user.role,
					permissions: {
						ac: ["update"],
					},
				},
				ctx,
			);
			if (!canUpdateRole) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The user is not permitted to update a role.`,
					{
						userId: user.id,
						role: user.role,
					},
				);
				throw new APIError("FORBIDDEN", {
					message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE,
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
					message: ADMIN_ERROR_CODES.ROLE_NOT_FOUND,
				});
			}

			let role = await ctx.context.adapter.findOne<UserRole>({
				model: "role",
				where: [condition],
			});
			if (!role) {
				ctx.context.logger.error(
					`[Dynamic Access Control] The role name/id does not exist in the database.`,
					"roleName" in ctx.body
						? { roleName: ctx.body.roleName }
						: { roleId: ctx.body.roleId },
				);
				throw new APIError("BAD_REQUEST", {
					message: ADMIN_ERROR_CODES.ROLE_NOT_FOUND,
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

			let updateData: Partial<UserRole> = {
				...additionalFields,
			};

			if (ctx.body.data.permission) {
				let newPermission = ctx.body.data.permission;

				await checkForInvalidResources({
					ac,
					ctx,
					permission: newPermission,
				});

				await checkIfUserHasPermission({
					ctx,
					user,
					options,
					permissionRequired: newPermission,
					action: "update",
				});

				updateData.permission = newPermission;
			}
			if (ctx.body.data.roleName) {
				const newRoleName = normalizeRoleName(ctx.body.data.roleName);

				checkIfRoleNameIsTakenByPreDefinedRole({
					role: newRoleName,
					options,
					ctx,
				});

				await checkIfRoleNameIsTakenByRoleInDB({
					role: newRoleName,
					ctx,
				});

				updateData.role = newRoleName;
			}

			// -----
			// Apply the updates
			const update = {
				...updateData,
				...(updateData.permission
					? {
							permission: JSON.stringify(updateData.permission),
						}
					: {}),
			};
			await ctx.context.adapter.update<UserRole>({
				model: "role",
				where: [condition],
				update,
			});

			return ctx.json({
				success: true,
				roleData: {
					...role,
					...update,
					permission: updateData.permission || role.permission || null,
				} as UserRole & ReturnAdditionalFields,
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
			message: ADMIN_ERROR_CODES.INVALID_RESOURCE,
		});
	}
}

function checkIfRoleNameIsTakenByPreDefinedRole({
	options,
	role,
	ctx,
}: {
	options: AdminOptions;
	role: string;
	ctx: GenericEndpointContext;
}) {
	const defaultRoles = options.roles
		? Object.keys(options.roles)
		: ["admin", "user"];
	if (defaultRoles.includes(role)) {
		ctx.context.logger.error(
			`[Dynamic Access Control] The role name "${role}" is already taken by a pre-defined role.`,
			{
				role,
				defaultRoles,
			},
		);
		throw new APIError("BAD_REQUEST", {
			message: ADMIN_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
		});
	}
}

async function checkIfRoleNameIsTakenByRoleInDB({
	role,
	ctx,
}: {
	role: string;
	ctx: GenericEndpointContext;
}) {
	const existingRoleInDB = await ctx.context.adapter.findOne<UserRole>({
		model: "role",
		where: [
			{
				field: "role",
				value: role,
				operator: "eq",
			},
		],
	});
	if (existingRoleInDB) {
		ctx.context.logger.error(
			`[Dynamic Access Control] The role name "${role}" is already taken by a role in the database.`,
		);
		throw new APIError("BAD_REQUEST", {
			message: ADMIN_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
		});
	}
}

async function checkIfUserHasPermission({
	ctx,
	permissionRequired: permission,
	options,
	user,
	action,
}: {
	ctx: GenericEndpointContext;
	permissionRequired: Record<string, string[]>;
	options: AdminOptions;
	user: UserWithRole;
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
						permissions: { [resource]: [perm] },
						useMemoryCache: true,
						userId: user.id,
						role: user.role,
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
	if (missingPermissions.length === 0) return;

	ctx.context.logger.error(
		`[Dynamic Access Control] The user is missing permissions necessary to ${action} a role with those set of permissions.\n`,
		{
			userId: user.id,
			role: user.role,
			missingPermissions,
		},
	);
	let errorMessage: string;
	switch (action) {
		case "create":
			errorMessage = ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE;
			break;
		case "update":
			errorMessage = ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE;
			break;
		case "delete":
			errorMessage = ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE;
			break;
		case "read":
			errorMessage = ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE;
			break;
		case "list":
			errorMessage = ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE;
			break;
		default:
			errorMessage = ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE;
	}

	throw new APIError("FORBIDDEN", {
		message: errorMessage,
		missingPermissions,
	});
}
