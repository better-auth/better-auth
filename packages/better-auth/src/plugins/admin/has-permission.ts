import { type Role, mergeRoles } from "../access";
import { defaultRoles } from "./access";
import type { AdminOptions } from "./types";

type PermissionExclusive = {
	permissions: { [key: string]: string[] };
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
	if (!input.permissions) {
		return false;
	}
	const roles = (input.role || input.options?.defaultRole || "user").split(",");
	const acRoles = input.options?.roles || defaultRoles;
	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(input.permissions);
		if (result?.success) {
			return true;
		}
	}

	if (roles.length > 1) {
		const resolvedRoles = roles
			.map((r) => acRoles[r.trim() as keyof typeof acRoles])
			.filter((r): r is Role<any> => Boolean(r));
		if (resolvedRoles.length > 1) {
			const merged = mergeRoles(resolvedRoles);
			return merged.authorize(input.permissions).success;
		}
	}

	return false;
};
