import { type Role, type Statements, mergeRoles } from "../access";
import { parseRoleList } from "./roles";
import type { OrganizationOptions } from "./types";

export const hasPermissionFn = (
	input: HasPermissionBaseInput,
	acRoles: {
		[x: string]: Role<Statements> | undefined;
	},
) => {
	if (!input.permissions) return false;

	const roles = parseRoleList(input.role);
	const creatorRole = input.options.creatorRole || "owner";
	const isCreator = roles.includes(creatorRole);

	const allowCreatorsAllPermissions = input.allowCreatorAllPermissions || false;
	if (isCreator && allowCreatorsAllPermissions) return true;

	const getRole = (name: string): Role<Statements> | undefined =>
		Object.hasOwn(acRoles, name) ? acRoles[name] : undefined;

	for (const role of roles) {
		const _role = getRole(role);
		const result = _role?.authorize(input.permissions);
		if (result?.success) {
			return true;
		}
	}

	if (roles.length > 1) {
		const resolvedRoles = roles
			.map((r) => getRole(r))
			.filter((r): r is Role<Statements> => Boolean(r));
		if (resolvedRoles.length > 1) {
			const merged = mergeRoles(resolvedRoles);
			return merged.authorize(input.permissions).success;
		}
	}

	return false;
};

export type PermissionExclusive = {
	permissions: { [key: string]: string[] };
};

export type HasPermissionBaseInput = {
	role: string;
	options: OrganizationOptions;
	allowCreatorAllPermissions?: boolean | undefined;
} & PermissionExclusive;
