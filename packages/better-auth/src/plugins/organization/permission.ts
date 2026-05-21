import type { Role } from "../access";
import type { OrganizationOptions } from "./types";

export type AccessControlRoleMap = {
	[x: string]: Role<any> | undefined;
};

export const hasPermissionFn = (
	input: HasPermissionBaseInput,
	acRoles: AccessControlRoleMap,
) => {
	if (!input.permissions) return false;

	const roles = input.role
		.split(",")
		.map((role) => role.trim())
		.filter(Boolean);
	const creatorRole = input.options.creatorRole || "owner";
	const isCreator = roles.includes(creatorRole);

	const allowCreatorsAllPermissions = input.allowCreatorAllPermissions || false;
	if (isCreator && allowCreatorsAllPermissions) return true;

	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(input.permissions);
		if (result?.success) {
			return true;
		}
	}
	return false;
};

export type PermissionExclusive = {
	permissions: { [key: string]: string[] };
};

export type InMemoryRoleCacheEntry = {
	expiresAt: number;
	roles: AccessControlRoleMap;
};

export const cacheAllRoles = new Map<string, InMemoryRoleCacheEntry>();

export type HasPermissionBaseInput = {
	role: string;
	options: OrganizationOptions;
	allowCreatorAllPermissions?: boolean | undefined;
} & PermissionExclusive;
