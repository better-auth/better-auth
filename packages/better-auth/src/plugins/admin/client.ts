import type { BetterAuthClientPlugin } from "@better-auth/core";
import { type AccessControl, type Role } from "../access";
import { adminAc, defaultStatements, userAc } from "./access";
import type { admin } from "./admin";
import { hasPermission } from "./has-permission";
import type { SpecialPermissions } from "./types";

interface AdminClientOptions {
	ac?: AccessControl;
	roles?: {
		[key in string]: Role;
	};
	/**
	 * Special user role that uses per-user custom permissions
	 */
	specialNonAdminRole?: string;
	/**
	 * Special admin role that uses per-user custom permissions
	 */
	specialAdminRole?: string;
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
						? keyof O["roles"]
						: "admin" | "user",
					SP extends O extends AccessControl<infer S>
						? { [K in keyof S]?: string[] } | null | undefined
						: SpecialPermissions,
				>(
					data: PermissionExclusive & {
						role: R;
						specialPermissions?: SP;
					},
				) => {
					const isAuthorized = hasPermission({
						role: data.role as string,
						specialPermissions: data.specialPermissions,
						options: {
							ac: options?.ac,
							roles: roles,
							specialNonAdminRole: options?.specialNonAdminRole,
							specialAdminRole: options?.specialAdminRole,
						},
						permissions: (data.permissions ?? data.permission) as any,
					});
					return isAuthorized;
				},
			},
		}),
		pathMethods: {
			"/admin/list-users": "GET",
			"/admin/stop-impersonating": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
