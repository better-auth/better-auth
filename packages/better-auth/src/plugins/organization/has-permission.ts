import type { OrganizationOptions } from "./types";
import { defaultRoles } from "./access";

type PermissionExclusive =
	| {
			/**
			 * @deprecated Use `permissions` instead
			 */
			permission: { [key: string]: string[] };
			permissions?: never;
	  }
	| {
			permissions: { [key: string]: string[] };
			permission?: never;
	  };

export const hasPermission = (
	input: {
		role: string;
		options: OrganizationOptions;
		allowCreatorAllPermissions?: boolean;
	} & PermissionExclusive,
) => {
	if (!input.permissions && !input.permission) {
		return false;
	}

	const roles = input.role.split(",");
	const acRoles = input.options.roles || defaultRoles;

	const creatorRole = input.options.creatorRole || "owner";
	const isCreator = roles.includes(creatorRole);

	const allowCreatorsAllPermissions = input.allowCreatorAllPermissions || false;
	if (isCreator && allowCreatorsAllPermissions) return true;

	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(input.permissions ?? input.permission);
		if (result?.success) {
			return true;
		}
	}
	return false;
};
