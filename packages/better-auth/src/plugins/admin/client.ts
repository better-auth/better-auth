import type {
	BetterAuthClientPlugin,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import type { AccessControl, Role } from "../access";
import type { defaultStatements } from "./access";
import { adminAc, defaultRoles, userAc } from "./access";
import type { admin } from "./admin";
import type { HasPermissionBaseInput } from "./permission";
import { hasPermissionFn } from "./permission";
import type { InferUserRole } from "./schema";
import type { AdminOptions } from "./types";
import { ADMIN_ERROR_CODES } from "./error-codes";

/**
 * Using the same `hasPermissionFn` function, but without the need for a `ctx` parameter or the `organizationId` parameter.
 */
export const clientSideUserHasPermission = (input: HasPermissionBaseInput) => {
	const acRoles: {
		[x: string]: Role<any> | undefined;
	} = input.options?.roles || defaultRoles;

	return hasPermissionFn(input, acRoles);
};

export * from "./error-codes";

interface AdminClientOptions {
	ac?: AccessControl | undefined;
	roles?:
		| {
				[key in string]: Role;
		  }
		| undefined;
	schema?:
		| {
				role?:
					| {
							additionalFields?:
								| {
										[key: string]: DBFieldAttribute;
								  }
								| undefined;
					  }
					| undefined;
		  }
		| undefined;
	dynamicAccessControl?:
		| {
				enabled: boolean;
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
	type PermissionExclusive =
		| {
				/**
				 * @deprecated Use `permissions` instead
				 */
				permission: PermissionType;
				permissions?: never | undefined;
		  }
		| {
				permissions: PermissionType;
				permission?: never | undefined;
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
				schema: O["schema"];
				dynamicAccessControl: {
					enabled: O["dynamicAccessControl"] extends { enabled: true }
						? true
						: false;
				};
			}>
		>,
		getActions: () => ({
			$Infer: {} as O["dynamicAccessControl"] extends { enabled: true }
				? {
						Role: InferUserRole<O, true>;
					}
				: {},
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
					const isAuthorized = clientSideUserHasPermission({
						role: data.role as string,
						options: {
							ac: options?.ac,
							roles: roles,
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
		$ERROR_CODES: ADMIN_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export const inferAdminAdditionalFields = <
	O extends { options: BetterAuthOptions },
	S extends AdminOptions["schema"] = undefined,
>(
	schema?: S | undefined,
) => {
	type FindById<
		T extends readonly BetterAuthPlugin[],
		TargetId extends string,
	> = Extract<T[number], { id: TargetId }>;

	type Auth = O extends { options: any } ? O : { options: { plugins: [] } };

	type AdminPlugin = FindById<
		// @ts-expect-error
		Auth["options"]["plugins"],
		"admin"
	>;

	// The server schema can contain more properties other than additionalFields, but the client only supports additionalFields
	// if we don't remove all other properties we may see assignability issues

	type ExtractClientOnlyFields<T> = {
		[K in keyof T]: T[K] extends { additionalFields: infer AF }
			? T[K]
			: undefined;
	};

	type Schema = O extends Object
		? O extends Exclude<AdminOptions["schema"], undefined>
			? O
			: AdminPlugin extends { options: { schema: infer S } }
				? S extends AdminOptions["schema"]
					? ExtractClientOnlyFields<S>
					: undefined
				: undefined
		: undefined;
	return {} as undefined extends S ? Schema : S;
};

export type * from "./types";
