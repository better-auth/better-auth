import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version.js";
import type { AccessControl, ArrayElement, Role } from "../access/index.js";
import type { defaultStatements } from "./access/index.js";
import { adminAc, userAc } from "./access/index.js";
import type { admin } from "./admin.js";
import { ADMIN_ERROR_CODES } from "./error-codes.js";
import { hasPermission } from "./has-permission.js";

export * from "./error-codes.js";

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
				? ArrayElement<Statements[key]>
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
		version: PACKAGE_VERSION,
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

export type * from "./types.js";
