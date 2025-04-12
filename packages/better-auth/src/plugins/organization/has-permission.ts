import { defaultRoles } from "./access";
import type { OrganizationOptions } from "./organization";

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
		returnMissingPermissions?: boolean;
	} & PermissionExclusive,
) => {
	if (!input.permissions && !input.permission) {
		return false;
	}
	const roles = input.role.split(",");
	const acRoles = input.options.roles || defaultRoles;
	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(input.permissions ?? input.permission);
		if (input.returnMissingPermissions) {
			return {
				success: result?.success,
				missingPermissions: result?.missingPermissions ?? null,
			};
		}

		return result?.success ?? false;
	}

	return false;
};
