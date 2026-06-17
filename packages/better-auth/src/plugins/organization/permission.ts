import { role, type Role } from "../access";
import type { OrganizationOptions } from "./types";

export const hasPermissionFn = (
	input: HasPermissionBaseInput,
	acRoles: {
		[x: string]: Role<any> | undefined;
	},
) => {
	if (!input.permissions) return false;

	const roles = input.role.split(",");
	const creatorRole = input.options.creatorRole || "owner";
	const isCreator = roles.includes(creatorRole);

	const allowCreatorsAllPermissions = input.allowCreatorAllPermissions || false;
	if (isCreator && allowCreatorsAllPermissions) return true;

	// Merge the statements of every role the user holds into a single set so a
	// permission is granted if *any* of the roles grants it, rather than
	// requiring a single role to grant all requested permissions.
	// @see https://github.com/better-auth/better-auth/issues/3011
	const mergedStatements: Record<string, string[]> = {};
	for (const r of roles) {
		const _role = acRoles[r as keyof typeof acRoles];
		if (!_role) continue;
		for (const [resource, actions] of Object.entries(_role.statements)) {
			const existing = mergedStatements[resource] ?? [];
			mergedStatements[resource] = [
				...new Set([...existing, ...(actions as readonly string[])]),
			];
		}
	}

	const result = role(mergedStatements).authorize(input.permissions);
	return result.success;
};

export type PermissionExclusive = {
	permissions: { [key: string]: string[] };
};

export const cacheAllRoles = new Map<
	string,
	{
		[x: string]: Role<any> | undefined;
	}
>();

export type HasPermissionBaseInput = {
	role: string;
	options: OrganizationOptions;
	allowCreatorAllPermissions?: boolean | undefined;
} & PermissionExclusive;
