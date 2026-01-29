import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { AccessControl, Role } from "../access";
import type { defaultStatements } from "./access";
import { adminAc, userAc } from "./access";
import type { admin } from "./admin";
import { ADMIN_ERROR_CODES } from "./error-codes";
import { hasPermission } from "./has-permission";

export * from "./error-codes";

interface AdminClientOptions {
	ac?: AccessControl | undefined;
	roles?:
		| {
				[key in string]: Role;
		  }
		| undefined;
}

export const adminClient = <O extends AdminClientOptions>(
	options?: O | undefined,
) => {
	type DefaultStatements = typeof defaultStatements;
	type Statements =
		O["ac"] extends AccessControl<infer S> ? S : DefaultStatements;
	type PermissionType = {
		[key in keyof Statements]?: Array<
			Statements[key] extends readonly unknown[]
				? Statements[key][number]
				: never
		>;
	};
	type PermissionExclusive = {
		permissions: PermissionType;
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
				>(
					data: PermissionExclusive & {
						role: R;
					},
				) => {
					const isAuthorized = hasPermission({
						role: data.role as string,
						options: {
							ac: options?.ac,
							roles: roles,
						},
						permissions: data.permissions as any,
					});
					return isAuthorized;
				},
			},
		}),
		pathMethods: {
			"/admin/list-users": "GET",
			"/admin/stop-impersonating": "POST",
		},
		$ERROR_CODES: ADMIN_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type * from "./types";
