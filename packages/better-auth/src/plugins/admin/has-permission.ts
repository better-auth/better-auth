import type { AuthorizeRequest, Statements } from "../access/types";
import { defaultRoles } from "./access";
import type { AdminOptions } from "./admin";

type PermissionInput = AuthorizeRequest<Statements>;
type PermissionExclusive =
	| {
			/**
			 * @deprecated Use `permissions` instead
			 */
			permission: PermissionInput;
			permissions?: never;
	  }
	| {
			permissions: PermissionInput;
			permission?: never;
	  };

export const hasPermission = (
	input: {
		userId?: string;
		role?: string;
		options?: AdminOptions;
		returnMissingPermissions?: boolean;
	} & PermissionExclusive,
) => {
	if (input.userId && input.options?.adminUserIds?.includes(input.userId)) {
		return true;
	}
	const permissionsToAuthorize = input.permissions ?? input.permission;
	if (!permissionsToAuthorize) {
		return false;
	}
	const roles = (input.role || input.options?.defaultRole || "user").split(",");
	const acRoles = input.options?.roles || defaultRoles;
	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(permissionsToAuthorize);
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
