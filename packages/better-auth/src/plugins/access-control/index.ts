import { z } from "zod";
import {
	APIError,
	createAuthEndpoint,
	getSessionFromCtx,
	sessionMiddleware,
} from "../../api";
import type { BetterAuthPlugin, GenericEndpointContext } from "../../types";

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
	scope: string;
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
}

export const accessControl = (options: AccessControlOptions) => {
	const opts = {
		globalScope: "global",
		...options,
	};
	return {
		id: "access-control",
		endpoints: {
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
							{
								field: "scope",
								value: scope || opts.globalScope,
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
						name: z.string().optional(),
						scope: z.string(),
					}),
				},
				async (ctx) => {
					const { permissions, name, scope } = ctx.body;
					if (ctx.request) {
						await checkPermission(ctx, "role:create");
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
			assignRole: createAuthEndpoint(
				"/ac/assign-role",
				{
					method: "POST",
					body: z.object({
						userId: z.string(),
						roleId: z.string(),
						scope: z.string(),
					}),
				},
				async (ctx) => {
					const { userId, roleId, scope } = ctx.body;
					if (ctx.request) {
						await checkPermission(ctx, "role:assign");
					}
					const newRole = await ctx.context.adapter.create({
						model: "userRole",
						data: {
							id: ctx.context.uuid(),
							userId,
							roleId,
							scope,
						},
					});
					return newRole;
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
					 * The scope that this role is valid for.
					 */
					scope: {
						type: "string",
						required: true,
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
