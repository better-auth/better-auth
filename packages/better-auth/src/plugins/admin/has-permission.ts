import { defaultRoles } from "./access";
import type { AdminOptions } from "./types";

type PermissionExclusive =
	| {
			/**
			 * @deprecated Use `permissions` instead
			 */
			permission: { [key: string]: string[] };
			permissions?: never | undefined;
	  }
	| {
			permissions: { [key: string]: string[] };
			permission?: never | undefined;
	  };

export const hasPermission = (
	input: {
		userId?: string | undefined;
		role?: string | undefined;
		options?: AdminOptions | undefined;
	} & PermissionExclusive,
) => {
	if (input.userId && input.options?.adminUserIds?.includes(input.userId)) {
		return true;
	}
	if (!input.permissions && !input.permission) {
		return false;
	}
	const roles = (input.role || input.options?.defaultRole || "user").split(",");
	const acRoles = input.options?.roles || defaultRoles;
	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(input.permission ?? input.permissions);
		if (result?.success) {
			return true;
		}
	}
	return false;
};
