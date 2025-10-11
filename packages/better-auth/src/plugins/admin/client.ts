import type { BetterAuthClientPlugin } from "@better-auth/core";
import { type AccessControl, type Role } from "../access";
import { adminAc, defaultStatements, userAc } from "./access";
import type { admin } from "./admin";
import { getStatements, hasPermission } from "./has-permission";

interface AdminClientOptions {
	ac?: AccessControl;
	roles?: {
		[key in string]: Role;
	};
}

export const adminClient = <O extends AdminClientOptions>(options?: O) => {
	type DefaultStatements = typeof defaultStatements;
	type Statements = O["ac"] extends AccessControl<infer S>
		? S
		: DefaultStatements;
	type PermissionType = {
		[key in keyof Statements]?: Array<
			Statements[key] extends readonly unknown[]
				? Statements[key][number]
				: never
		>;
	};
	type PermissionExclusive =
		| {
				/**
				 * @deprecated Use `permissions` instead
				 */
				permission: PermissionType;
				permissions?: never;
		  }
		| {
				permissions: PermissionType;
				permission?: never;
		  };

	const roles = {
		admin: adminAc,
		user: userAc,
		...options?.roles,
	};

	return {
		id: "admin-client",
		$InferServerPlugin: {} as ReturnType<
			typeof admin<{
				ac: O["ac"] extends AccessControl
					? O["ac"]
					: AccessControl<DefaultStatements>;
				roles: O["roles"] extends Record<string, Role>
					? O["roles"]
					: {
							admin: Role;
							user: Role;
						};
			}>
		>,
		getActions: () => ({
			admin: {
				checkRolePermission: <
					R extends O extends { roles: any }
						? keyof O["roles"] & string
						: "admin" | "user",
				>(
					data: PermissionExclusive & {
						role: R;
					},
				) => {
					const isAuthorized = hasPermission({
						role: data.role,
						options: {
							ac: options?.ac,
							roles: roles,
						},
						permissions: (data.permissions ?? data.permission) as any,
					});
					return isAuthorized;
				},
				checkRoleStatements: <
					R extends O extends { roles: any }
						? keyof O["roles"] & string
						: "admin" | "user",
				>(data: {
					role: R | R[];
				}) => {
					return getStatements({
						role: data.role,
						options: {
							ac: options?.ac,
							roles,
						},
					});
				},
			},
		}),
		pathMethods: {
			"/admin/list-users": "GET",
			"/admin/stop-impersonating": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
