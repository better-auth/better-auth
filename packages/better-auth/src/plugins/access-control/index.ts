import { z } from "zod";
import {
	APIError,
	createAuthEndpoint,
	getSessionFromCtx,
	sessionMiddleware,
} from "../../api";
import type {
	BetterAuthPlugin,
	GenericEndpointContext,
	User,
} from "../../types";

interface AccessControlOptions {
	/**
	 * The global scope is the default scope that is used when no scope is provided.
	 * It's a scope that is applicable throughout the application.
	 *
	 * @default "global"
	 */
	globalScope?: string;
}

interface StoredRole {
	id: string;
	permissions: string;
	name?: string;
	scope: string;
}

interface Role {
	id: string;
	permissions: string[];
	name?: string;
	scope: string;
}

interface UserRole {
	id: string;
	userId: string;
	roleId: string;
}

const superPermission = "*";

async function checkPermission(
	ctx: GenericEndpointContext,
	permission: string,
) {
	const { user } = await getSessionFromCtx(ctx);
	const userRole = await ctx.context.adapter.findOne<UserRole>({
		model: "userRole",
		where: [
			{
				field: "userId",
				value: user.id,
			},
			{
				field: "scope",
				value: ctx.body.scope,
			},
		],
	});
	if (!userRole) {
		throw new APIError("FORBIDDEN", {
			message: "You do not have permission required to perform this action.",
		});
	}
	const role = await ctx.context.adapter.findOne<Role>({
		model: "role",
		where: [
			{
				field: "id",
				value: userRole.roleId,
			},
		],
	});
	if (!role || !role.permissions.includes(permission || superPermission)) {
		throw new APIError("FORBIDDEN", {
			message: "You do not have permission required to perform this action.",
		});
	}
	return {
		userRole,
		user,
	};
}

export const accessControl = (options: AccessControlOptions) => {
	const opts = {
		globalScope: "global",
		...options,
	};
	return {
		id: "access-control",
		endpoints: {
			getPermissions: createAuthEndpoint(
				"/ac/get-permissions",
				{
					method: "GET",
					query: z.object({
						scope: z.string(),
						userId: z.string().optional(),
					}),
				},
				async (ctx) => {
					let user: User | null = null;
					if (ctx.request) {
						const session = await getSessionFromCtx(ctx);
						user = session.user;
					} else {
						if (!ctx.query.userId) {
							throw new APIError("BAD_REQUEST", {
								message: "userId is required",
							});
						}
						user = await ctx.context.internalAdapter.findUserById(
							ctx.query.userId,
						);
					}
					if (!user) {
						throw new APIError("FORBIDDEN", {
							message:
								"You do not have permission required to perform this action.",
						});
					}
					const userRoles = await ctx.context.adapter.findMany<UserRole>({
						model: "userRole",
						where: [
							{
								field: "userId",
								value: user.id,
							},
						],
					});
					if (!userRoles.length) {
						return {
							permissions: [],
						};
					}
					const rolePromises = userRoles.map(async (userRole) => {
						const role = await ctx.context.adapter.findOne<StoredRole>({
							model: "role",
							where: [
								{
									field: "id",
									value: userRole.roleId,
								},
								{
									field: "scope",
									value: opts.globalScope,
								},
							],
						});
						return role;
					});
					const rolePermissions = (await Promise.all(rolePromises))
						.map((role) =>
							role ? (JSON.parse(role?.permissions) as Array<string>) : [],
						)
						.flat();
					return {
						permissions: rolePermissions,
					};
				},
			),
			hasPermission: createAuthEndpoint(
				"/ac/has-permission",
				{
					method: "POST",
					body: z.object({
						permission: z.string().or(z.array(z.string())),
						scope: z.string().optional(),
					}),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const { permission, scope } = ctx.body;
					const { user } = ctx.context.session;
					const userRoles = await ctx.context.adapter.findMany<UserRole>({
						model: "userRole",
						where: [
							{
								field: "userId",
								value: user.id,
							},
						],
					});
					if (!userRoles.length) {
						return {
							hasPermission: false,
						};
					}
					const rolePromises = userRoles.map(async (userRole) => {
						const role = await ctx.context.adapter.findOne<StoredRole>({
							model: "role",
							where: [
								{
									field: "id",
									value: userRole.roleId,
								},
								{
									field: "scope",
									value: scope || opts.globalScope,
								},
							],
						});
						return role;
					});
					const rolePermissions = (await Promise.all(rolePromises))
						.map((role) =>
							role ? (JSON.parse(role?.permissions) as Array<string>) : [],
						)
						.flat();
					const hasPermission = Array.isArray(permission)
						? permission.every(
								(p) =>
									rolePermissions.includes(p) ||
									rolePermissions.includes(superPermission),
							)
						: rolePermissions.includes(permission) ||
							rolePermissions.includes(superPermission);

					return {
						hasPermission,
					};
				},
			),
			createRole: createAuthEndpoint(
				"/ac/create-role",
				{
					method: "POST",
					body: z.object({
						permissions: z.array(z.string()),
						name: z.string(),
						scope: z.string(),
					}),
				},
				async (ctx) => {
					const { permissions, name, scope } = ctx.body;
					if (ctx.request) {
						await checkPermission(ctx, "role:create");
					}
					const existingRole = await ctx.context.adapter.findMany<Role>({
						model: "role",
						where: [
							{
								field: "name",
								value: name,
							},
							{
								field: "scope",
								value: scope,
							},
						],
					});
					if (existingRole.length) {
						throw new APIError("BAD_REQUEST", {
							message: "Role with this name already exists.",
						});
					}
					const newRole = await ctx.context.adapter.create({
						model: "role",
						data: {
							id: ctx.context.uuid(),
							permissions: JSON.stringify(permissions),
							name,
							scope,
						},
					});
					return newRole;
				},
			),
			assignRoleByName: createAuthEndpoint(
				"/ac/assign-role-by-name",
				{
					method: "POST",
					body: z.object({
						roleName: z.string(),
						scope: z.string(),
						userId: z.string(),
					}),
				},
				async (ctx) => {
					const { roleName, scope, userId } = ctx.body;
					if (ctx.request) {
						await checkPermission(ctx, "role:assign");
					}
					const role = await ctx.context.adapter.findOne<Role>({
						model: "role",
						where: [
							{
								field: "name",
								value: roleName,
							},
							{
								field: "scope",
								value: scope,
							},
						],
					});
					if (!role) {
						throw new APIError("NOT_FOUND", {
							message: "Role not found.",
						});
					}
					const newRole = await ctx.context.adapter.create({
						model: "userRole",
						data: {
							id: ctx.context.uuid(),
							userId,
							roleId: role.id,
						},
					});
					return newRole;
				},
			),
			assignRoleById: createAuthEndpoint(
				"/ac/assign-role",
				{
					method: "POST",
					body: z.object({
						userId: z.string(),
						roleId: z.string(),
					}),
				},
				async (ctx) => {
					const { userId, roleId } = ctx.body;
					if (ctx.request) {
						await checkPermission(ctx, "role:assign");
					}
					const newRole = await ctx.context.adapter.create({
						model: "userRole",
						data: {
							id: ctx.context.uuid(),
							userId,
							roleId,
						},
					});
					return newRole;
				},
			),
			updateRolePermissions: createAuthEndpoint(
				"/ac/update-role",
				{
					method: "POST",
					body: z.object({
						roleId: z.string(),
						permission: z.array(z.string()),
					}),
				},
				async (ctx) => {},
			),
			removeRolePermissions: createAuthEndpoint(
				"/ac/update-role",
				{
					method: "POST",
					body: z.object({
						roleId: z.string(),
						permission: z.array(z.string()),
					}),
				},
				async (ctx) => {
					const role = await ctx.context.adapter.findOne({
						model: "role",
						where: [
							{
								field: "id",
								value: ctx.body.roleId,
							},
						],
					});
					if (!role) {
						throw new APIError("BAD_REQUEST", {
							message: "Role not found",
						});
					}
				},
			),
		},
		schema: {
			role: {
				tableName: "role",
				fields: {
					/**
					 * The permissions that this role has.
					 */
					permissions: {
						type: "string",
						required: true,
					},
					/**
					 * The name of the role.
					 */
					name: {
						type: "string",
					},
					/**
					 * The scope that this role is valid for.
					 */
					scope: {
						type: "string",
						required: true,
					},
				},
			},
			userRole: {
				tableName: "userRole",
				fields: {
					/**
					 * The user that this role is assigned to.
					 */
					userId: {
						fieldName: "userId",
						type: "string",
						references: {
							model: "user",
							field: "id",
						},
					},
					/**
					 * The role that this user has.
					 */
					roleId: {
						type: "string",
						references: {
							model: "role",
							field: "id",
						},
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
};
