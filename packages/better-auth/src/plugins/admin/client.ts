import type { admin } from ".";
import { BetterAuthError } from "../../error";
import type { BetterAuthClientPlugin } from "../../types";
import {
	adminAc,
	userAc,
	type AccessControl,
	type defaultStatements,
	type Role,
} from "./access";

interface AdminClientOptions {
	ac: AccessControl;
	roles: {
		[key in string]: Role;
	};
}

export const adminClient = <O extends AdminClientOptions>(options?: O) => {
	type DefaultStatements = typeof defaultStatements;
	type Statements = O["ac"] extends AccessControl<infer S>
		? S extends Record<string, Array<any>>
			? S & DefaultStatements
			: DefaultStatements
		: DefaultStatements;
	const roles = {
		admin: adminAc,
		user: userAc,
		...options?.roles,
	};

	return {
		id: "better-auth-client",
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
		getActions: ($fetch) => ({
			admin: {
				checkRolePermission: <
				R extends O extends { roles: any }
					? keyof O["roles"]
					: "admin" | "user",
			>(data: {
				role: R;
				permission: {
					//@ts-expect-error fix this later
					[key in keyof Statements]?: Statements[key][number][];
				};
			}) => {
				if (Object.keys(data.permission).length > 1) {
					throw new BetterAuthError(
						"you can only check one resource permission at a time.",
					);
				}
				const role = roles[data.role as unknown as "admin"];
				if (!role) {
					return false;
				}
				const isAuthorized = role?.authorize(data.permission as any);
				return isAuthorized.success;
			},
			}
		}),
		pathMethods: {
			"/admin/list-users": "GET",
			"/admin/stop-impersonating": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
